// Drive the /api/employees/import endpoint with references/CMS Sample Data.xlsx
// using the same parsing logic as the frontend.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const BASE = "http://localhost:5044/api";

async function login(username: string, password: string) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const j = (await r.json()) as { token: string };
  return j.token;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  company: ["company"],
  laborId: ["laborid", "labor_id"],
  laborCode: ["laborcode", "labor_code"],
  name: ["empname", "name"],
  designation: ["designation", "designaiton"],
  doj: ["doj", "date_of_joining"],
  campCode: ["campcode", "camp_code"],
  campName: ["campname", "camp_name"],
  mealsEligibility: ["meals_eligibility"],
  status: ["status"],
  effectiveDate: ["effective_date", "efective_date"],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");

function toIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function main() {
  const file = resolve(process.cwd(), "..", "references", "CMS Sample Data.xlsx");
  const wb = XLSX.read(readFileSync(file));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = Object.keys(json[0] ?? {});
  const hmap: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const set = new Set(aliases.map(norm));
    const hit = headers.find((h) => set.has(norm(h)));
    if (hit) hmap[field] = hit;
  }
  const rows = json.map((raw) => ({
    company: String(raw[hmap.company] ?? "").trim(),
    laborId: Number(raw[hmap.laborId]),
    laborCode: String(raw[hmap.laborCode] ?? "").trim(),
    name: String(raw[hmap.name] ?? "").trim(),
    designation: String(raw[hmap.designation] ?? "").trim(),
    doj: toIso(raw[hmap.doj]) ?? "2021-01-01",
    campCode: String(raw[hmap.campCode] ?? "").trim(),
    campName: String(raw[hmap.campName] ?? "").trim(),
    mealsEligibility: String(raw[hmap.mealsEligibility] ?? "Y").trim().toUpperCase(),
    status: String(raw[hmap.status] ?? "Active").trim(),
    effectiveDate: toIso(raw[hmap.effectiveDate]),
    // LAST_UPDATED intentionally not sent — server stamps it.
  }));

  console.log(`Parsed ${rows.length} rows. First row:`);
  console.log(JSON.stringify(rows[0], null, 2));

  const token = await login("admin", "password123");
  const r = await fetch(`${BASE}/employees/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows }),
  });
  const result = await r.json();
  console.log(`HTTP ${r.status}:`, result);

  // Sanity-check round-trip
  const list = await fetch(`${BASE}/employees`, { headers: { Authorization: `Bearer ${token}` } });
  const items = await list.json() as any[];
  console.log(`After import: ${items.length} employees in DB`);
  console.log("Sample:", items.slice(0, 2).map((e) => `${e.laborCode} ${e.name} ${e.campCode}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
