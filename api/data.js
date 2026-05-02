import { createClient } from "redis";

const DEF = {
  systems: ["מערכת א׳", "מערכת ב׳", "מערכת ג׳", "מערכת ד׳", "מערכת ה׳"],
  people: [
    "דוד לוי", "רחל כהן", "יוסי מזרחי", "מיכל אברהם", "אמיר שפירו",
    "נועה גולן", "עידו פרץ", "שירה בן-דוד", "רון אלון", "תמר ביטון",
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
      await redis.set("assignments_main", JSON.stringify(body));
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
