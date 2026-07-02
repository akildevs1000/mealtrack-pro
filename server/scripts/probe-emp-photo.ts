// READ-ONLY probe for the customer's Oracle EMP_PHOTO table.
//
//   cd server && npx tsx scripts/probe-emp-photo.ts               # discover schema
//   cd server && npx tsx scripts/probe-emp-photo.ts --empid 12345 # + test one photo fetch
//   cd server && npx tsx scripts/probe-emp-photo.ts --emp 700123  # look up empid from the master, then fetch
//
// Discovers where employee photos live so we can wire the print card to Oracle:
//   1. Lists tables/views whose name looks photo-related (%PHOTO%, %IMAGE%, %PIC%).
//   2. Dumps EMP_PHOTO's column metadata (finds the BLOB column + the empid key).
//   3. Counts rows.
//   4. Optional: fetches one photo (by --empid, or by --emp via the master lookup),
//      prints its byte length and sniffs the image format from the magic bytes.
//
// Runs only SELECTs — never writes to Oracle or Postgres. Requires ORACLE_CMS_*
// in server/.env and must run on the whitelisted CMS app server (Oracle :1521
// only accepts that host's IP). Override table/column guesses via env:
//   ORACLE_CMS_PHOTO_TABLE      (default EMP_PHOTO)
//   ORACLE_CMS_PHOTO_COL        (blob column; auto-detected if unset)
//   ORACLE_CMS_PHOTO_EMPID_COL  (key column in EMP_PHOTO; auto-detected if unset)
//   ORACLE_CMS_COL_EMPID        (empid column in CMS_EMPLOYEE_MASTER, for --emp)
//   ORACLE_CMS_COL_LABOR_CODE   (the "employee number" column, for --emp lookup)

import "dotenv/config";
import { connectionAttrs, isOracleConfigured } from "../src/lib/cms-oracle.js";

const env = process.env;
const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";
const PHOTO_TABLE = env.ORACLE_CMS_PHOTO_TABLE || "EMP_PHOTO";

function argVal(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// jpg/png/gif/webp/bmp magic-byte sniff → mime (so we know what to serve).
function sniffMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return "application/octet-stream (unknown — inspect the first bytes)";
}

