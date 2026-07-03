// CMS → Postgres sync orchestrator.
//
// Pulls the labour roster from the customer's Oracle CMS_EMPLOYEE_MASTER and
// UPSERTs it into our `CmsEmployee` table, keyed on the unique `laborId`.
//
// IMPORTANT: this is an upsert, NOT the destructive wipe-and-replace the Excel
// import (/api/employees/import) does. A recurring sync must never delete-all,
// because `MealRecord` cascades on the CmsEmployee FK — wiping every run would
// erase all meal history. Employees that disappear from CMS are left in place
// (logged as `stale`); flip them via the normal status flow if needed.

import { prisma } from "./prisma.js";
import { fetchCmsEmployees } from "./cms-oracle.js";

export interface SyncSummary {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  stale: number; // present locally but absent from the CMS pull
  campsCreated: number; // Camp records auto-created from new roster camp codes
  companiesCreated: number; // Company records auto-created from new roster company codes
  error?: string;
}

let lastRun: SyncSummary | null = null;
let inFlight = false;

export function getLastSync(): SyncSummary | null {
  return lastRun;
}

export function isSyncRunning(): boolean {
  return inFlight;
}

export async function runCmsSync(): Promise<SyncSummary> {
  if (inFlight) {
    throw new Error("A CMS sync is already running.");
  }
  inFlight = true;
  const started = new Date();

  let created = 0;
  let updated = 0;
  let fetched = 0;
  let skipped = 0;
  let stale = 0;
  let campsCreated = 0;
  let companiesCreated = 0;
  let error: string | undefined;
  let ok = false;

  try {
    const { rows, skipped: skippedRows } = await fetchCmsEmployees();
    fetched = rows.length;
    skipped = skippedRows.length;

    const existing = await prisma.cmsEmployee.findMany({ select: { laborId: true } });
    const existingIds = new Set(existing.map((e) => e.laborId));
    const seenIds = new Set<number>();

    // Upsert one-by-one. The roster is a few thousand rows; correctness and
    // clear per-row error handling matter more than a bulk micro-optimisation.
    for (const r of rows) {
      seenIds.add(r.laborId);
      const data = {
        company: r.company,
        laborCode: r.laborCode,
        name: r.name,
        designation: r.designation,
        grade: r.grade,
        doj: r.doj,
        campCode: r.campCode,
        campName: r.campName,
        mealsEligibility: r.mealsEligibility,
        status: r.status,
        effectiveDate: r.effectiveDate,
        lastUpdated: r.lastUpdated ?? started,
      };
      await prisma.cmsEmployee.upsert({
        where: { laborId: r.laborId },
        create: { laborId: r.laborId, ...data },
        update: data,
      });
      if (existingIds.has(r.laborId)) updated++;
      else created++;
    }

    stale = existing.filter((e) => !seenIds.has(e.laborId)).length;

    // Tally per-camp and per-company headcounts from the roster, plus the
    // company each camp belongs to. The roster gives a single company string
    // (e.g. "INNOVOBLD") which we use as both the Company code and name.
    const byCamp = new Map<string, { name: string; count: number }>();
    const byCompany = new Map<string, number>(); // companyCode -> headcount
    const campCompany = new Map<string, string>(); // campCode -> companyCode
    for (const r of rows) {
      const companyCode = r.company?.trim();
      if (companyCode) byCompany.set(companyCode, (byCompany.get(companyCode) ?? 0) + 1);
      if (!r.campCode) continue;
      const c = byCamp.get(r.campCode);
      if (c) c.count++;
      else byCamp.set(r.campCode, { name: r.campName || r.campCode, count: 1 });
      // Last-writer-wins: if a camp ever spans companies, the final row decides.
      if (companyCode) campCompany.set(r.campCode, companyCode);
    }

    // Ensure a Company record exists for every distinct company in the roster.
    // Must run BEFORE camps, since Camp.companyCode is an FK into Company.code.
    // Existing companies only have their headcount refreshed — admin-tuned
    // name/contact/email/phone are never overwritten.
    const existingCompanies = new Set(
      (await prisma.company.findMany({ select: { code: true } })).map((c) => c.code),
    );
    for (const [code, count] of byCompany) {
      await prisma.company.upsert({
        where: { code },
        create: { code, name: code, employees: count },
        update: { employees: count },
      });
      if (!existingCompanies.has(code)) companiesCreated++;
    }

    // Ensure a Camp record exists for every camp in the roster, so meal
    // windows / scanner gating can be configured without hand-creating camps.
    // New camps get the schema's default meal windows; existing camps only
    // have their headcount refreshed — admin-tuned names, windows, and
    // online state are never overwritten. The company link is (re)applied on
    // every run so the Company → Camp hierarchy stays in sync with CMS.
    const existingCamps = new Set(
      (await prisma.camp.findMany({ select: { code: true } })).map((c) => c.code),
    );
    for (const [code, c] of byCamp) {
      const companyCode = campCompany.get(code) ?? null;
      await prisma.camp.upsert({
        where: { code },
        create: { code, name: c.name, site: c.name, employees: c.count, companyCode },
        update: { employees: c.count, companyCode },
      });
      if (!existingCamps.has(code)) campsCreated++;
    }

    ok = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    inFlight = false;
  }

  const finished = new Date();
  lastRun = {
    ok,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    fetched,
    created,
    updated,
    skipped,
    stale,
    campsCreated,
    companiesCreated,
    error,
  };
  return lastRun;
}
