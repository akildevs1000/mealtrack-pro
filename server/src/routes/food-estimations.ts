import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// `prisma as any`: FoodEstimation may be missing on a stale client until
// `prisma generate` runs (see CLAUDE.md → Gotchas). Surfaces as a runtime 500.
const p = prisma as any;

router.get("/", async (req, res, next) => {
  try {
    const { companyCode, from, to } = req.query as Record<string, string | undefined>;
    const where: any = {};
    if (companyCode) where.companyCode = companyCode;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const rows = await p.foodEstimation.findMany({
      where,
      orderBy: { date: "desc" },
      take: 200,
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  date: z.string().optional(), // ISO; defaults to now (current date)
  companyCode: z.string().min(1),
  supplierId: z.string().nullable().optional(),
  projectCode: z.string().nullable().optional(),
  campCode: z.string().nullable().optional(),
  breakfast: z.number().int().nonnegative().optional(),
  lunch: z.number().int().nonnegative().optional(),
  dinner: z.number().int().nonnegative().optional(),
});

router.post("/", requireRole("admin", "operator", "manager"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const row = await p.foodEstimation.create({
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        companyCode: body.companyCode,
        supplierId: body.supplierId ?? null,
        projectCode: body.projectCode ?? null,
        campCode: body.campCode ?? null,
        breakfast: body.breakfast ?? 0,
        lunch: body.lunch ?? 0,
        dinner: body.dinner ?? 0,
      },
    });
    res.status(201).json(toApi(row));
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    await p.foodEstimation.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(r: any) {
  return {
    id: r.id,
    date: r.date instanceof Date ? r.date.toISOString() : r.date,
    companyCode: r.companyCode,
    supplierId: r.supplierId ?? null,
    projectCode: r.projectCode ?? null,
    campCode: r.campCode ?? null,
    breakfast: r.breakfast,
    lunch: r.lunch,
    dinner: r.dinner,
  };
}

export default router;