async function main() {
  if (!isOracleConfigured()) {
    console.error("✗ Not configured. Set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD in server/.env");
    process.exit(1);
  }

  // @ts-ignore optional dep
  const oracledb = (await import("oracledb")).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsBuffer = [oracledb.BLOB]; // get BLOBs as Node Buffers directly

  console.log("→ connecting to Oracle…");
  const conn = await oracledb.getConnection(connectionAttrs());
  conn.callTimeout = Number(env.ORACLE_CMS_CALL_TIMEOUT_MS || 60_000);
  console.log("✓ connected\n");

  try {
    // 1. Find candidate photo tables/views by name.
    console.log("=== 1. PHOTO-LIKE OBJECTS (name match) ===");
    const objs = await conn.execute(
      `SELECT object_name, object_type FROM all_objects
        WHERE object_type IN ('TABLE','VIEW')
          AND (object_name LIKE '%PHOTO%' OR object_name LIKE '%IMAGE%' OR object_name LIKE '%PIC%')
        ORDER BY object_name`,
    );
    for (const r of (objs.rows ?? []) as any[]) console.log(`   ${r.OBJECT_TYPE.padEnd(5)} ${r.OBJECT_NAME}`);
    if (!(objs.rows ?? []).length) console.log("   (none — check the account's grants / try a different name)");

    // 2. EMP_PHOTO column metadata (WHERE 1=0 transfers no rows → no LOB stall).
    console.log(`\n=== 2. COLUMNS of ${PHOTO_TABLE} ===`);
    let blobCol: string | null = env.ORACLE_CMS_PHOTO_COL || null;
    let empidCol: string | null = env.ORACLE_CMS_PHOTO_EMPID_COL || null;
    try {
      const meta = await conn.execute(`SELECT * FROM ${PHOTO_TABLE} WHERE 1 = 0`);
      const cols: { name: string; type: string }[] = (meta.metaData ?? []).map((m: any) => ({
        name: m.name,
        type: m.dbTypeName ?? "?",
      }));
      for (const c of cols) console.log(`   ${c.name.padEnd(24)} ${c.type}`);
      // Best-guess the blob + key columns if not pinned via env.
      if (!blobCol) blobCol = cols.find((c) => /BLOB|LONG RAW|RAW/i.test(c.type))?.name ?? null;
      if (!empidCol) empidCol = cols.find((c) => /EMP.*ID|ID/i.test(c.name) && !/BLOB|RAW/i.test(c.type))?.name ?? null;
      console.log(`\n   → guessed blob column:  ${blobCol ?? "(none found — set ORACLE_CMS_PHOTO_COL)"}`);
      console.log(`   → guessed empid column: ${empidCol ?? "(none found — set ORACLE_CMS_PHOTO_EMPID_COL)"}`);
    } catch (e: any) {
      console.log(`   ✗ could not read ${PHOTO_TABLE}: ${String(e?.message ?? e).split("\n")[0]}`);
      console.log("   → set ORACLE_CMS_PHOTO_TABLE to the real name (see section 1).");
    }

    // 3. Row count.
    try {
      const cnt = await conn.execute(`SELECT COUNT(*) AS C FROM ${PHOTO_TABLE}`);
      console.log(`\n=== 3. ROW COUNT in ${PHOTO_TABLE}: ${(cnt.rows?.[0] as any)?.C} ===`);
    } catch (e: any) {
      console.log(`\n=== 3. ROW COUNT failed: ${String(e?.message ?? e).split("\n")[0]} ===`);
    }

    // 4. Optional single-photo fetch test.
    const empidArg = argVal("--empid");
    const empArg = argVal("--emp");
    let empid = empidArg;

    if (empArg && !empid) {
      const empidMasterCol = env.ORACLE_CMS_COL_EMPID || "EMP_ID";
      const numCol = env.ORACLE_CMS_COL_LABOR_CODE || "LABOR_CODE";
      console.log(`\n→ looking up empid for employee number ${empArg} via ${TABLE}.${numCol} → ${empidMasterCol}…`);
      try {
        const look = await conn.execute(
          `SELECT ${empidMasterCol} AS EMPID FROM ${TABLE} WHERE ${numCol} = :n`,
          { n: empArg },
        );
        empid = (look.rows?.[0] as any)?.EMPID != null ? String((look.rows?.[0] as any).EMPID) : null;
        console.log(empid ? `   → empid = ${empid}` : "   → no matching employee (check ORACLE_CMS_COL_EMPID / _LABOR_CODE)");
      } catch (e: any) {
        console.log(`   ✗ lookup failed: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    }

    if (empid && blobCol && empidCol) {
      console.log(`\n=== 4. PHOTO FETCH TEST — ${PHOTO_TABLE}.${blobCol} WHERE ${empidCol} = ${empid} ===`);
      try {
        const r = await conn.execute(
          `SELECT ${blobCol} AS PHOTO FROM ${PHOTO_TABLE} WHERE ${empidCol} = :id`,
          { id: /^\d+$/.test(empid) ? Number(empid) : empid },
        );
        const row = r.rows?.[0] as any;
        const buf: Buffer | null = row?.PHOTO ?? null;
        if (!buf || !buf.length) {
          console.log("   → no photo bytes returned for this empid.");
        } else {
          console.log(`   ✓ ${buf.length} bytes; format: ${sniffMime(buf)}`);
          console.log(`   first 16 bytes: ${buf.subarray(0, 16).toString("hex")}`);
        }
      } catch (e: any) {
        console.log(`   ✗ fetch failed: ${String(e?.message ?? e).split("\n")[0]}`);
      }
    } else if (!empidArg && !empArg) {
      console.log("\n(Tip: re-run with --empid <id> or --emp <employeeNumber> to test an actual photo fetch.)");
    }

    console.log("\n=== DONE — READ-ONLY: nothing was written. ===");
  } finally {
    await conn.close().catch(() => undefined);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ failed:", e?.message ?? e);
  process.exit(1);
});
