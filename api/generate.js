// api/generate.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-panel-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 🔥 PANEL SECRET CHECK (Security)
  const PANEL_PASSWORD = "EliteAdmin@2026"; // Apna password yahan set karo
  if (req.headers["x-panel-secret"] !== PANEL_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized access." });
  }

  const { apiUrl, duration, unit, note } = req.body; // Ab unit aur note bhi aayega

  if (!apiUrl || !duration) {
    return res.status(400).json({ error: "API URL and duration are required" });
  }

  try {
    const baseApiUrl = apiUrl.split('?')[0]; 
    const shortKey = "veh_" + crypto.randomBytes(4).toString("hex");
    
    // 🔥 Time calculate karo (Days ya Minutes)
    let seconds = 0;
    if (unit === 'minutes') {
        seconds = parseInt(duration) * 60;
    } else {
        seconds = parseInt(duration) * 24 * 60 * 60; // Days
    }
    
    const expiryMs = Date.now() + (seconds * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // 🔥 Redis me save karo (Note ke sath)
    const payload = { 
        url: baseApiUrl, 
        exp: expiryMs,
        note: note || "No note provided" 
    };
    await redis.setex(shortKey, seconds, JSON.stringify(payload));

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const finalUrl = `${protocol}://${host}/api/proxy?key=${shortKey}&number=GJ05MS9717`;

    return res.status(200).json({ 
      success: true, 
      url: finalUrl, 
      key: shortKey,
      expiry: expiryDate,
      note: note
    });

  } catch (err) {
    console.error("Generate Error:", err);
    return res.status(500).json({ error: "Failed to generate URL" });
  }
}
