import { createClient } from "redis";
import webpush from "web-push";

const DEF = {
  systems: ["מערכת א׳", "מערכת ב׳", "מערכת ג׳", "מערכת ד׳", "מערכת ה׳"],
  sections: [
    { name: "מדור פיקוד ובקרה",     people: ["דוד לוי", "רחל כהן", "יוסי מזרחי", "מיכל אברהם"] },
    { name: "מדור תאורת מסלולים",   people: ["אמיר שפירו", "נועה גולן", "עידו פרץ"] },
    { name: "משמרת מסלולים",         people: ["שירה בן-דוד", "רון אלון", "תמר ביטון"] },
  ],
  assignments: [],
  pin: "1234",
};

// singleton connection reused across warm invocations
let _client = null;

async function getClient() {
  if (_client && _client.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on("error", () => { _client = null; });
  await _client.connect();
  return _client;
}

// Setup webpush VAPID if keys are available
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

// Find new assignees compared to previous data
function findNewAssignees(oldData, newData) {
  const oldAssignments = oldData?.assignments || [];
  const newAssignments = newData?.assignments || [];
  const oldIds = new Set(oldAssignments.map(a => a.id));

  const notifications = [];

  for (const a of newAssignments) {
    // Brand new assignment
    if (!oldIds.has(a.id)) {
      const assignees = a.assignees || [];
      for (const name of assignees) {
        notifications.push({
          name,
          title: "שיבוץ חדש 📋",
          body: `שובצת ל${a.system}${a.tasks?.[0] ? ` — ${a.tasks[0]}` : ""}`,
        });
      }
      continue;
    }

    // Existing assignment — find newly added people
    const oldA = oldAssignments.find(o => o.id === a.id);
    if (oldA) {
      const oldPeople = new Set(oldA.assignees || []);
      const newPeople = a.assignees || [];
      for (const name of newPeople) {
        if (!oldPeople.has(name)) {
          notifications.push({
            name,
            title: "שיבוץ חדש 📋",
            body: `שובצת ל${a.system}${a.tasks?.[0] ? ` — ${a.tasks[0]}` : ""}`,
          });
        }
      }
    }
  }

  return notifications;
}

async function sendPushNotifications(redis, notifications) {
  if (!notifications.length) return { sent: 0 };
  if (!setupVapid()) {
    console.error("[push] VAPID not configured — skipping notifications");
    return { sent: 0 };
  }

  let subs = [];
  try {
    const raw = await redis.get("push_subscriptions");
    subs = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("[push] Failed to load subscriptions:", e.message);
    return { sent: 0 };
  }

  if (!subs.length) {
    console.log("[push] No subscriptions found");
    return { sent: 0 };
  }

  const deadEndpoints = [];
  let sent = 0;

  for (const notif of notifications) {
    // Trim whitespace to avoid name mismatch
    const normName = notif.name?.trim();
    const targets = subs.filter(s =>
      s.subscription?.endpoint && s.name?.trim() === normName
    );

    console.log(`[push] "${normName}" → ${targets.length} device(s)`);

    for (const target of targets) {
      try {
        await webpush.sendNotification(
          target.subscription,
          JSON.stringify({ title: notif.title, body: notif.body, tag: "shibutz", url: "/?tab=me" })
        );
        sent++;
        console.log(`[push] ✓ sent to "${normName}"`);
      } catch (err) {
        console.error(`[push] ✗ failed for "${normName}":`, err.statusCode, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          deadEndpoints.push(target.subscription.endpoint);
        }
      }
    }
  }

  // Clean up expired subscriptions
  if (deadEndpoints.length) {
    const cleaned = subs.filter(s => !deadEndpoints.includes(s.subscription?.endpoint));
    await redis.set("push_subscriptions", JSON.stringify(cleaned)).catch(() => {});
    console.log(`[push] Removed ${deadEndpoints.length} expired subscription(s)`);
  }

  return { sent };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let redis;
  try {
    redis = await getClient();
  } catch (e) {
    return res.status(500).json({ error: "db connect failed", detail: e.message });
  }

  if (req.method === "GET") {
    try {
      const raw = await redis.get("assignments_main");
      return res.json(raw ? JSON.parse(raw) : DEF);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "PUT") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") return res.status(400).json({ error: "invalid body" });

      // Get old data for diffing
      let oldData = null;
      try {
        const raw = await redis.get("assignments_main");
        oldData = raw ? JSON.parse(raw) : null;
      } catch (_) {}

      // Save new data
      await redis.set("assignments_main", JSON.stringify(body));

      // Send push notifications for new assignees — must await before returning!
      // Vercel kills the function the moment res.json() is called,
      // so fire-and-forget would silently drop every notification.
      if (oldData) {
        const notifications = findNewAssignees(oldData, body);
        if (notifications.length) {
          await sendPushNotifications(redis, notifications);
        }
      }

      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
