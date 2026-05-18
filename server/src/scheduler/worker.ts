// In-process scheduler. Ticks every 60s, claims any enabled schedules whose
// nextRunAt is in the past, and runs them serially. Designed to be safe to run
// alongside the Express request loop on a single Node instance — if you scale
// horizontally you'll need a row lock or distributed lease here.

import { prisma } from "../lib/prisma.js";
import { computeNextRunAt, runSchedule } from "../lib/schedule-runner.js";

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

async function tick() {
  if (running) return; // skip overlap if the previous tick is still working
  running = true;
  try {
    const now = new Date();
    // Enabled + (nextRunAt is null or in the past). Null happens for freshly
    // enabled schedules — backfill it on first sight.
    const due = await p.schedule.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      orderBy: { nextRunAt: "asc" },
    });

    for (const s of due) {
      if (s.nextRunAt == null) {
        // Backfill nextRunAt without running — first tick after enable just
        // schedules the next slot, it doesn't fire immediately.
        const next = computeNextRunAt({
          frequency: s.frequency,
          time: s.time,
          weekday: s.weekday,
          dayOfMonth: s.dayOfMonth,
        });
        await p.schedule.update({ where: { id: s.id }, data: { nextRunAt: next } });
        continue;
      }
      try {
        const outcome = await runSchedule(s.id);
        console.log(
          `[scheduler] ${s.id} ${s.name} → ${outcome.ok ? "OK" : "FAIL"} — ${outcome.detail}`,
        );
      } catch (e) {
        console.error(`[scheduler] ${s.id} crashed`, e);
      }
    }
  } catch (e) {
    console.error("[scheduler] tick error", e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer) return;
  console.log(`[scheduler] starting, ticking every ${TICK_MS / 1000}s`);
  // Fire one tick on startup so a recent reboot doesn't delay a missed slot.
  tick();
  timer = setInterval(tick, TICK_MS);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
