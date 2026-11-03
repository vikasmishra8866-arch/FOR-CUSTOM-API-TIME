// api/proxy.js
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let redis, ratelimit;
try {
  redis = Redis.fromEnv();
  ratelimit = new Ratelimit({ redis: redis, limiter: Ratelimit.slidingWindow(10, "60 s"), analytics: true, prefix: "ratelimit:proxy" });
} catch (e) { console.error(e); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!redis) return res.status(500).json({ success: false, error: "DB_NOT_CONFIGURED" });

  const { key, number } = req.query;
  if (!key) return res.status(400).json({ success: false, error: "API Key missing" });
  if (!number) return res.status(400).json({ success: false, error: "Vehicle number missing" });

  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1";
    const { success: rlSuccess } = await ratelimit.limit(`proxy_${ip}`);
    if (!rlSuccess) return res.status(429).json({ success: false, error: "TOO_MANY_REQUESTS" });

    const dataStr = await redis.get(key);
    if (!dataStr) return res.status(403).json({ success: false, error: "KEY_INVALID" });

    let parsedData = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
    const { url, exp } = parsedData;
    
    if (!url) return res.status(500).json({ success: false, error: "NO_URL_FOUND" });
    if (Date.now() > exp) return res.status(403).json({ success: false, error: "KEY_EXPIRED" });

    let targetUrl = url.startsWith('http') ? url : `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}${url.startsWith('/') ? '' : '/'}${url}`;
    const finalFetchUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}number=${number}`;
    
    const response = await fetch(finalFetchUrl, { headers: { "Accept": "application/json" } });
    
    if (!response.ok) {
        throw new Error(`Upstream API returned ${response.status}. Check if vehicle.js is working or original API is down.`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("PROXY ERROR:", err);
    return res.status(502).json({ success: false, error: "INTERNAL_ERROR", message: err.message });
  }
}
