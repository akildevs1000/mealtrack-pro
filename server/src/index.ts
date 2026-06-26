import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRouter from "./routes/auth.js";
import campsRouter from "./routes/camps.js";
import companiesRouter from "./routes/companies.js";
import projectsRouter from "./routes/projects.js";
import employeesRouter from "./routes/employees.js";
import devicesRouter from "./routes/devices.js";
import managersRouter from "./routes/managers.js";
import usersRouter from "./routes/users.js";
import scansRouter from "./routes/scans.js";
import overviewRouter from "./routes/overview.js";
import auditRouter from "./routes/audit.js";
import scannerRouter from "./routes/scanner.js";
import reportsRouter from "./routes/reports.js";
import schedulesRouter from "./routes/schedules.js";
import ftpConfigRouter from "./routes/ftp-config.js";
import mailConfigRouter from "./routes/mail-config.js";
import cmsSyncRouter from "./routes/cms-sync.js";
import setupRouter from "./routes/setup.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { startScheduler } from "./scheduler/worker.js";
import { startCmsSync } from "./scheduler/cms-sync-worker.js";
import { ensureDefaultPermissions } from "./lib/ensure-permissions.js";

const app = express();
const PORT = Number(process.env.PORT || 5044);

const origins = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/camps", campsRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/managers", managersRouter);
app.use("/api/users", usersRouter);
app.use("/api/scans", scansRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/audit", auditRouter);
app.use("/api/scanner", scannerRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/ftp-config", ftpConfigRouter);
app.use("/api/mail-config", mailConfigRouter);
app.use("/api/cms-sync", cmsSyncRouter);

// Desktop-only first-run provisioning. Mounted exclusively when the Electron
// launcher sets MEALOPS_DESKTOP=1, so the web deployment never exposes it.
if (process.env.MEALOPS_DESKTOP === "1") {
  app.use("/api/setup", setupRouter);
  console.log("[server] desktop mode: /api/setup mounted");
}

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  // Backfill any newly-added (role, tab) rows so the live DB stays in sync
  // with source after a deploy — no destructive re-seed needed.
  try {
    await ensureDefaultPermissions();
  } catch (e) {
    console.error("[permissions] ensureDefaultPermissions failed", e);
  }
  // Boot the in-process cron only after the HTTP server is up so any startup
  // crashes still surface a useful "listening on…" line first.
  startScheduler();
  // CMS → Postgres roster sync (no-op unless Oracle is configured + enabled).
  startCmsSync();
});
