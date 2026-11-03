// api/vehicle.js

import {
  isVehicleValid,
  buildNotFoundResponse,
  buildSuccessResponse,
  errorResponse,
} from "../lib/transform.js";

// Timeout ko 60s tak badhaya gaya hai
export const maxDuration = 60;

const UPSTREAM = "https://hideme.eu.org/lookup";
const UPSTREAM_TIMEOUT_MS = 25000;

// 🔥 INTERNAL LOCK: Ye secret sirf proxy ke paas hai
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "MySuperSecretInternalLock";

function normalizeRegNo(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function isValidRegNo(r) {
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(r);
}

async function fetchUpstream(regNo) {
  const SOURCE_KEY = process.env.SOURCE_API_KEY;
  if (!SOURCE_KEY) throw new Error("SOURCE_API_KEY missing in Vercel Env Variables");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  
  try {
    const url = `${UPSTREAM}?api=mvahan&key=${encodeURIComponent(SOURCE_KEY)}&number=${encodeURIComponent(regNo)}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const start = Date.now();

  // CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-internal-secret");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json(errorResponse("METHOD_NOT_ALLOWED", "Only GET", Date.now() - start));

  // 🔥 SECURITY CHECK: Agar kisi ne direct /api/vehicle khola, to use block karo
  if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    return res.status(403).json({ 
      success: false, 
      error: "FORBIDDEN", 
      message: "Direct access is blocked. Please use a valid Proxy URL with API Key." 
    });
  }

  const regNo = normalizeRegNo(req.query.number);
  if (!isValidRegNo(regNo)) {
    return res.status(400).json(errorResponse("INVALID_REGISTRATION_NUMBER", "Format: GJ05MS9717", Date.now() - start));
  }

  try {
    const upstream = await fetchUpstream(regNo);
    const elapsed = Date.now() - start;

    if (!isVehicleValid(upstream)) {
      return res.status(200).json(buildNotFoundResponse(elapsed));
    }

    return res.status(200).json(buildSuccessResponse(upstream, elapsed));

  } catch (err) {
    const isAbort = err.name === "AbortError" || String(err).toLowerCase().includes("abort");
    return res.status(isAbort ? 504 : 502).json(
      errorResponse(
        isAbort ? "REQUEST_TIMEOUT" : "FETCH_ERROR",
        isAbort ? "Request took too long." : err.message,
        Date.now() - start
      )
    );
  }
}
