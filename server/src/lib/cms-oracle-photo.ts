// Oracle CMS employee-photo reader.
//
// The customer's employee photos live in a separate Oracle table (EMP_PHOTO),
// NOT in CMS_EMPLOYEE_MASTER and NOT synced into our Postgres. The printed
// access card fetches them LIVE, one at a time, straight from Oracle (see
// GET /api/employees/:code/cms-photo). Flow mirrors the customer's diagram:
// employee number → CMS_EMPLOYEE_MASTER (empid) → EMP_PHOTO (image bytes).
//
// Like cms-oracle.ts, every table/column name is env-configurable because the
// real EMP_PHOTO schema isn't documented — run scripts/probe-emp-photo.ts on
// the CMS app server to discover it, then set ORACLE_CMS_PHOTO_* in server/.env.
// Reuses the roster sync's connection settings (connectionAttrs()).

import { connectionAttrs, isOracleConfigured } from "./cms-oracle.js";

const env = process.env;

// The photos may live on a DIFFERENT Oracle instance than the roster (at Innovo
// the roster is on CMSDB @ cms-db, but EMP_PHOTO is on the HRMS box
// hrms.innovogroup.com). If ORACLE_CMS_PHOTO_HOST is set we open a dedicated
// connection to that instance; otherwise we reuse the roster connection.
export function photoConnectionAttrs() {
  const host = env.ORACLE_CMS_PHOTO_HOST;
  if (!host) return connectionAttrs();

  const port = Number(env.ORACLE_CMS_PHOTO_PORT || env.ORACLE_CMS_PORT || 1521);
  const sdu = Number(env.ORACLE_CMS_SDU || 1400);
  const service = env.ORACLE_CMS_PHOTO_SERVICE;
  const sid = env.ORACLE_CMS_PHOTO_SID;
  const connectData = service ? `(SERVICE_NAME=${service})` : `(SID=${sid || "hrms"})`;
  const connectString =
    env.ORACLE_CMS_PHOTO_CONNECT_STRING ||
    `(DESCRIPTION=(SDU=${sdu})(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=${connectData}))`;

  return {
    user: env.ORACLE_CMS_PHOTO_USER || env.ORACLE_CMS_USER,
    password: env.ORACLE_CMS_PHOTO_PASSWORD || env.ORACLE_CMS_PASSWORD,
    connectString,
    disableOOB: true,
  };
}

const PHOTO_TABLE = env.ORACLE_CMS_PHOTO_TABLE || "EMP_PHOTO";
const PHOTO_COL = env.ORACLE_CMS_PHOTO_COL || "PHOTO";
const EMPID_COL = env.ORACLE_CMS_PHOTO_EMPID_COL || "EMP_ID";
// Which value from our CmsEmployee row keys EMP_PHOTO. Default "laborId" (the
// numeric LABOR_ID we already sync). Set ORACLE_CMS_PHOTO_KEY=laborCode if
// EMP_PHOTO is keyed on the labour/employee code string instead.
const KEY = (env.ORACLE_CMS_PHOTO_KEY || "laborId").trim();

// Only fetch from Oracle once an admin has explicitly enabled it (after probing
// the EMP_PHOTO schema and setting ORACLE_CMS_PHOTO_* below). Off by default so
// a fresh deploy never fires wrong-guess Oracle queries on every card print.
export function isCmsPhotoConfigured(): boolean {
  return env.ORACLE_CMS_PHOTO_ENABLED === "1" && isOracleConfigured();
}

/** JPEG/PNG/GIF/WEBP/BMP magic-byte sniff → mime; null if unrecognised. */
function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 4 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (buf.length >= 2 && buf.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return null;
}

// Full override wins; otherwise a direct single-row lookup on EMP_PHOTO. Set
// ORACLE_CMS_PHOTO_QUERY (with one `:id` bind, returning a PHOTO column) when
// the photo needs a join back to CMS_EMPLOYEE_MASTER to resolve the empid.
function buildQuery(): string {
  if (env.ORACLE_CMS_PHOTO_QUERY) return env.ORACLE_CMS_PHOTO_QUERY;
  return `SELECT ${PHOTO_COL} AS PHOTO FROM ${PHOTO_TABLE} WHERE ${EMPID_COL} = :id`;
}

export interface CmsPhoto {
  mime: string;
  bytes: Buffer;
}

/**
 * Fetch one employee's photo from Oracle EMP_PHOTO, live. Returns null when
 * there is no photo row / no bytes. Throws on connection or query failure — the
 * caller turns that into a graceful image fallback.
 */
export async function fetchCmsPhoto(emp: {
  laborId: number;
  laborCode: string;
}): Promise<CmsPhoto | null> {
  if (!isOracleConfigured()) return null;

  const keyVal = KEY === "laborCode" ? emp.laborCode : emp.laborId;

  // Lazy import so the server boots fine where the driver/Oracle is absent.
  // @ts-ignore — `oracledb` is an optional dependency.
  const oracledb = (await import("oracledb")).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsBuffer = [oracledb.BLOB]; // get the BLOB as a Node Buffer

  let conn: any;
  try {
    conn = await oracledb.getConnection(photoConnectionAttrs());
    conn.callTimeout = Number(env.ORACLE_CMS_PHOTO_TIMEOUT_MS || env.ORACLE_CMS_CALL_TIMEOUT_MS || 30_000);

    const result = await conn.execute(buildQuery(), { id: keyVal }, { maxRows: 1 });
    const row: any = result.rows?.[0];
    if (!row) return null;

    // Blob comes back under our PHOTO alias (or the raw column name as a guard).
    let bytes: any = row.PHOTO ?? row[PHOTO_COL] ?? null;
    // If it arrived as a LOB object rather than a Buffer, materialise it.
    if (bytes && typeof bytes.getData === "function") bytes = await bytes.getData();
    if (!bytes || !Buffer.isBuffer(bytes) || bytes.length === 0) return null;

    const mime = sniffMime(bytes) || env.ORACLE_CMS_PHOTO_MIME || "image/jpeg";
    return { mime, bytes };
  } finally {
    if (conn) await conn.close().catch(() => undefined);
  }
}
