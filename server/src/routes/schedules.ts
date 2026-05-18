// Scheduled-reports CRUD + manual trigger.
// The cron worker (server/src/scheduler/worker.ts) reads Schedule rows directly.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { computeNextRunAt, runSchedule } from "../lib/schedule-runner.js";

const router = Router();
router.use(requireAuth);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const reportType = z.enum(["consumption", "employee", "scans", "camp", "wastage"]);
const format = z.enum(["pdf", "excel", "both"]);
const frequency = z.enum(["daily", "weekly", "monthly"]);
const destination = z.enum(["email", "ftp"]);

const baseSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(false),
  reportType,
  format,
  frequency,
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM"),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  destination,
  recipientIds: z.array(z.string()).default([]),
});

function deriveNextRunAt(s: z.infer<typeof baseSchema>) {
  if (!s.enabled) return null;
  return computeNextRunAt({
    frequency: s.frequency,
    time: s.time,
    weekday: s.weekday ?? null,
    dayOfMonth: s.dayOfMonth ?? null,
  });
}

router.get("/", async (_req, res, next) => {
  try {
    const rows = await p.schedule.findMany({ orderBy: { createdAt: "desc" } });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const data = baseSchema.parse(req.body);
    const created = await p.schedule.create({
      data: { ...data, nextRunAt: deriveNextRunAt(data) },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

router.patch("/:id", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const id = req.params.id;
    const existing = await p.schedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Schedule not found" });

    const merged = { ...existing, ...req.body };
    const data = baseSchema.partial().parse(req.body);

    // Recompute nextRunAt if anything timing-related changed (or enabled flipped).
    const timingChanged =
      "enabled" in data || "frequency" in data || "time" in data ||
      "weekday" in data || "dayOfMonth" in data;
    const nextRunAt = timingChanged
      ? (merged.enabled
          ? computeNextRunAt({
              frequency: merged.frequency,
              time: merged.time,
              weekday: merged.weekday,
              dayOfMonth: merged.dayOfMonth,
            })
          : null)
      : undefined;

    const updated = await p.schedule.update({
      where: { id },
      data: { ...data, ...(nextRunAt !== undefined ? { nextRunAt } : {}) },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    await p.schedule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Manual trigger — runs synchronously and returns the outcome so the UI can
// surface success/failure immediately.
router.post("/:id/run", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const outcome = await runSchedule(req.params.id);
    res.status(outcome.ok ? 200 : 502).json(outcome);
  } catch (e) { next(e); }
});

export default router;
