// api/proxy.js
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

// Rate Limit: 1 minute me max 10 requests (Scraping rokne ke liye)
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:proxy",
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { key, number } = req.query;
  if (!key) return res.status(400).json({ success: false, error: "API Key missing" });
  if (!number) return res.status(400).json({ success: false, error: "Vehicle number missing" });

  // 1. RATE LIMIT CHECK
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1";
  const { success: rlSuccess } = await ratelimit.limit(`proxy_${ip}`);
  if (!rlSuccess) {
    return res.status(429).json({ success: false, error: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait." });
  }

  // 2. REDIS SE KEY CHECK
  try {
    const dataStr = await redis.get(key);
    if (!dataStr) {
      return res.status(403).json({ success: false, error: "KEY_EXPIRED_OR_INVALID", message: "Invalid or expired API key." });
    }

    // 🔥 FIX: Data object ya string dono handle karo
    let parsedData;
    if (typeof dataStr === 'string') {
        parsedData = JSON.parse(dataStr);
    } else {
        parsedData = dataStr; // Already an object
    }

    const { url, exp, note } = parsedData; // note bhi nikal lo (agar future me kaam aaye)

    if (Date.now() > exp) {
      return res.status(403).json({ success: false, error: "KEY_EXPIRED", message: "This API key has expired." });
    }

    // 3. MAIN API CALL
    const finalFetchUrl = `${url}?number=${number}`;
    const response = await fetch(finalFetchUrl);
    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {
    console.error("Proxy Error:", err); // Vercel logs me asli error dikhega
    return res.status(500).json({ success: false, error: "Server Error", message: "Internal processing failed." });
  }
}
