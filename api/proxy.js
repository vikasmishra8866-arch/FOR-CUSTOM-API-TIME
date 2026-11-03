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

  if (!redis) return res.status(500).json({ success: false, error: "DB_NOT_CONFIGURED" });

  const { key, number } = req.query;
  if (!key) return res.status(400).json({ success: false, error: "API Key missing" });
  if (!number) return res.status(400).json({ success: false, error: "Vehicle number missing" });

  try {
    const dataStr = await redis.get(key);
    if (!dataStr) return res.status(403).json({ success: false, error: "KEY_INVALID" });

    let parsedData = dataStr;
    if (typeof dataStr === 'string') {
        try { parsedData = JSON.parse(dataStr); } catch (e) { return res.status(500).json({ success: false, error: "DATA_CORRUPTED" }); }
    }

    const { url, exp } = parsedData;
    if (!url) return res.status(500).json({ success: false, error: "NO_URL_FOUND" });
    if (Date.now() > exp) return res.status(403).json({ success: false, error: "KEY_EXPIRED", message: "This API key has expired." });

    // 🔥 SMART URL RESOLVER
    let targetUrl;
    if (url.startsWith('http')) {
        targetUrl = url; 
    } else {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host;
        // Agar URL '/api/vehicle' hai, to ye 'https://api-v2-nu.vercel.app/api/vehicle' bana dega
        targetUrl = `${protocol}://${host}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    const separator = targetUrl.includes('?') ? '&' : '?';
    const finalFetchUrl = `${targetUrl}${separator}number=${number}`;
    
    console.log("🔍 PROXY FETCHING URL:", finalFetchUrl);

    const response = await fetch(finalFetchUrl);
    
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`404 Error: The API at "${finalFetchUrl}" does not exist.`);
        }
        throw new Error(`Upstream API error (Status: ${response.status})`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("❌ PROXY FATAL ERROR:", err); 
    return res.status(500).json({ success: false, error: "INTERNAL_ERROR", message: err.message });
  }
}
