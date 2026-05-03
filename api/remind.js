import { createClient } from "redis";
import webpush from "web-push";

let _client = null;
async function getClient() {
  if (_client && _client.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on("error", () => { _client = null; });
  await _client.connect();
  return _client;
}

function setupVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:admin@app.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return true;
  }
  return false;
}

// Israel DST: last Sunday of March → last Sunday of October → UTC+3, otherwise UTC+2
function getIsraelOffset(date) {
  const y = date.getUTCFullYear();
  // Last Sunday of March
  const mar31 = new Date(Date.UTC(y, 2, 31));
  const dstStart = new Date(mar31);
  dstStart.setUTCDate(31 - mar31.getUTCDay()); // go back to last Sunday
  // Last Sunday of October
  const oct31 = new Date(Date.UTC(y, 9, 31));
  const dstEnd = new Date(oct31);
  dstEnd.setUTCDate(31 - oct31.getUTCDay());
  return date >= dstStart && date < dstEnd ? 3 : 2;
}

// Get Israeli day key for a given Date
function dayKeyOf(date) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
}

// Get Israeli week key (Sunday-based)
function wKey(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - d.getDay());
  const y = d.getFullYear();
  const w = Math.ceil(((d - new Date(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  // Allow Vercel cron (GET) or manual test trigger (POST)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Manual POST requires secret header
  if (req.method === "POST") {
    const secret = process.env.REMIND_SECRET;
    if (secret && req.headers["x-remind-secret"] !== secret) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  if (!setupVapid()) {
    return res.status(500).json({ error: "VAPID not configured" });
  }

  let redis;
  try { redis = await getClient(); } catch (e) {
    return res.status(500).json({ error: "db connect failed" });
  }

  // Compute Israel time
  const nowUtc = new Date();
  const israelOffset = getIsraelOffset(nowUtc); // 2 or 3
  const nowIsrael = new Date(nowUtc.getTime() + israelOffset * 3600 * 1000);
  const israelHour = nowIsrael.getUTCHours(); // hour in Israel time

  // Only send between 06:30–07:30 Israel time (crons run at 4:00 and 5:00 UTC)
  // In summer (UTC+3): 4 UTC → 7 Israel ✓, 5 UTC → 8 Israel ✗
  // In winter (UTC+2): 4 UTC → 6 Israel ✗, 5 UTC → 7 Israel ✓
  const israelMinute = nowIsrael.getUTCMinutes();
  const totalMinutes = israelHour * 60 + israelMinute;
  const windowStart  = 6 * 60 + 30;  // 06:30
  const windowEnd    = 7 * 60 + 30;  // 07:30

  // For manual POST triggers, skip the time window check
  if (req.method === "GET" && (totalMinutes < windowStart || totalMinutes > windowEnd)) {
    return res.json({
      ok: true, skipped: "outside_window",
      israelTime: `${israelHour}:${String(israelMinute).padStart(2,"0")}`,
      offset: `UTC+${israelOffset}`
    });
  }

  // Dedup: only send once per day (in case both crons fall in window)
  const todayStr = nowIsrael.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dedupKey = `remind_sent:${todayStr}`;
  try {
    const alreadySent = await redis.get(dedupKey);
    if (alreadySent) {
      return res.json({ ok: true, skipped: "already_sent_today", date: todayStr });
    }
  } catch (_) {}

  const todayKey = dayKeyOf(nowIsrael);
  const weekKey  = wKey(nowIsrael);

  // Skip Shabbat
  if (todayKey === "sat") {
    return res.json({ ok: true, skipped: "shabbat", sent: 0 });
  }

  // Load data
  let data;
  try {
    const raw = await redis.get("assignments_main");
    data = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return res.status(500).json({ error: "failed to read data" });
  }
  if (!data) return res.json({ ok: true, sent: 0, reason: "no data" });

  // Load subscriptions with reminders enabled
  let subs = [];
  try {
    const raw = await redis.get("push_subscriptions");
    subs = raw ? JSON.parse(raw) : [];
  } catch (_) {}

  const activeSubs = subs.filter(s => s.reminders !== false && s.subscription?.endpoint);

  if (!activeSubs.length) {
    return res.json({ ok: true, sent: 0, reason: "no active subscriptions" });
  }

  // Find today's assignments
  const weekAssignments = (data.assignments || []).filter(a => a.week === weekKey);
  const todayAssignments = weekAssignments.filter(a =>
    !a.days || a.days.length === 0 || a.days.includes(todayKey)
  );

  if (!todayAssignments.length) {
    return res.json({ ok: true, sent: 0, reason: "no assignments today" });
  }

  // Build per-person map
  const personMap = {};
  for (const a of todayAssignments) {
    for (const name of (a.assignees || [])) {
      if (!personMap[name]) personMap[name] = [];
      personMap[name].push({ system: a.system, tasks: a.tasks || [] });
    }
  }

  const DAY_NAMES = { sun: "ראשון", mon: "שני", tue: "שלישי", wed: "רביעי", thu: "חמישי", fri: "שישי" };
  const deadEndpoints = [];
  let sent = 0;

  for (const [name, assignments] of Object.entries(personMap)) {
    const targets = activeSubs.filter(s => s.name === name);
    if (!targets.length) continue;

    const systems = assignments.map(a => a.system).join(", ");
    const firstTask = assignments[0]?.tasks?.[0];
    const body = firstTask ? `${systems} — ${firstTask}` : systems;

    const payload = JSON.stringify({
      title: `📋 תזכורת יום ${DAY_NAMES[todayKey] || ""}`,
      body,
      tag: "reminder-today",
    });

    for (const target of targets) {
      try {
        await webpush.sendNotification(target.subscription, payload);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          deadEndpoints.push(target.subscription.endpoint);
        }
      }
    }
  }

  // Mark as sent today (expire after 20 hours)
  await redis.set(dedupKey, "1", { EX: 72000 }).catch(() => {});

  // Clean dead subscriptions
  if (deadEndpoints.length) {
    const cleaned = subs.filter(s => !deadEndpoints.includes(s.subscription?.endpoint));
    await redis.set("push_subscriptions", JSON.stringify(cleaned)).catch(() => {});
  }

  return res.json({
    ok: true, sent,
    today: todayKey, week: weekKey,
    israelTime: `${israelHour}:${String(israelMinute).padStart(2,"0")}`,
    offset: `UTC+${israelOffset}`,
    peopleWithAssignments: Object.keys(personMap).length
  });
}
