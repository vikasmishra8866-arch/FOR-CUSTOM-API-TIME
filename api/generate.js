// api/generate.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { apiUrl, days } = req.body;

  if (!apiUrl || !days) {
    return res.status(400).json({ error: "API URL and days are required" });
  }

  try {
    // 1. Choti aur unique API Key banao (e.g. veh_8f4a2b9c)
    const shortKey = "veh_" + crypto.randomBytes(4).toString("hex");

    // 2. Expiry calculate karo (seconds me)
    const seconds = parseInt(days) * 24 * 60 * 60;
    const expiryMs = Date.now() + (seconds * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // 3. Redis me save karo (Key -> URL, Expiry)
    // Redis automatically is key ko diye gaye seconds ke baad delete kar dega!
    await redis.setex(shortKey, seconds, JSON.stringify({ url: apiUrl, exp: expiryMs }));

    // 4. Nayi choti URL banao
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const finalUrl = `${protocol}://${host}/api/proxy?key=${shortKey}`;

    return res.status(200).json({ 
      success: true, 
      url: finalUrl, 
      key: shortKey,
      expiry: expiryDate,
      days: days
    });

  } catch (err) {
    return res.status(500).json({ error: "Failed to generate URL" });
  }
}
