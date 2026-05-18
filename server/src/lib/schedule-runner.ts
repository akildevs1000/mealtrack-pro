// Shared runner that turns a Schedule row into delivered files.
// Used by both the cron worker and the manual "Run now" endpoint.

import { Readable } from "node:stream";
import { Client as FtpClient } from "basic-ftp";
import { prisma } from "./prisma.js";
import {
  fetchReportData,
  fetchTypedReportData,
  windowForFrequency,
  type ReportType,
} from "./report-data.js";
import { buildXlsxBuffer } from "./report-files.js";
import { buildStyledPdfBuffer } from "./report-pdf-styled.js";

export type RunOutcome = {
  ok: boolean;
  detail: string;
  uploaded?: { name: string; bytes: number }[];
};

export function computeNextRunAt(
  s: { frequency: "daily" | "weekly" | "monthly"; time: string; weekday: number | null; dayOfMonth: number | null },
  from: Date = new Date(),
): Date | null {
  const [h, m] = s.time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const cand = new Date(from);
  cand.setSeconds(0, 0);
  cand.setHours(h, m, 0, 0);

  if (s.frequency === "daily") {
    if (cand <= from) cand.setDate(cand.getDate() + 1);
    return cand;
  }
  if (s.frequency === "weekly") {
    const target = s.weekday ?? 1;
    const delta = (target - cand.getDay() + 7) % 7;
    cand.setDate(cand.getDate() + delta);
    if (cand <= from) cand.setDate(cand.getDate() + 7);
    return cand;
  }
  // monthly
  const day = Math.min(28, s.dayOfMonth ?? 1);
  cand.setDate(day);
  if (cand <= from) cand.setMonth(cand.getMonth() + 1);
  return cand;
}

function sanitiseRemoteName(name: string): string {
  const base = name.split(/[\\/]/).pop() || "report.bin";
  return base.replace(/[^\w.\-]+/g, "_");
}

// Build the report files for a schedule. Returns the list keyed by filename.
// PDF goes through the styled (Puppeteer + ReportPreview) path so it matches
// the on-screen /reports preview pixel-for-pixel. XLSX uses the flat table
// shape from fetchReportData.
async function buildFiles(
  reportType: ReportType,
  format: "pdf" | "excel" | "both",
  frequency: "daily" | "weekly" | "monthly",
): Promise<{ name: string; buffer: Buffer }[]> {
  const window = windowForFrequency(frequency);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${reportType}_${stamp}`;
  const out: { name: string; buffer: Buffer }[] = [];

  if (format === "pdf" || format === "both") {
    const typed = await fetchTypedReportData(reportType, window);
    const fromIso = window.from.toISOString().slice(0, 10);
    const toIso = window.to.toISOString().slice(0, 10);
    const buffer = await buildStyledPdfBuffer({
      type: reportType,
      filters: { from: fromIso, to: toIso, camp: "all", meal: "All", status: "all", query: "" },
      scopeLabel: "All Camps",
      data: typed,
    });
    out.push({ name: `${base}.pdf`, buffer });
  }
  if (format === "excel" || format === "both") {
    const flat = await fetchReportData(reportType, window);
    out.push({ name: `${base}.xlsx`, buffer: buildXlsxBuffer(flat) });
  }
  return out;
}

// Execute a single schedule's delivery + persist its run state. Designed to
// never throw — the worker can call this in a loop without crash-looping.
export async function runSchedule(scheduleId: string): Promise<RunOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any;
  const s = await p.schedule.findUnique({ where: { id: scheduleId } });
  if (!s) return { ok: false, detail: "Schedule not found" };

  let outcome: RunOutcome;

  try {
    if (s.destination === "ftp") {
      const cfg = await p.ftpConfig.findUnique({ where: { id: "default" } });
      if (!cfg) {
        outcome = { ok: false, detail: "No FTP server configured" };
      } else {
        const files = await buildFiles(s.reportType, s.format, s.frequency);
        const client = new FtpClient(30_000);
        client.ftp.verbose = false;
        const uploaded: { name: string; bytes: number }[] = [];
        try {
          await client.access({
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            secure: cfg.secure,
          });
          if (cfg.remotePath && cfg.remotePath !== "/" && cfg.remotePath !== ".") {
            await client.ensureDir(cfg.remotePath);
          }
          for (const f of files) {
            const safeName = sanitiseRemoteName(f.name);
            await client.uploadFrom(Readable.from(f.buffer), safeName);
            uploaded.push({ name: safeName, bytes: f.buffer.length });
          }
        } finally {
          client.close();
        }
        outcome = {
          ok: true,
          detail: `Uploaded ${uploaded.length} file(s) to ftp://${cfg.user}@${cfg.host}:${cfg.port}${cfg.remotePath}`,
          uploaded,
        };
      }
    } else {
      // Email delivery is intentionally not wired yet (phase 2).
      outcome = { ok: false, detail: "Email delivery is not yet implemented" };
    }
  } catch (e: unknown) {
    outcome = { ok: false, detail: e instanceof Error ? e.message : "Run failed" };
  }

  const nextRunAt = computeNextRunAt({
    frequency: s.frequency,
    time: s.time,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
  });
  await p.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: outcome.ok ? "success" : "failed",
      lastRunDetail: outcome.detail.slice(0, 500),
      nextRunAt,
    },
  });

  return outcome;
}
