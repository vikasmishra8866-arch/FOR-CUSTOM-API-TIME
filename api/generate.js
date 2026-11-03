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
    // Yahan hum URL se ?number=... hata denge taaki base URL save ho
    // Example: https://vehicle-api-coral.vercel.app/api/vehicle
    const baseApiUrl = apiUrl.split('?')[0]; 

    const shortKey = "veh_" + crypto.randomBytes(4).toString("hex");
    const seconds = parseInt(days) * 24 * 60 * 60;
    const expiryMs = Date.now() + (seconds * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    await redis.setex(shortKey, seconds, JSON.stringify({ url: baseApiUrl, exp: expiryMs }));

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    // Final URL me hum customer ke liye &number= bhi jod denge
    const finalUrl = `${protocol}://${host}/api/proxy?key=${shortKey}&number=GJ05MS9717`;

    return res.status(200).json({ 
      success: true, 
      url: finalUrl, 
      key: shortKey,
      expiry: expiryDate
    });

  } catch (err) {
    return res.status(500).json({ error: "Failed to generate URL" });
  }
}
