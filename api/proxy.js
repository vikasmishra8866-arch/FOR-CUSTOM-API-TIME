// api/proxy.js
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let redis, ratelimit;
try {
  redis = Redis.fromEnv();
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
    return res.status(500).json({ success: false, error: "DB_NOT_CONFIGURED", message: "Database not connected." });
  }

  const { key, number } = req.query;
  if (!key) return res.status(400).json({ success: false, error: "API Key missing" });
  if (!number) return res.status(400).json({ success: false, error: "Vehicle number missing" });

  // Rate Limit
  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1";
    const { success: rlSuccess } = await ratelimit.limit(`proxy_${ip}`);
    if (!rlSuccess) {
      return res.status(429).json({ success: false, error: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a minute." });
    }
  } catch (rlError) {
    console.error("Rate Limit Error:", rlError);
  }

  // Redis se Key Check
  try {
    const dataStr = await redis.get(key);
    if (!dataStr) {
      return res.status(403).json({ success: false, error: "KEY_INVALID", message: "Invalid or expired API key." });
    }

    let parsedData = dataStr;
    if (typeof dataStr === 'string') {
        try { parsedData = JSON.parse(dataStr); } catch (e) {
            return res.status(500).json({ success: false, error: "DATA_CORRUPTED" });
        }
    }

    const { url, exp } = parsedData;
    if (!url) return res.status(500).json({ success: false, error: "NO_URL_FOUND" });
    if (Date.now() > exp) {
      return res.status(403).json({ success: false, error: "KEY_EXPIRED", message: "This API key has expired." });
    }

    // 🔥 FIX: Base URL sahi se banao
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    
    // Agar 'url' relative path hai (jaise /api/vehicle), to host add karo
    let targetUrl;
    if (url.startsWith('http')) {
        targetUrl = url;
    } else {
        targetUrl = `${protocol}://${host}${url}`;
    }

    const separator = targetUrl.includes('?') ? '&' : '?';
    const finalFetchUrl = `${targetUrl}${separator}number=${number}`;
    
    console.log("🔍 PROXY FETCHING URL:", finalFetchUrl); // Debug ke liye

    const response = await fetch(finalFetchUrl);
    
    // 🔥 FIX: Agar 404 aaye to saaf message do, HTML parse mat karo
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`Upstream API not found at ${finalFetchUrl}. Check if the endpoint exists and deployment protection is off.`);
        }
        throw new Error(`Upstream responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("❌ PROXY FATAL ERROR:", err); 
    return res.status(500).json({ 
        success: false, 
        error: "INTERNAL_ERROR", 
        message: err.message || "Something went wrong." 
    });
  }
}
