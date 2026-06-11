// CMS roster sync — status + manual trigger.
//   GET  /api/cms-sync        → config presence + last run summary
//   POST /api/cms-sync/run    → run a sync now (admin/operator)
//
// The connection secrets live in env vars (per the access doc's
// "no secrets in source / use env vars" rule), so there is no config-write
// endpoint here — unlike mail-config / ftp-config which store creds in the DB.

import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isOracleConfigured } from "../lib/cms-oracle.js";
import { getLastSync, isSyncRunning, runCmsSync } from "../lib/cms-sync.js";

const router = Router();
router.use(requireAuth);

router.get("/", (_req, res) => {
  res.json({
    configured: isOracleConfigured(),
    enabled: process.env.CMS_SYNC_ENABLED === "1",
    intervalMin: Number(process.env.CMS_SYNC_INTERVAL_MIN || 60),
    running: isSyncRunning(),
    lastRun: getLastSync(),
  });
});

router.post("/run", requireRole("admin", "operator"), async (_req, res, next) => {
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
