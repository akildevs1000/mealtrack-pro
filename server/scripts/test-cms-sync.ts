// CMS Oracle connectivity + sync smoke test.
//
//   cd server
//   npx tsx scripts/test-cms-sync.ts          # fetch-only: connect, query, show a sample (no DB writes)
//   npx tsx scripts/test-cms-sync.ts --write   # also upsert into Postgres
//
// Requires the ORACLE_CMS_* env vars (see .env.example). Run this on the
// whitelisted CMS Application Server — Oracle :1521 only accepts traffic from
// that host's IP.

import "dotenv/config";
import { fetchCmsEmployees, isOracleConfigured } from "../src/lib/cms-oracle.js";
import { runCmsSync } from "../src/lib/cms-sync.js";

async function main() {
  const write = process.argv.includes("--write");

  if (!isOracleConfigured()) {
    console.error("✗ Oracle is not configured. Set ORACLE_CMS_HOST / ORACLE_CMS_USER / ORACLE_CMS_PASSWORD.");
    process.exit(1);
  }

  console.log("→ connecting to Oracle CMS and fetching roster…");
  const { rows, skipped } = await fetchCmsEmployees();
  console.log(`✓ fetched ${rows.length} rows (${skipped.length} skipped)`);
  if (rows.length) {
    console.log("  sample row:", JSON.stringify(rows[0], null, 2));
  }
  if (skipped.length) {
    console.log("  first skipped:", skipped[0].reason);
  }

  if (write) {
    console.log("→ upserting into Postgres…");
    const summary = await runCmsSync();
    console.log("✓ sync summary:", JSON.stringify(summary, null, 2));
  } else {
    console.log("(fetch-only — pass --write to upsert into Postgres)");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
