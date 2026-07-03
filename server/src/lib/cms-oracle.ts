// Oracle CMS (HRMS) reader.
//
// Connects to the customer's CMS_EMPLOYEE_MASTER table on their Oracle
// instance (per CMS_Technical_Access_Documentation) and returns rows already
// normalised into the shape our Prisma `CmsEmployee` model expects. The actual
// Oracle column names are NOT specified in the access doc, so every column is
// configurable via env (with best-guess defaults), and the whole SELECT can be
// overridden with ORACLE_CMS_QUERY when the real schema is known.
//
// `oracledb` runs in **thin mode** (pure JS) — no Oracle Instant Client needs
// to be installed on the host. The driver is imported lazily so the rest of
// the server boots fine on hosts where Oracle isn't configured / installed.

const env = process.env;

export interface CmsRow {
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
  grade: string | null;
  doj: Date;
  campCode: string;
  campName: string;
  mealsEligibility: "Y" | "N";
  status: "Active" | "InActive" | "leave";
  effectiveDate: Date | null;
  lastUpdated: Date | null;
}

/** True only when the minimum Oracle connection env vars are present. */
export function isOracleConfigured(): boolean {
  return Boolean(
    env.ORACLE_CMS_HOST && env.ORACLE_CMS_USER && env.ORACLE_CMS_PASSWORD,
  );
}

/**
 * Build an Oracle connect descriptor.
 * The access doc gives an SID ("hrms"); set ORACLE_CMS_SERVICE to connect by
 * service name instead. Always a full descriptor so we can pin a small SDU:
 * the customer's inter-subnet firewall intermittently blackholes large
 * packets (COUNT(*) replies arrive, row-data fetches stall), and a small
 * session data unit keeps SQL*Net packets under the failing size.
 */
function connectString(): string {
  if (env.ORACLE_CMS_CONNECT_STRING) return env.ORACLE_CMS_CONNECT_STRING;

  const host = env.ORACLE_CMS_HOST as string;
  const port = Number(env.ORACLE_CMS_PORT || 1521);
  const sdu = Number(env.ORACLE_CMS_SDU || 1400);
  const service = env.ORACLE_CMS_SERVICE;
  const connectData = service ? `(SERVICE_NAME=${service})` : `(SID=${env.ORACLE_CMS_SID || "hrms"})`;
  return `(DESCRIPTION=(SDU=${sdu})(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=${connectData}))`;
}

/** Shared connection attributes for every Oracle connection we open. */
export function connectionAttrs() {
  return {
    user: env.ORACLE_CMS_USER,
    password: env.ORACLE_CMS_PASSWORD,
    connectString: connectString(),
    // Strict firewalls drop TCP out-of-band/urgent packets, which manifests
    // as random hangs; OOB is only used to interrupt running calls, safe off.
    disableOOB: true,
  };
}

const TABLE = env.ORACLE_CMS_TABLE || "CMS_EMPLOYEE_MASTER";

// Column-name mapping. Override any of these if the real CMS schema differs;
// or set ORACLE_CMS_QUERY to supply the full SELECT yourself.
const COL = {
  company: env.ORACLE_CMS_COL_COMPANY || "COMPANY",
  laborId: env.ORACLE_CMS_COL_LABOR_ID || "LABOR_ID",
  laborCode: env.ORACLE_CMS_COL_LABOR_CODE || "LABOR_CODE",
  name: env.ORACLE_CMS_COL_NAME || "NAME",
  designation: env.ORACLE_CMS_COL_DESIGNATION || "DESIGNATION",
  grade: env.ORACLE_CMS_COL_GRADE || "GRADE",
  doj: env.ORACLE_CMS_COL_DOJ || "DOJ",
  campCode: env.ORACLE_CMS_COL_CAMP_CODE || "CAMP_CODE",
  campName: env.ORACLE_CMS_COL_CAMP_NAME || "CAMP_NAME",
  eligibility: env.ORACLE_CMS_COL_ELIGIBILITY || "MEALS_ELIGIBILITY",
  status: env.ORACLE_CMS_COL_STATUS || "STATUS",
  effectiveDate: env.ORACLE_CMS_COL_EFFECTIVE_DATE || "EFFECTIVE_DATE",
  lastUpdated: env.ORACLE_CMS_COL_LAST_UPDATED || "LAST_UPDATED",
};

