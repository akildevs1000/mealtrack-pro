// READ-ONLY discovery probe for the customer's employee-photo storage in Oracle.
//
//   cd server && npx tsx scripts/probe-emp-photo.ts               # discover where photos live
//   cd server && npx tsx scripts/probe-emp-photo.ts --empid 12345 # + test one photo fetch
//   cd server && npx tsx scripts/probe-emp-photo.ts --emp 700123  # + look up empid then fetch
//
// There is no table literally named EMP_PHOTO visible to CMS_USER, so this
// hunts for the real one:
//   1. All BINARY columns (BLOB / RAW / LONG RAW / BFILE) in every schema the
//      account can see — a photo is almost always one of these. THIS is the
//      main signal: look for an employee/photo-ish table + column here.
//   2. Objects whose name looks photo/image-ish (broad patterns, all schemas).
//   3. Employee-related objects (name LIKE %EMP%) — the photo table often sits
//      beside the roster.
//   4. Columns of CMS_EMPLOYEE_MASTER — to find the empid key (and any inline
//      photo column).
//   5. Optional: fetch one photo once ORACLE_CMS_PHOTO_TABLE/COL/EMPID_COL are
//      set (owner-qualify the table if it's in another schema, e.g. HRMS.XXX).
//
// Runs only SELECTs — never writes. Requires ORACLE_CMS_* in server/.env and
// must run on the whitelisted CMS app server.

import "dotenv/config";
import { connectionAttrs, isOracleConfigured } from "../src/lib/cms-oracle.js";

const env = process.env;
const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";
const PHOTO_TABLE = env.ORACLE_CMS_PHOTO_TABLE || "EMP_PHOTO";

// Oracle-internal schemas to hide so the real customer objects stand out.
const SYS_SCHEMAS = [
  "SYS", "SYSTEM", "MDSYS", "CTXSYS", "ORDSYS", "ORDDATA", "ORDPLUGINS", "XDB",
  "WMSYS", "LBACSYS", "DVSYS", "DVF", "OLAPSYS", "GSMADMIN_INTERNAL", "AUDSYS",
  "DBSNMP", "APPQOSSYS", "OUTLN", "REMOTE_SCHEDULER_AGENT", "SYSBACKUP",
  "SYSDG", "SYSKM", "SYSRAC", "SI_INFORMTN_SCHEMA", "EXFSYS", "APEX_040000",
  "APEX_050000", "APEX_180200", "FLOWS_FILES", "ORACLE_OCM", "XS$NULL",
];
const NOT_SYS = `owner NOT IN (${SYS_SCHEMAS.map((s) => `'${s}'`).join(",")})`;

function argVal(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function sniffMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 4 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return "application/octet-stream (unknown)";
}

async function safeRun(conn: any, label: string, sql: string): Promise<any[]> {
  try {
    const r = await conn.execute(sql);
    return (r.rows ?? []) as any[];
  } catch (e: any) {
    console.log(`   ✗ ${label}: ${String(e?.message ?? e).split("\n")[0]}`);
    return [];
  }
}

