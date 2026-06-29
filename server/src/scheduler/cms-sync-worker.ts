// CMS roster sync worker. Periodically pulls CMS_EMPLOYEE_MASTER from Oracle
// and upserts it into Postgres. Mirrors scheduler/worker.ts's overlap-guard
// style. Only starts when Oracle is configured AND CMS_SYNC_ENABLED=1, so it's
// a no-op on the web/desktop deployments that don't talk to the customer DB.

import { isOracleConfigured } from "../lib/cms-oracle.js";
import { runCmsSync } from "../lib/cms-sync.js";

// Interval: default hourly. CMS_SYNC_INTERVAL_SEC (seconds) takes precedence
// over CMS_SYNC_INTERVAL_MIN (minutes) when set — lets the interval go
// sub-minute. The overlap guard means if a run is still going when the next
// tick fires, the tick is skipped, so a too-short interval degrades to
// "back-to-back" rather than piling up. Floor of 5s as a sanity stop.
const intervalSec = process.env.CMS_SYNC_INTERVAL_SEC
  ? Number(process.env.CMS_SYNC_INTERVAL_SEC)
  : Number(process.env.CMS_SYNC_INTERVAL_MIN || 60) * 60;
const TICK_MS = Math.max(5, intervalSec) * 1000;
const intervalLabel =
  TICK_MS >= 60_000 ? `${TICK_MS / 60_000} min` : `${TICK_MS / 1000} sec`;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return; // skip overlap if the previous sync is still working
  running = true;
  try {
    const r = await runCmsSync();
    console.log(
      `[cms-sync] ${r.ok ? "OK" : "FAIL"} — fetched=${r.fetched} created=${r.created} ` +
        `updated=${r.updated} skipped=${r.skipped} stale=${r.stale} campsCreated=${r.campsCreated} ` +
        `companiesCreated=${r.companiesCreated} ` +
        `in ${r.durationMs}ms` +
        (r.error ? ` — ${r.error}` : ""),
    );
  } catch (e) {
    console.error("[cms-sync] tick error", e);
  } finally {
    running = false;
  }
}

export function startCmsSync() {
  if (timer) return;
  if (process.env.CMS_SYNC_ENABLED !== "1") {
    console.log("[cms-sync] disabled (set CMS_SYNC_ENABLED=1 to enable)");
    return;
  }
  if (!isOracleConfigured()) {
    console.log("[cms-sync] enabled but Oracle is not configured — skipping start");
    return;
  }
  console.log(`[cms-sync] starting, syncing every ${intervalLabel}`);
  // Fire once on boot so a restart picks up roster changes promptly.
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopCmsSync() {
  if (timer) clearInterval(timer);
  timer = null;
}
