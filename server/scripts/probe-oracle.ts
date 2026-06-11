// Probe which service name / SID is registered on the Oracle listener.
// Read-only: each attempt is just a connection handshake, closed immediately.
//
//   cd server && npx tsx scripts/probe-oracle.ts            # try common names
//   npx tsx scripts/probe-oracle.ts name1,name2             # try extra names first
//
// Uses ORACLE_CMS_HOST / PORT / USER / PASSWORD from server/.env.

import "dotenv/config";

const env = process.env;
const host = env.ORACLE_CMS_HOST;
const port = Number(env.ORACLE_CMS_PORT || 1521);
const user = env.ORACLE_CMS_USER;
const password = env.ORACLE_CMS_PASSWORD;

if (!host || !user || !password) {
  console.error("✗ Set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD in server/.env first.");
  process.exit(1);
}

const extra = (process.argv[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
const names = [
  ...new Set([
    ...extra,
    "hrms", "HRMS", "hrms1", "hrmsdb", "HRMSDB", "hrmspdb", "HRMSPDB", "HRMSPDB1",
    "cms", "CMS", "cmsdb", "CMSDB", "cmspdb", "CMSPDB",
    "orcl", "ORCL", "orclpdb", "ORCLPDB", "ORCLPDB1",
    "xe", "XE", "XEPDB1", "free", "FREE", "FREEPDB1",
    "prod", "PROD", "proddb", "PRODDB",
  ]),
];

// @ts-ignore optional dep
const oracledb = (await import("oracledb")).default;

async function attempt(label: string, connectString: string): Promise<boolean> {
  try {
    const c = await oracledb.getConnection({ user, password, connectString });
    console.log(`\n✓✓✓ FOUND — ${label} accepts our credentials. Use this in server/.env.`);
    await c.close();
    return true;
  } catch (e: any) {
    const msg = String(e?.message ?? e).split("\n")[0];
    if (/NJS-51[89]/.test(msg)) {
      console.log(`  ✗ ${label}: not registered`);
    } else {
      // A different error (e.g. ORA-01017 bad credentials) means the name DOES
      // exist on the listener — flag loudly.
      console.log(`  !! ${label}: ${msg}   ← name EXISTS on listener (different error)`);
    }
    return false;
  }
}

console.log(`Probing Oracle listener at ${host}:${port} — ${names.length} candidate names, service + SID forms…`);
for (const n of names) {
  if (await attempt(`SERVICE "${n}"`, `${host}:${port}/${n}`)) process.exit(0);
  if (
    await attempt(
      `SID "${n}"`,
      `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${n})))`,
    )
  )
    process.exit(0);
}

console.log(`
No candidate matched. Most likely either:
  a) the DB instance is DOWN on ${host} (a stopped instance unregisters from the listener), or
  b) the real service name is non-obvious.
Ask the customer to run \`lsnrctl services\` on the DB server and send the service name,
or to confirm the hrms database is started.`);
process.exit(1);
