// api/vehicle.js

import {
  isVehicleValid,
  buildNotFoundResponse,
  buildSuccessResponse,
  errorResponse,
} from "../lib/transform.js";

// 10s timeout ko 60s kar diya
export const maxDuration = 60;

const UPSTREAM = "https://hideme.eu.org/lookup";
const SOURCE_KEY = process.env.SOURCE_API_KEY;
const UPSTREAM_TIMEOUT_MS = 25_000;

// Registration number format theek karne ke liye
function normalizeRegNo(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function isValidRegNo(r) {
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(r);
}

async function fetchUpstream(regNo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const url = `${UPSTREAM}?api=mvahan&key=${encodeURIComponent(SOURCE_KEY)}&number=${encodeURIComponent(regNo)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  
  // Sirf GET request allow karo
  if (req.method !== "GET")
    return res.status(405).json(errorResponse("METHOD_NOT_ALLOWED", "Only GET", Date.now() - start));

  // Number validate karo
  const regNo = normalizeRegNo(req.query.number);
  if (!isValidRegNo(regNo))
    return res.status(400).json(
      errorResponse("INVALID_REGISTRATION_NUMBER", "Format: GJ05MS9717", Date.now() - start)
    );

  try {
    const upstream = await fetchUpstream(regNo);
    const elapsed = Date.now() - start;

    // Agar chassis nahi mila to "Details Not Found" bhejo
    if (!isVehicleValid(upstream)) {
      const payload = buildNotFoundResponse(elapsed);
      if (req.query.debug === "1") payload._raw_upstream = upstream;
      return res.status(200).json(payload);
    }

    // Agar sab sahi hai to clean data bhejo
    const payload = buildSuccessResponse(upstream, elapsed);
    if (req.query.debug === "1") payload._raw_upstream = upstream;
    return res.status(200).json(payload);

  } catch (err) {
    const isAbort = err.name === "AbortError" || String(err).toLowerCase().includes("abort");
    return res.status(isAbort ? 504 : 502).json(
      errorResponse(
        isAbort ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
        isAbort
          ? `Upstream timeout after ${UPSTREAM_TIMEOUT_MS / 1000}s`
          : "Upstream service failed",
        Date.now() - start
      )
    );
  }
}