function buildQuery(): string {
  if (env.ORACLE_CMS_QUERY) return env.ORACLE_CMS_QUERY;
  // Alias every column to the fixed names we read below, so a column-name
  // remap only touches the COL map and never this consumer code.
  return `SELECT
      ${COL.company}        AS COMPANY,
      ${COL.laborId}        AS LABOR_ID,
      ${COL.laborCode}      AS LABOR_CODE,
      ${COL.name}           AS EMP_NAME,
      ${COL.designation}    AS DESIGNATION,
      ${COL.grade}          AS GRADE,
      ${COL.doj}            AS DOJ,
      ${COL.campCode}       AS CAMP_CODE,
      ${COL.campName}       AS CAMP_NAME,
      ${COL.eligibility}    AS MEALS_ELIGIBILITY,
      ${COL.status}         AS EMP_STATUS,
      ${COL.effectiveDate}  AS EFFECTIVE_DATE,
      ${COL.lastUpdated}    AS LAST_UPDATED
    FROM ${TABLE}`;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function coerceDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

// Oracle DATE columns arrive as JS Dates in the host's local timezone (e.g.
// Dubai-midnight = 20:00Z the previous day). These are calendar dates, so pin
// them to UTC midnight of the local calendar day — otherwise every date
// renders one day early once sliced to YYYY-MM-DD.
function dateOnly(d: Date | null): Date | null {
  if (!d) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function normEligibility(v: unknown): "Y" | "N" {
  const s = str(v).toUpperCase();
  return s === "Y" || s === "YES" || s === "1" || s === "TRUE" ? "Y" : "N";
}

function normStatus(v: unknown): "Active" | "InActive" | "leave" {
  const s = str(v).toLowerCase().replace(/[\s_-]/g, "");
  if (s === "active" || s === "a") return "Active";
  if (s === "leave" || s === "onleave" || s === "l") return "leave";
  return "InActive"; // inactive / unknown / blank → treated as inactive
}

export interface FetchResult {
  rows: CmsRow[];
  /** Source rows dropped because a required field (laborId / laborCode / doj) was missing. */
  skipped: { row: Record<string, unknown>; reason: string }[];
}

/**
 * Connect to Oracle, run the (configurable) query, and return normalised rows.
 * Throws if Oracle isn't configured or the connection/query fails — callers
 * (worker, route) catch and report.
 */
export async function fetchCmsEmployees(): Promise<FetchResult> {
  if (!isOracleConfigured()) {
    throw new Error(
      "Oracle CMS is not configured (set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD).",
    );
  }

  // Lazy import so the server boots without the driver present until it's needed.
  // @ts-ignore — `oracledb` is an optional dependency, may be absent at type-check time.
  const oracledb = (await import("oracledb")).default;
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  // Fetch dates as JS Date objects (default), CLOB/strings as JS strings.
  oracledb.fetchAsString = [oracledb.CLOB];

  let conn: any;
  try {
    conn = await oracledb.getConnection(connectionAttrs());
    // Fail with a timeout error instead of hanging forever if the network or
    // DB stalls mid-fetch. Override via ORACLE_CMS_CALL_TIMEOUT_MS.
    conn.callTimeout = Number(env.ORACLE_CMS_CALL_TIMEOUT_MS || 120_000);

    const result = await conn.execute(buildQuery(), [], { maxRows: 0 });
    const raw: Record<string, unknown>[] = result.rows ?? [];

    const rows: CmsRow[] = [];
    const skipped: FetchResult["skipped"] = [];

    for (const r of raw) {
      const laborId = Number(r.LABOR_ID);
      const laborCode = str(r.LABOR_CODE);
      const doj = coerceDate(r.DOJ);

      if (!Number.isFinite(laborId) || laborId <= 0) {
        skipped.push({ row: r, reason: "missing/invalid LABOR_ID" });
        continue;
      }
      if (!laborCode) {
        skipped.push({ row: r, reason: "missing LABOR_CODE" });
        continue;
      }
      if (!doj) {
        skipped.push({ row: r, reason: "missing/invalid DOJ" });
        continue;
      }

      rows.push({
        company: str(r.COMPANY),
        laborId,
        laborCode,
        name: str(r.EMP_NAME),
        designation: str(r.DESIGNATION),
        grade: str(r.GRADE) || null,
        doj: dateOnly(doj)!,
        campCode: str(r.CAMP_CODE),
        campName: str(r.CAMP_NAME),
        mealsEligibility: normEligibility(r.MEALS_ELIGIBILITY),
        status: normStatus(r.EMP_STATUS),
        effectiveDate: dateOnly(coerceDate(r.EFFECTIVE_DATE)),
        lastUpdated: dateOnly(coerceDate(r.LAST_UPDATED)),
      });
    }

    return { rows, skipped };
  } finally {
    if (conn) await conn.close().catch(() => undefined);
  }
}
