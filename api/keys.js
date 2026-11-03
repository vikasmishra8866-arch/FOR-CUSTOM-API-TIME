// api/keys.js
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const PANEL_PASSWORD = "EliteAdmin@2026";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-panel-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.headers["x-panel-secret"] !== PANEL_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // GET: Saari keys list karo
  if (req.method === "GET") {
    try {
      const keys = await redis.keys("veh_*");
      const results = [];
      for (const key of keys) {
        const data = await redis.get(key);
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        results.push({ key, ...parsed });
      }
      return res.status(200).json({ keys: results });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch keys" });
    }
  }

  // POST: Key ko cancel (delete) karo
  if (req.method === "POST") {
    const { keyToDelete } = req.body;
    if (!keyToDelete) return res.status(400).json({ error: "Key required" });
    try {
      await redis.del(keyToDelete);
      return res.status(200).json({ success: true, message: "Key revoked successfully" });
    } catch (err) {
      return res.status(500).json({ error: "Failed to revoke key" });
    }
  }
}
