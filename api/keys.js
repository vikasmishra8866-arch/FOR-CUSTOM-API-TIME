// api/keys.js
import { Redis } from "@upstash/redis";

let redis;
try { redis = Redis.fromEnv(); } catch (e) { console.error(e); }

const PANEL_PASSWORD = "EliteAdmin@2026";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-panel-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!redis) return res.status(500).json({ error: "DB not configured" });
  if (req.headers["x-panel-secret"] !== PANEL_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  // GET: List Keys
  if (req.method === "GET") {
    try {
      const keys = await redis.keys("veh_*");
      const results = [];
      for (const key of keys) {
        const data = await redis.get(key);
        if (!data) continue;
        let parsed = data;
        if (typeof data === 'string') {
            try { parsed = JSON.parse(data); } catch(e) { continue; }
        }
        results.push({ key, ...parsed });
      }
      return res.status(200).json({ keys: results });
    } catch (err) {
      console.error("Keys fetch error:", err);
      return res.status(500).json({ error: "Failed to fetch keys" });
    }
  }

  // POST: Revoke Key
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
    const { keyToDelete } = body || {};

    if (!keyToDelete) return res.status(400).json({ error: "Key required" });
    try {
      await redis.del(keyToDelete);
      return res.status(200).json({ success: true, message: "Key revoked successfully" });
    } catch (err) {
      console.error("Delete error:", err);
      return res.status(500).json({ error: "Failed to revoke key" });
    }
  }
}
