import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const camps = await prisma.camp.findMany({
      where: scope ? { code: { in: scope } } : undefined,
      orderBy: { code: "asc" },
    });
    res.json(camps.map(toApi));
  } catch (e) { next(e); }
});

router.get("/:code", async (req, res, next) => {
  try {
    const camp = await prisma.camp.findUnique({ where: { code: req.params.code } });
    if (!camp) return res.status(404).json({ error: "Camp not found" });
    res.json(toApi(camp));
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

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const camp = await prisma.camp.create({ data: fromApi(body) });
    res.status(201).json(toApi(camp));
  } catch (e) { next(e); }
});

router.put("/:code", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const camp = await prisma.camp.update({
      where: { code: req.params.code },
      data: fromApi(body),
    });
    res.json(toApi(camp));
  } catch (e) { next(e); }
});

router.delete("/:code", requireRole("admin"), async (req, res, next) => {
  try {
    await prisma.camp.delete({ where: { code: req.params.code } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(c: any) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    site: c.site,
    companyCode: c.companyCode ?? null,
    employees: c.employees,
    online: c.online,
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
