import { createClient } from "redis";

let _client = null;
async function getClient() {
  if (_client && _client.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on("error", () => { _client = null; });
  await _client.connect();
  return _client;
}

const REDIS_KEY = "annual_plan";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let redis;
  try {
    redis = await getClient();
  } catch (e) {
    return res.status(500).json({ error: "db connect failed", detail: e.message });
  }

  // ── GET: return full annual plan ──────────────────────────────
  if (req.method === "GET") {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (!raw) return res.status(404).json({ error: "no_data" });
      return res.json(JSON.parse(raw));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── PUT: replace entire annual plan (import script) ───────────
  if (req.method === "PUT") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.year || !body?.days) return res.status(400).json({ error: "invalid body" });
      await redis.set(REDIS_KEY, JSON.stringify(body));
      return res.json({ ok: true, days: Object.keys(body.days).length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── PATCH: update one day's data (in-app edits) ───────────────
  if (req.method === "PATCH") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      // body: { date: "2026-01-15", statuses, notes, vehicles, workDay, workNight }
      if (!body?.date) return res.status(400).json({ error: "missing date" });

      const raw = await redis.get(REDIS_KEY);
      const plan = raw ? JSON.parse(raw) : { year: 2026, sections: [], days: {} };

      const existing = plan.days[body.date] || {};
      plan.days[body.date] = { ...existing, ...body };
      delete plan.days[body.date].date; // don't store date twice

      await redis.set(REDIS_KEY, JSON.stringify(plan));
      return res.json({ ok: true, date: body.date });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
