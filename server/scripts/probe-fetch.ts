// Diagnose WHERE the Oracle data-fetch stalls. Read-only, every step timed,
// 15s timeout per call so nothing hangs.
//
//   cd server && npx tsx scripts/probe-fetch.ts

import "dotenv/config";
import { connectionAttrs, isOracleConfigured } from "../src/lib/cms-oracle.js";

const env = process.env;
const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";

if (!isOracleConfigured()) {
  console.error("✗ ORACLE_CMS_* env vars missing");
  process.exit(1);
}

// @ts-ignore optional dep
const oracledb = (await import("oracledb")).default;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const t0 = Date.now();
const t = () => `[${String(Date.now() - t0).padStart(6)}ms]`;

console.log(`${t()} connecting…`);
const conn = await oracledb.getConnection(connectionAttrs());
conn.callTimeout = 15_000;
console.log(`${t()} connected (thin mode, SDU=${env.ORACLE_CMS_SDU || 1400}, OOB off)`);

async function step(label: string, sql: string, opts: Record<string, unknown> = {}) {
  process.stdout.write(`${t()} ${label} … `);
  try {
    const r = await conn.execute(sql, [], opts);
    const n = r.rows?.length ?? 0;
    console.log(`OK ${t()} (${n} rows)`);
    return r;
  } catch (e: any) {
    console.log(`FAILED ${t()} — ${String(e?.message ?? e).split("\n")[0]}`);
    return null;
  }
}

// 0. Is the connection itself alive and fast?
await step("ping DUAL", "SELECT 1 AS X FROM DUAL");

// 1. What IS this object — table, view, or synonym (possibly over a DB link)?
const obj = await step(
  "object type",
  `SELECT OWNER, OBJECT_TYPE FROM ALL_OBJECTS WHERE OBJECT_NAME = '${TABLE}'`,
);
if (obj?.rows?.length) console.log("   →", JSON.stringify(obj.rows));
const syn = await step(
  "synonym target",
  `SELECT TABLE_OWNER, TABLE_NAME, DB_LINK FROM ALL_SYNONYMS WHERE SYNONYM_NAME = '${TABLE}'`,
);
if (syn?.rows?.length) console.log("   →", JSON.stringify(syn.rows));

// 2. Escalating fetches — find the size where it breaks.
await step("1 row, 1 col ", `SELECT COMPANY FROM ${TABLE} WHERE ROWNUM = 1`);
await step("1 row, all cols", `SELECT * FROM ${TABLE} WHERE ROWNUM = 1`);
await step("5 rows, all cols", `SELECT * FROM ${TABLE} WHERE ROWNUM <= 5`, { fetchArraySize: 1 });
await step("50 rows, all cols", `SELECT * FROM ${TABLE} WHERE ROWNUM <= 50`, { fetchArraySize: 10 });
await step("500 rows, all cols", `SELECT * FROM ${TABLE} WHERE ROWNUM <= 500`, { fetchArraySize: 100 });

console.log(`${t()} done — read-only, nothing written.`);
await conn.close().catch(() => undefined);
process.exit(0);
