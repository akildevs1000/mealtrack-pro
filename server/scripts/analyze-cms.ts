// READ-ONLY analyzer for the customer's Oracle CMS_EMPLOYEE_MASTER.
//
//   cd server && npx tsx scripts/analyze-cms.ts
//
// Connects to Oracle, profiles the table, and prints a report. It runs only
// SELECTs — it never writes to Oracle (we couldn't) and NEVER writes to our
// Postgres either. Use this to verify the source data before enabling the
// sync. Requires the ORACLE_CMS_* env vars in server/.env.

import "dotenv/config";
import { fetchCmsEmployees, isOracleConfigured } from "../src/lib/cms-oracle.js";

const env = process.env;
const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";

function connectString(): string {
  if (env.ORACLE_CMS_CONNECT_STRING) return env.ORACLE_CMS_CONNECT_STRING;
  const host = env.ORACLE_CMS_HOST as string;
  const port = Number(env.ORACLE_CMS_PORT || 1521);
  if (env.ORACLE_CMS_SERVICE) return `${host}:${port}/${env.ORACLE_CMS_SERVICE}`;
  const sid = env.ORACLE_CMS_SID || "hrms";
  return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${sid})))`;
}

function dist(values: (string | null | undefined)[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const v of values) {
    const k = v == null || v === "" ? "(blank)" : String(v);
    d[k] = (d[k] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(d).sort((a, b) => b[1] - a[1]));
}

async function main() {
  if (!isOracleConfigured()) {
    console.error("✗ Not configured. Set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD in server/.env");
    process.exit(1);
  }

  // @ts-ignore optional dep
  const oracledb = (await import("oracledb")).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

  console.log("→ connecting to Oracle…");
  const conn = await oracledb.getConnection({
    user: env.ORACLE_CMS_USER,
    password: env.ORACLE_CMS_PASSWORD,
    connectString: connectString(),
  });
  console.log("✓ connected\n");

  try {
    // 1. Row count
    const cnt = await conn.execute(`SELECT COUNT(*) AS C FROM ${TABLE}`);
    const total = (cnt.rows?.[0] as any)?.C;
    console.log(`=== 1. TOTAL ROWS in ${TABLE}: ${total} ===\n`);

    // 2. Actual columns — what the table REALLY looks like
    let sample: any;
    try {
      sample = await conn.execute(`SELECT * FROM ${TABLE} FETCH FIRST 5 ROWS ONLY`);
    } catch {
      sample = await conn.execute(`SELECT * FROM ${TABLE} WHERE ROWNUM <= 5`);
    }
    const cols = (sample.metaData ?? []).map((m: any) => m.name);
    console.log(`=== 2. ACTUAL COLUMNS (${cols.length}) ===`);
    console.log(cols.join(", "), "\n");
    console.log("=== 3. FIRST 2 RAW ROWS (as stored in Oracle) ===");
    for (const r of (sample.rows ?? []).slice(0, 2)) console.log(JSON.stringify(r), "\n");

    // 4. Our mapped query — does our column mapping work?
    console.log("=== 4. MAPPED FETCH (our sync's view of the data) ===");
    try {
      const { rows, skipped } = await fetchCmsEmployees();
      console.log(`✓ mapped query OK — ${rows.length} usable rows, ${skipped.length} skipped\n`);

      if (skipped.length) {
        console.log("   skip reasons:", dist(skipped.map((s) => s.reason)), "\n");
      }

      // 5. Profile
      const ids = rows.map((r) => r.laborId);
      const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
      const codes = rows.map((r) => r.laborCode);
      const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
      const dojs = rows.map((r) => r.doj.getTime());

      console.log("=== 5. PROFILE ===");
      console.log("status:        ", dist(rows.map((r) => r.status)));
      console.log("eligibility:   ", dist(rows.map((r) => r.mealsEligibility)));
      console.log("companies:     ", dist(rows.map((r) => r.company)));
      const camps = dist(rows.map((r) => `${r.campCode} | ${r.campName}`));
      console.log(`camps (${Object.keys(camps).length} distinct):`);
      for (const [k, n] of Object.entries(camps).slice(0, 25)) console.log(`   ${String(n).padStart(6)}  ${k}`);
      if (Object.keys(camps).length > 25) console.log(`   … and ${Object.keys(camps).length - 25} more`);
      console.log("duplicate laborId count:  ", new Set(dupIds).size, dupIds.length ? `(e.g. ${[...new Set(dupIds)].slice(0, 5).join(", ")})` : "");
      console.log("duplicate laborCode count:", new Set(dupCodes).size, dupCodes.length ? `(e.g. ${[...new Set(dupCodes)].slice(0, 5).join(", ")})` : "");
      console.log("doj range:     ", new Date(Math.min(...dojs)).toISOString().slice(0, 10), "→", new Date(Math.max(...dojs)).toISOString().slice(0, 10));
      const blankNames = rows.filter((r) => !r.name).length;
      const blankCamp = rows.filter((r) => !r.campCode).length;
      console.log("blank name:    ", blankNames, "   blank campCode:", blankCamp);

      console.log("\n=== 6. SAMPLE NORMALIZED ROWS (what would be upserted — but was NOT) ===");
      for (const r of rows.slice(0, 3)) console.log(JSON.stringify(r), "\n");
    } catch (e: any) {
      console.log("✗ mapped query FAILED:", e?.message ?? e);
      console.log("   → our guessed column names don't match the real schema above.");
      console.log("   → compare section 2 and set ORACLE_CMS_COL_* overrides accordingly.");
    }

    console.log("\n=== DONE — READ-ONLY: nothing was written to Postgres or Oracle. ===");
  } finally {
    await conn.close().catch(() => undefined);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ failed:", e?.message ?? e);
  process.exit(1);
});
