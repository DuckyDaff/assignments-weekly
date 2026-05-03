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
  res.setHeader("Access-Control-Allow-Methods", "POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let redis;
  try { redis = await getClient(); } catch (e) {
    return res.status(500).json({ error: "db connect failed" });
  }

  const loadSubs = async () => {
    try {
      const raw = await redis.get("push_subscriptions");
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  };
  const saveSubs = async (arr) => {
    await redis.set("push_subscriptions", JSON.stringify(arr.slice(-500)));
  };

  // Save / update subscription
  if (req.method === "POST") {
    const { subscription, name, reminders } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "missing subscription" });
    }

    const subs = await loadSubs();
    const filtered = subs.filter(s => s.subscription?.endpoint !== subscription.endpoint);
    filtered.push({
      subscription,
      name: name || "",
      reminders: reminders !== false,   // default true
      savedAt: Date.now(),
    });
    await saveSubs(filtered);
    return res.status(200).json({ ok: true });
  }

  // Update preferences (reminders toggle) without re-subscribing
  if (req.method === "PATCH") {
    const { endpoint, reminders } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "missing endpoint" });

    const subs = await loadSubs();
    const updated = subs.map(s =>
      s.subscription?.endpoint === endpoint
        ? { ...s, reminders: Boolean(reminders) }
        : s
    );
    await saveSubs(updated);
    return res.status(200).json({ ok: true });
  }

  // Remove subscription (unsubscribe)
  if (req.method === "DELETE") {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "missing endpoint" });

    const subs = await loadSubs();
    await saveSubs(subs.filter(s => s.subscription?.endpoint !== endpoint));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "method not allowed" });
}
