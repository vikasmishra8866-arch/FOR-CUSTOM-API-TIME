// api/proxy.js
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ success: false, error: "API Key missing" });
  }

  try {
    // 1. Redis se key check karo
    const dataStr = await redis.get(key);

    // 2. Agar data nahi mila -> matlab key galat hai ya expire ho gayi
    if (!dataStr) {
      return res.status(403).json({ 
        success: false, 
        error: "KEY_EXPIRED_OR_INVALID", 
        message: "This API key is invalid or has expired." 
      });
    }

    // 3. Data decode karo
    const { url, exp } = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;

    // Double check expiry
    if (Date.now() > exp) {
      return res.status(403).json({ success: false, error: "KEY_EXPIRED" });
    }

    // 4. Original API ko call karo
    const response = await fetch(url);
    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ success: false, error: "Server Error" });
  }
}
