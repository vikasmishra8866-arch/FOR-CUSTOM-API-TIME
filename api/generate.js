// api/generate.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

let redis;
try { redis = Redis.fromEnv(); } catch (e) { console.error("Redis Init Error:", e); }

const PANEL_PASSWORD = "EliteAdmin@2026"; // Aapka password

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-panel-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!redis) return res.status(500).json({ error: "Database not configured" });
  if (req.headers["x-panel-secret"] !== PANEL_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  
  const { apiUrl, duration, unit, note } = body || {};

  if (!apiUrl || !duration) {
    return res.status(400).json({ error: "API URL and duration are required" });
  }

  try {
    // 🔥 FIX: Ab chahe full URL ho ya relative path, ye handle kar lega
    let baseApiUrl = apiUrl;
    if (apiUrl.startsWith('http')) {
        const parsedUrl = new URL(apiUrl);
        baseApiUrl = parsedUrl.origin + parsedUrl.pathname;
    } else {
        // Agar /api/vehicle hai, to bas query param hata do
        baseApiUrl = apiUrl.split('?')[0];
    }

    const shortKey = "veh_" + crypto.randomBytes(4).toString("hex");
    
    let seconds = unit === 'minutes' ? parseInt(duration) * 60 : parseInt(duration) * 24 * 60 * 60;
    const expiryMs = Date.now() + (seconds * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const payload = { url: baseApiUrl, exp: expiryMs, note: note || "No note provided" };
    await redis.setex(shortKey, seconds, JSON.stringify(payload));

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const finalUrl = `${protocol}://${host}/api/proxy?key=${shortKey}&number=GJ05MS9717`;

    return res.status(200).json({ success: true, url: finalUrl, key: shortKey, expiry: expiryDate, note });
  } catch (err) {
    console.error("Generate Error:", err);
    return res.status(500).json({ error: "Failed to generate URL." });
  }
}
