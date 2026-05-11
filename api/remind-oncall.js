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

// Israel DST helpers (same as remind.js)
function getIsraelOffset(date) {
  const y = date.getUTCFullYear();
  const mar31 = new Date(Date.UTC(y, 2, 31));
  const dstStart = new Date(mar31);
  dstStart.setUTCDate(31 - mar31.getUTCDay());
  const oct31 = new Date(Date.UTC(y, 9, 31));
  const dstEnd = new Date(oct31);
  dstEnd.setUTCDate(31 - oct31.getUTCDay());
  return date >= dstStart && date < dstEnd ? 3 : 2;
}

// כוננות codes to check in both status slots
const ONCALL_CODES = new Set(['כ', 'כש', 'כמ', 'כמש']);

function hasOncall(dayData, person) {
  const s1 = dayData?.statuses?.[person]  || '';
  const s2 = dayData?.statuses2?.[person] || '';
  return ONCALL_CODES.has(s1) || ONCALL_CODES.has(s2);
}

function getOncallCode(dayData, person) {
  const s1 = dayData?.statuses?.[person]  || '';
  const s2 = dayData?.statuses2?.[person] || '';
  return ONCALL_CODES.has(s2) ? s2 : s1;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "method not allowed" });
  }

  // Manual POST requires secret
  if (req.method === "POST") {
    const secret = process.env.REMIND_SECRET;
    if (secret && req.headers["x-remind-secret"] !== secret) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  if (!setupVapid()) return res.status(500).json({ error: "VAPID not configured" });

  let redis;
  try { redis = await getClient(); } catch (e) {
    return res.status(500).json({ error: "db connect failed" });
  }

  // Compute Israel time
  const nowUtc    = new Date();
  const offset    = getIsraelOffset(nowUtc);           // 2 or 3
  const nowIL     = new Date(nowUtc.getTime() + offset * 3600 * 1000);
  const ilHour    = nowIL.getUTCHours();
  const ilMinute  = nowIL.getUTCMinutes();
  const totalMin  = ilHour * 60 + ilMinute;

  // Window: 17:00–18:00 Israel time
  // Crons at 14:30 UTC (→17:30 summer) and 15:30 UTC (→17:30 winter)
  const WIN_START = 17 * 60;       // 17:00
  const WIN_END   = 18 * 60;       // 18:00

  if (req.method === "GET" && (totalMin < WIN_START || totalMin >= WIN_END)) {
    return res.json({
      ok: true, skipped: "outside_window",
      israelTime: `${ilHour}:${String(ilMinute).padStart(2, "0")}`,
      offset: `UTC+${offset}`,
    });
  }

  // Dedup — send once per day
  const todayStr  = nowIL.toISOString().slice(0, 10);
  const dedupKey  = `remind_oncall_sent:${todayStr}`;
  try {
    const sent = await redis.get(dedupKey);
    if (sent) return res.json({ ok: true, skipped: "already_sent_today", date: todayStr });
  } catch (_) {}

  // Skip Shabbat
  const dow = nowIL.getUTCDay(); // 0=Sun … 6=Sat
  if (dow === 6) return res.json({ ok: true, skipped: "shabbat" });

  // Load annual plan
  let annual;
  try {
    const raw = await redis.get("annual_plan");
    annual = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return res.status(500).json({ error: "failed to read annual plan" });
  }
  if (!annual?.days) return res.json({ ok: true, sent: 0, reason: "no annual data" });

  const dayData = annual.days[todayStr] || {};

  // Collect people with כוננות today
  const oncallPeople = [];
  const statuses  = dayData.statuses  || {};
  const statuses2 = dayData.statuses2 || {};
  const allPeople = new Set([...Object.keys(statuses), ...Object.keys(statuses2)]);
  for (const person of allPeople) {
    if (hasOncall(dayData, person)) oncallPeople.push(person);
  }

  if (!oncallPeople.length) {
    await redis.set(dedupKey, "1", { EX: 72000 }).catch(() => {});
    return res.json({ ok: true, sent: 0, reason: "no oncall people today" });
  }

  // Load subscriptions with oncallReminders enabled
  let subs = [];
  try {
    const raw = await redis.get("push_subscriptions");
    subs = raw ? JSON.parse(raw) : [];
  } catch (_) {}

  const activeSubs = subs.filter(s => s.oncallReminders === true && s.subscription?.endpoint);
  if (!activeSubs.length) {
    await redis.set(dedupKey, "1", { EX: 72000 }).catch(() => {});
    return res.json({ ok: true, sent: 0, reason: "no subscriptions with oncallReminders" });
  }

  const deadEndpoints = [];
  let sent = 0;

  for (const person of oncallPeople) {
    const targets = activeSubs.filter(s => s.name?.trim() === person.trim());
    if (!targets.length) continue;

    const code = getOncallCode(dayData, person);
    const label = code === 'כש' ? 'כוננות שבת'
                : code === 'כמ' ? 'כוננות מחליף'
                : code === 'כמש' ? 'כוננות מחליף שבת'
                : 'כוננות';

    const payload = JSON.stringify({
      title: `🔔 תזכורת כוננות — היום`,
      body: `אתה ${label} היום. בהצלחה!`,
      tag: "remind-oncall",
      url: "/?tab=me",
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

  // Mark sent + cleanup
  await redis.set(dedupKey, "1", { EX: 72000 }).catch(() => {});
  if (deadEndpoints.length) {
    const cleaned = subs.filter(s => !deadEndpoints.includes(s.subscription?.endpoint));
    await redis.set("push_subscriptions", JSON.stringify(cleaned)).catch(() => {});
  }

  return res.json({ ok: true, sent, oncallPeople, date: todayStr });
}
