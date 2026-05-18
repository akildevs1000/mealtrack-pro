import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import authRouter from "./routes/auth.js";
import campsRouter from "./routes/camps.js";
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
import { errorHandler, notFound } from "./middleware/error.js";
import { startScheduler } from "./scheduler/worker.js";

const app = express();
const PORT = Number(process.env.PORT || 5044);

const origins = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());
app.use(cors({ origin: origins.includes("*") ? true : origins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/camps", campsRouter);
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

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  // Boot the in-process cron only after the HTTP server is up so any startup
  // crashes still surface a useful "listening on…" line first.
  startScheduler();
});
