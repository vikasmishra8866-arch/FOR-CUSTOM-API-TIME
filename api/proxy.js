// api/proxy.js
import crypto from "crypto";

// ⚠️ Ye secret key Vercel ke Environment Variables me add karni hai
const SECRET = process.env.PROXY_SECRET || "my-super-secret-key-2026";

export default async function handler(req, res) {
  // CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: "Token missing" });
  }

  try {
    // 1. Token ko todho (Payload aur Signature)
    const [base64Payload, signature] = token.split(".");
    if (!base64Payload || !signature) throw new Error("Invalid token format");

    // 2. Signature verify karo (Security check - taaki koi token change na kar sake)
    const expectedSignature = crypto
      .createHmac("sha256", SECRET)
      .update(base64Payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      throw new Error("Invalid token (Tampered)");
    }

    // 3. Payload decode karo
    const payloadStr = Buffer.from(base64Payload, "base64url").toString();
    const { url, exp } = JSON.parse(payloadStr);

    // 4. Expiry check karo
    if (Date.now() > exp) {
      const expDate = new Date(exp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      return res.status(403).json({ 
        success: false, 
        error: "URL_EXPIRED", 
        message: `This link expired on ${expDate}` 
      });
    }

    // 5. Agar sab sahi hai, to original API ko call karke data laao
    const response = await fetch(url);
    const data = await response.json();

    return res.status(200).json(data);

  } catch (err) {
    return res.status(403).json({ success: false, error: err.message });
  }
}
