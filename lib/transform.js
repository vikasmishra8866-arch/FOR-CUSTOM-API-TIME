// lib/transform.js
const API_VERSION = "v2.1";
const PORTAL_NAME = "Elite Vehicle Desk";
const NOT_FOUND_MSG = "Details Not Found";

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseRegDate(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (mon === undefined) return null;
  return new Date(parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

function computeAge(regDateStr, now = new Date()) {
  const regDate = parseRegDate(regDateStr);
  if (!regDate) return null;
  let years = now.getFullYear() - regDate.getFullYear();
  let months = now.getMonth() - regDate.getMonth();
  let days = now.getDate() - regDate.getDate();
  if (days < 0) { months -= 1; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) return null;
  const pl = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return { years, months, days, formatted: `${pl(years, "Year")}, ${pl(months, "Month")}, ${pl(days, "Day")}` };
}

function fmtTs(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function removeNulls(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    const arr = obj.map(removeNulls).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (typeof obj === "object") {
    const newObj = {};
    let hasKeys = false;
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = removeNulls(value);
      if (cleaned !== undefined) { newObj[key] = cleaned; hasKeys = true; }
    }
    return hasKeys ? newObj : undefined;
  }
  return obj;
}

export function isVehicleValid(upstream) {
  if (!upstream || upstream.success !== true) return false;
  const v = upstream.vehicle;
  if (!v || typeof v !== "object") return false;
  if (!v.chassis || typeof v.chassis !== "string" || v.chassis.trim() === "") return false;
  return true;
}

export function buildNotFoundResponse(elapsedMs) {
  const raw = { success: false, status: "DETAILS_NOT_FOUND", message: NOT_FOUND_MSG, meta: { api_version: API_VERSION, portal: PORTAL_NAME, processed_in: (elapsedMs / 1000).toFixed(2) + "s", timestamp: fmtTs(new Date()) } };
  return removeNulls(raw);
}

export function buildSuccessResponse(upstream, elapsedMs) {
  const v = upstream.vehicle;
  const make = v.make ? String(v.make).trim() : "";
  const model = v.model ? String(v.model).trim() : "";
  const maker_model = [make, model].filter(Boolean).join(" ") || null;

  const raw = {
    success: true,
    meta: { api_version: API_VERSION, portal: PORTAL_NAME, processed_in: (elapsedMs / 1000).toFixed(2) + "s", timestamp: upstream.timestamp || fmtTs(new Date()), upstream_runtime: upstream.runtime ?? null },
    vehicle_summary: { registration_no: v.registration_no ?? upstream.reg_no ?? null, vehicle_class: v.vehicle_class ?? null, category: v.vehicle_category ?? null, maker_model, make: v.make ?? null, model: v.model ?? null, variant: v.variant ?? null, fuel_type: v.fuel ?? null, color: v.color ?? null, body_type: v.body_type ?? null, norms: v.norms ?? null },
    owner_info: { owner_name: v.owner ?? null, father_name: v.father_name ?? null, financier: v.financier ?? null, mobile: upstream.mobile ?? null, mobile_found: typeof upstream.mobile_found === "boolean" ? upstream.mobile_found : null },
    compliance_status: { insurance_company: v.insurance_company ?? null, insurance_policy_no: v.insurance_policy_no ?? null, insurance_upto: v.insurance_upto ?? null, puc_no: v.puc_no ?? null, puc_upto: v.puc_upto ?? null, tax_upto: v.tax_upto ?? null, fit_upto: v.fit_upto ?? null, status: v.status ?? null, status_as_on: v.status_as_on ?? null },
    registration_details: { rto_office: v.rto ?? null, registration_date: v.registration_date ?? null, vehicle_age: computeAge(v.registration_date), city: v.city ?? null, address: v.address ?? null },
    technical_data: { chassis_number: v.chassis ?? null, engine_number: v.engine ?? null, cubic_capacity: v.cubic_capacity ?? null, seating_capacity: v.seating_capacity ?? null },
  };
  return removeNulls(raw);
}

export function errorResponse(code, message, elapsedMs) {
  const raw = { success: false, status: code, message, meta: { api_version: API_VERSION, portal: PORTAL_NAME, processed_in: (elapsedMs / 1000).toFixed(2) + "s", timestamp: fmtTs(new Date()) } };
  return removeNulls(raw);
}
