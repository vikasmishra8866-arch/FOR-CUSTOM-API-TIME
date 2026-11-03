// api/generate.js
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-panel-secret"); // Header allow karo

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 🔥 HEADER CHECK: Sirf panel se aane wali request allow karo
  if (req.headers["x-panel-secret"] !== "EliteAdmin@2026") {
    return res.status(401).json({ error: "Unauthorized access. Invalid panel secret." });
  }

  const { apiUrl, days } = req.body;

  if (!apiUrl || !days) {
    return res.status(400).json({ error: "API URL and days are required" });
  }

  try {
    // URL se ?number= hata do taaki base url save ho
    const baseApiUrl = apiUrl.split('?')[0]; 

    const shortKey = "veh_" + crypto.randomBytes(4).toString("hex");
    const seconds = parseInt(days) * 24 * 60 * 60;
    const expiryMs = Date.now() + (seconds * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    await redis.setex(shortKey, seconds, JSON.stringify({ url: baseApiUrl, exp: expiryMs }));

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    // Base URL jisme customer apna number dale
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
