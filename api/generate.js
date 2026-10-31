// api/generate.js
import crypto from "crypto";

const SECRET = process.env.PROXY_SECRET || "my-super-secret-key-2026";

export default async function handler(req, res) {
  // CORS allow
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
    // Expiry Date calculate karo
    const expiryMs = Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000);
    const expiryDate = new Date(expiryMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Token payload
    const payload = JSON.stringify({ url: apiUrl, exp: expiryMs });
    const base64Payload = Buffer.from(payload).toString("base64url");

    // HMAC Signature
    const signature = crypto
      .createHmac("sha256", SECRET)
      .update(base64Payload)
      .digest("base64url");

    const token = `${base64Payload}.${signature}`;

    // Domain nikalne ke liye (production URL)
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host;
    const finalUrl = `${protocol}://${host}/api/proxy?token=${token}`;

    return res.status(200).json({ 
      success: true, 
      url: finalUrl, 
      expiry: expiryDate,
      days: days
    });

  } catch (err) {
    return res.status(500).json({ error: "Failed to generate URL" });
  }
}
