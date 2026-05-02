import { kv } from "@vercel/kv";

const DEF = {
  systems: ["מערכת א׳", "מערכת ב׳", "מערכת ג׳", "מערכת ד׳", "מערכת ה׳"],
  people: [
    "דוד לוי", "רחל כהן", "יוסי מזרחי", "מיכל אברהם", "אמיר שפירו",
    "נועה גולן", "עידו פרץ", "שירה בן-דוד", "רון אלון", "תמר ביטון",
  ],
  assignments: [],
  pin: "1234",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const data = await kv.get("assignments_main");
      return res.json(data || DEF);
    } catch {
      return res.json(DEF);
    }
  }

  if (req.method === "PUT") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "invalid body" });
      }
      await kv.set("assignments_main", body);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
