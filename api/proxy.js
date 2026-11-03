// api/proxy.js
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let redis, ratelimit;

try {
  redis = Redis.fromEnv();
  // Rate Limit: 1 minute me max 10 requests
  ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    analytics: true,
    prefix: "ratelimit:proxy",
  });
} catch (initError) {
  console.error("❌ REDIS INIT FAILED:", initError);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!redis) {
    return res.status(500).json({ success: false, error: "DB_NOT_CONFIGURED", message: "Database not connected. Check Vercel env vars." });
  }

  const { key, number } = req.query;
  if (!key) return res.status(400).json({ success: false, error: "API Key missing" });
  if (!number) return res.status(400).json({ success: false, error: "Vehicle number missing" });

  // 1. Rate Limit Check
  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1";
    const { success: rlSuccess } = await ratelimit.limit(`proxy_${ip}`);
    if (!rlSuccess) {
      return res.status(429).json({ success: false, error: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a minute." });
    }
  } catch (rlError) {
    console.error("Rate Limit Error:", rlError);
    // Rate limit fail ho jaye to bhi API na ruke
  }

  // 2. Redis se Key Check
  try {
    const dataStr = await redis.get(key);
    if (!dataStr) {
      return res.status(403).json({ success: false, error: "KEY_INVALID", message: "Invalid or expired API key." });
    }

    // 🔥 SAFE PARSING: Object ya String dono handle karega
    let parsedData = dataStr;
    if (typeof dataStr === 'string') {
        try {
            parsedData = JSON.parse(dataStr);
        } catch (parseError) {
            console.error("JSON Parse Error on key:", key, parseError);
            return res.status(500).json({ success: false, error: "DATA_CORRUPTED", message: "Stored key data is invalid." });
        }
    }

    const { url, exp } = parsedData;
    if (!url) return res.status(500).json({ success: false, error: "NO_URL_FOUND", message: "No API URL linked to this key." });

    if (Date.now() > exp) {
      return res.status(403).json({ success: false, error: "KEY_EXPIRED", message: "This API key has expired." });
    }

    // 3. Main API Call
    const separator = url.includes('?') ? '&' : '?';
    const finalFetchUrl = `${url}${separator}number=${number}`;
    
    const response = await fetch(finalFetchUrl);
    if (!response.ok) {
        throw new Error(`Upstream responded with status ${response.status}`);
    }
    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {
    // 🔥 Yahan asli error print hoga Vercel Logs me
    console.error("❌ PROXY FATAL ERROR:", err); 
    return res.status(500).json({ 
        success: false, 
        error: "INTERNAL_ERROR", 
        message: "Something went wrong while processing your request." 
    });
  }
}