async function main() {
  if (!isOracleConfigured()) {
    console.error("✗ Not configured. Set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD in server/.env");
    process.exit(1);
  }

  // @ts-ignore optional dep
  const oracledb = (await import("oracledb")).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsBuffer = [oracledb.BLOB];

  console.log("→ connecting to Oracle…");
  const conn = await oracledb.getConnection(connectionAttrs());
  conn.callTimeout = Number(env.ORACLE_CMS_CALL_TIMEOUT_MS || 60_000);
  console.log(`✓ connected as ${env.ORACLE_CMS_USER}\n`);

  try {
    // 1. BINARY columns — the primary signal for where an image is stored.
    console.log("=== 1. BINARY COLUMNS visible to this account (BLOB/RAW/LONG RAW/BFILE) ===");
    const bin = await safeRun(
      conn,
      "binary-column scan",
      `SELECT owner, table_name, column_name, data_type
         FROM all_tab_columns
        WHERE data_type IN ('BLOB','RAW','LONG RAW','BFILE')
          AND ${NOT_SYS}
        ORDER BY owner, table_name, column_name`,
    );
    if (!bin.length) console.log("   (none — the account has no visibility to any binary column)");
    for (const r of bin) console.log(`   ${r.OWNER}.${r.TABLE_NAME}.${r.COLUMN_NAME}  (${r.DATA_TYPE})`);

    // 2. Photo/image-ish object names (broad), any schema.
    console.log("\n=== 2. PHOTO/IMAGE-LIKE OBJECTS (name match, all schemas) ===");
    const objs = await safeRun(
      conn,
      "photo-name scan",
      `SELECT owner, object_name, object_type
         FROM all_objects
        WHERE object_type IN ('TABLE','VIEW','SYNONYM')
          AND (object_name LIKE '%PHOTO%' OR object_name LIKE '%IMAGE%' OR object_name LIKE '%IMG%'
               OR object_name LIKE '%PIC%'  OR object_name LIKE '%PICTURE%' OR object_name LIKE '%FACE%'
               OR object_name LIKE '%SNAP%' OR object_name LIKE '%MUGSHOT%')
          AND ${NOT_SYS}
        ORDER BY owner, object_name`,
    );
    if (!objs.length) console.log("   (none besides Oracle internals)");
    for (const r of objs) console.log(`   ${r.OBJECT_TYPE.padEnd(7)} ${r.OWNER}.${r.OBJECT_NAME}`);

    // 3. Employee-related objects — the photo table often lives beside the roster.
    console.log("\n=== 3. EMPLOYEE-RELATED OBJECTS (name LIKE %EMP%) ===");
    const emps = await safeRun(
      conn,
      "emp-name scan",
      `SELECT owner, object_name, object_type
         FROM all_objects
        WHERE object_type IN ('TABLE','VIEW','SYNONYM')
          AND object_name LIKE '%EMP%'
          AND ${NOT_SYS}
        ORDER BY owner, object_name`,
    );
    for (const r of emps.slice(0, 60)) console.log(`   ${r.OBJECT_TYPE.padEnd(7)} ${r.OWNER}.${r.OBJECT_NAME}`);
    if (emps.length > 60) console.log(`   … and ${emps.length - 60} more`);

    // 3b. EMP_PHOTO columns — the payoff once SELECT is granted: shows the
    //     employee-number column and the BLOB column to configure.
    console.log(`\n=== 3b. COLUMNS of ${PHOTO_TABLE} (once granted) ===`);
    try {
      const meta = await conn.execute(`SELECT * FROM ${PHOTO_TABLE} WHERE 1 = 0`);
      const cols = (meta.metaData ?? []).map((m: any) => ({ name: m.name, type: m.dbTypeName ?? "?" }));
      for (const c of cols) console.log(`   ${c.name.padEnd(24)} ${c.type}`);
      const blob = cols.find((c: any) => /BLOB|LONG RAW|RAW|BFILE/i.test(c.type));
      console.log(`\n   → BLOB column looks like: ${blob ? blob.name : "(none found)"}`);
      console.log(`   → set ORACLE_CMS_PHOTO_COL=<blob col>, ORACLE_CMS_PHOTO_EMPID_COL=<employee-number col>`);
    } catch (e: any) {
      console.log(`   ✗ ${String(e?.message ?? e).split("\n")[0]}`);
      console.log(`   → still not granted? ask the DBA: GRANT SELECT ON ${PHOTO_TABLE} TO ${env.ORACLE_CMS_USER};`);
    }

    // 4. CMS_EMPLOYEE_MASTER columns — find the empid key (+ any inline photo).
    console.log(`\n=== 4. COLUMNS of ${TABLE} (find the empid key) ===`);
    try {
      const meta = await conn.execute(`SELECT * FROM ${TABLE} WHERE 1 = 0`);
      const cols = (meta.metaData ?? []).map((m: any) => `${m.name}(${m.dbTypeName ?? "?"})`);
      console.log("   " + cols.join(", "));
    } catch (e: any) {
      console.log(`   ✗ ${String(e?.message ?? e).split("\n")[0]}`);
    }

    // 5. Optional photo-fetch test (only once the table/col/key are known).
    const empidArg = argVal("--empid");
    const empArg = argVal("--emp");
    const blobCol = env.ORACLE_CMS_PHOTO_COL;
    const empidCol = env.ORACLE_CMS_PHOTO_EMPID_COL;
    let empid = empidArg;

    if (empArg && !empid) {
      const empidMasterCol = env.ORACLE_CMS_COL_EMPID || "EMP_ID";
      const numCol = env.ORACLE_CMS_COL_LABOR_CODE || "LABOR_CODE";
      console.log(`\n→ looking up empid for ${empArg} via ${TABLE}.${numCol} → ${empidMasterCol}…`);
      const look = await safeRun(
        conn,
        "empid lookup",
        `SELECT ${empidMasterCol} AS EMPID FROM ${TABLE} WHERE ${numCol} = '${empArg.replace(/'/g, "''")}'`,
      );
      empid = look[0]?.EMPID != null ? String(look[0].EMPID) : null;
      console.log(empid ? `   → empid = ${empid}` : "   → no match (check ORACLE_CMS_COL_EMPID / _LABOR_CODE)");
    }

    if ((empidArg || empArg) && empid && env.ORACLE_CMS_PHOTO_TABLE && blobCol && empidCol) {
      console.log(`\n=== 5. FETCH TEST — ${PHOTO_TABLE}.${blobCol} WHERE ${empidCol} = ${empid} ===`);
      try {
        const r = await conn.execute(
          `SELECT ${blobCol} AS PHOTO FROM ${PHOTO_TABLE} WHERE ${empidCol} = :id`,
          { id: /^\d+$/.test(empid) ? Number(empid) : empid },
        );
        const buf: Buffer | null = (r.rows?.[0] as any)?.PHOTO ?? null;
        if (!buf || !buf.length) console.log("   → no photo bytes for this empid.");
        else {
          console.log(`   ✓ ${buf.length} bytes; format: ${sniffMime(buf)}`);
          console.log(`   first 16 bytes: ${buf.subarray(0, 16).toString("hex")}`);
        }
      } catch (e: any) {
        console.log(`   ✗ ${String(e?.message ?? e).split("\n")[0]}`);
      }
    } else if (empidArg || empArg) {
      console.log("\n(To fetch-test, first set ORACLE_CMS_PHOTO_TABLE / _COL / _EMPID_COL from sections 1-3.)");
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
