import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Real online/scanner status: derived from Device.lastSync, which every
// authenticated scanner request now touches for its device (see
// requireScannerAuth) — not a manually-set flag. A camp only counts as
// online if at least one of its registered devices has actually been heard
// from within this window; camps with zero registered devices show 0/0.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

async function deviceStatsByCamp(campCodes: string[]): Promise<Map<string, { total: number; online: number }>> {
  const devices = await prisma.device.findMany({
    where: { campCode: { in: campCodes } },
    select: { campCode: true, lastSync: true },
  });
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  const stats = new Map<string, { total: number; online: number }>();
  for (const d of devices) {
    if (!d.campCode) continue;
    const s = stats.get(d.campCode) ?? { total: 0, online: 0 };
    s.total += 1;
    if (d.lastSync && d.lastSync.getTime() >= cutoff) s.online += 1;
    stats.set(d.campCode, s);
  }
  return stats;
}

router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const camps = await prisma.camp.findMany({
      where: scope ? { code: { in: scope } } : undefined,
      orderBy: { code: "asc" },
    });
    const stats = await deviceStatsByCamp(camps.map((c) => c.code));
    res.json(camps.map((c) => toApi(c, stats.get(c.code))));
  } catch (e) { next(e); }
});

router.get("/:code", async (req, res, next) => {
  try {
    const camp = await prisma.camp.findUnique({ where: { code: req.params.code } });
    if (!camp) return res.status(404).json({ error: "Camp not found" });
    const stats = await deviceStatsByCamp([camp.code]);
    res.json(toApi(camp, stats.get(camp.code)));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  // Project / Site is now modelled as a sibling Project entity, so the camp's
  // free-text site is optional (kept for backwards compatibility / existing rows).
  site: z.string().optional(),
  companyCode: z.string().nullable().optional(),
  employees: z.number().int().nonnegative().optional(),
  online: z.boolean().optional(),
  schedule: z.object({
    breakfast: z.object({ start: z.string(), end: z.string() }),
    lunch: z.object({ start: z.string(), end: z.string() }),
    dinner: z.object({ start: z.string(), end: z.string() }),
  }).optional(),
});

router.post("/", requirePerm("camps", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const camp = await prisma.camp.create({ data: fromApi(body) });
    res.status(201).json(toApi(camp)); // brand new — never has devices yet
  } catch (e) { next(e); }
});

router.put("/:code", requirePerm("camps", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const camp = await prisma.camp.update({
      where: { code: req.params.code },
      data: fromApi(body),
    });
    const stats = await deviceStatsByCamp([camp.code]);
    res.json(toApi(camp, stats.get(camp.code)));
  } catch (e) { next(e); }
});

router.delete("/:code", requirePerm("camps", "delete"), async (req, res, next) => {
  try {
    await prisma.camp.delete({ where: { code: req.params.code } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(c: any, deviceStats?: { total: number; online: number }) {
  const devicesTotal = deviceStats?.total ?? 0;
  const devicesOnline = deviceStats?.online ?? 0;
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    site: c.site,
    companyCode: c.companyCode ?? null,
    employees: c.employees,
    online: devicesOnline > 0,
    devicesOnline,
    devicesTotal,
    schedule: {
      breakfast: { start: c.breakfastStart, end: c.breakfastEnd },
      lunch: { start: c.lunchStart, end: c.lunchEnd },
      dinner: { start: c.dinnerStart, end: c.dinnerEnd },
    },
  };
}

function fromApi(b: z.infer<typeof upsertSchema>) {
  return {
    code: b.code,
    name: b.name,
    site: b.site ?? "",
    companyCode: b.companyCode ?? null,
    employees: b.employees ?? 0,
    online: b.online ?? true,
    breakfastStart: b.schedule?.breakfast.start ?? "05:30",
    breakfastEnd: b.schedule?.breakfast.end ?? "08:30",
    lunchStart: b.schedule?.lunch.start ?? "11:30",
    lunchEnd: b.schedule?.lunch.end ?? "14:00",
    dinnerStart: b.schedule?.dinner.start ?? "18:30",
    dinnerEnd: b.schedule?.dinner.end ?? "21:30",
  };
}

export default router;
