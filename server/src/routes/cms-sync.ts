// CMS roster sync — status + manual trigger.
//   GET  /api/cms-sync        → config presence + last run summary
//   POST /api/cms-sync/run    → run a sync now (admin/operator)
//
// The connection secrets live in env vars (per the access doc's
// "no secrets in source / use env vars" rule), so there is no config-write
// endpoint here — unlike mail-config / ftp-config which store creds in the DB.

import { Router } from "express";
import { requireAuth, requirePerm } from "../middleware/auth.js";
import { isOracleConfigured } from "../lib/cms-oracle.js";
import { getLastSync, isSyncRunning, runCmsSync } from "../lib/cms-sync.js";

const router = Router();
router.use(requireAuth);

router.get("/", (_req, res) => {
  // Effective interval in seconds: CMS_SYNC_INTERVAL_SEC wins, else minutes×60.
  const intervalSec = process.env.CMS_SYNC_INTERVAL_SEC
    ? Number(process.env.CMS_SYNC_INTERVAL_SEC)
    : Number(process.env.CMS_SYNC_INTERVAL_MIN || 60) * 60;
  res.json({
    configured: isOracleConfigured(),
    enabled: process.env.CMS_SYNC_ENABLED === "1",
    intervalSec,
    intervalMin: Math.round((intervalSec / 60) * 100) / 100, // back-compat
    running: isSyncRunning(),
    lastRun: getLastSync(),
  });
});

router.post("/run", requirePerm("employees", "edit"), async (_req, res, next) => {
  try {
    if (!isOracleConfigured()) {
      return res.status(400).json({ error: "Oracle CMS is not configured on this server." });
    }
    if (isSyncRunning()) {
      return res.status(409).json({ error: "A CMS sync is already running." });
    }
    const summary = await runCmsSync();
    res.status(summary.ok ? 200 : 502).json(summary);
  } catch (e) {
    next(e);
  }
});

export default router;
