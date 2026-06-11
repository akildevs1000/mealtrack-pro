// Time fetching ONE row of EACH column of the CMS view individually, to find
// which column(s) make the view expensive. Read-only. A 20s watchdog per
// column abandons stuck calls (fresh connection per column, so one stuck
// column can't block the rest).
//
//   cd server && npx tsx scripts/probe-columns.ts

import "dotenv/config";
import { connectionAttrs, isOracleConfigured } from "../src/lib/cms-oracle.js";

const env = process.env;
const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";
const WATCHDOG_MS = 20_000;

if (!isOracleConfigured()) {
  console.error("✗ ORACLE_CMS_* env vars missing");
  process.exit(1);
}

// @ts-ignore optional dep
const oracledb = (await import("oracledb")).default;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const COLS = [
  "COMPANY", "LABOR_ID", "LABOR_CODE", "EMPNAME", "DESIGNAITON", "GRADE",
  "DATE_OF_JOINING", "CAMPCODE", "CAMP_NAME", "MEALS_ELIGIBILITY", "STATUS",
  "EFECTIVE_DATE", "LAST_UPDATED",
];

function sleep(ms: number): Promise<"TIMEOUT"> {
  return new Promise((res) => setTimeout(() => res("TIMEOUT"), ms));
}

async function timeColumn(col: string): Promise<string> {
  let conn: any;
  const t0 = Date.now();
  try {
    conn = await oracledb.getConnection(connectionAttrs());
    conn.callTimeout = WATCHDOG_MS;
    const result = await Promise.race([
      conn.execute(`SELECT ${col} FROM ${TABLE} WHERE ROWNUM = 1`),
      sleep(WATCHDOG_MS + 2_000),
    ]);
    const ms = Date.now() - t0;
    if (result === "TIMEOUT") return `>${WATCHDOG_MS / 1000}s  ← STUCK (abandoned)`;
    return `${ms}ms`;
  } catch (e: any) {
    return `ERROR after ${Date.now() - t0}ms — ${String(e?.message ?? e).split("\n")[0]}`;
  } finally {
    // Stuck connections won't close gracefully — fire and forget.
    conn?.close().catch(() => undefined);
  }
}

console.log(`Timing 1-row fetch of each column of ${TABLE} (fresh connection each, ${WATCHDOG_MS / 1000}s watchdog)…\n`);
for (const col of COLS) {
  process.stdout.write(`  ${col.padEnd(18)} `);
  console.log(await timeColumn(col));
}

// Combination test: everything EXCEPT columns that look expensive can be
// checked manually afterwards; here just re-time the cheap baseline.
console.log("\nBaseline re-check:");
process.stdout.write(`  ${"COMPANY (again)".padEnd(18)} `);
console.log(await timeColumn("COMPANY"));

console.log("\ndone — read-only, nothing written.");
process.exit(0);
