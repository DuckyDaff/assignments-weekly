import { createClient } from "redis";

let _client = null;
async function getClient() {
  if (_client && _client.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on("error", () => { _client = null; });
  await _client.connect();
  return _client;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let redis;
  try { redis = await getClient(); } catch (e) {
    return res.status(500).json({ error: "db connect failed" });
  }

  // Save subscription
  if (req.method === "POST") {
    const { subscription, name } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "missing subscription" });
    }

    let subs = [];
    try {
      const raw = await redis.get("push_subscriptions");
      subs = raw ? JSON.parse(raw) : [];
    } catch (_) {}

    // Remove old entry for same endpoint, then add new
    const filtered = subs.filter(s => s.subscription?.endpoint !== subscription.endpoint);
    filtered.push({ subscription, name: name || "", savedAt: Date.now() });

    // Keep max 500
    const trimmed = filtered.slice(-500);
    await redis.set("push_subscriptions", JSON.stringify(trimmed));
    return res.status(200).json({ ok: true });
  }

  // Remove subscription (unsubscribe)
  if (req.method === "DELETE") {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "missing endpoint" });

    let subs = [];
    try {
      const raw = await redis.get("push_subscriptions");
      subs = raw ? JSON.parse(raw) : [];
    } catch (_) {}

    const filtered = subs.filter(s => s.subscription?.endpoint !== endpoint);
    await redis.set("push_subscriptions", JSON.stringify(filtered));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
