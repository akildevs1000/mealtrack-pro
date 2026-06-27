import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// `prisma as any`: Project may be missing on a stale client until
// `prisma generate` runs (see CLAUDE.md → Gotchas). Surfaces as a runtime 500.
const p = prisma as any;

router.get("/", async (_req, res, next) => {
  try {
    const projects = await p.project.findMany({ orderBy: { code: "asc" } });
    res.json(projects.map(toApi));
  } catch (e) { next(e); }
});

router.get("/:code", async (req, res, next) => {
  try {
    const project = await p.project.findUnique({ where: { code: req.params.code } });
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(toApi(project));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  location: z.string().optional(),
  company: z.string().optional(),
  companyCode: z.string().nullable().optional(),
  manager: z.string().optional(),
  employees: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
  schedule: z.object({
    breakfast: z.object({ start: z.string(), end: z.string() }),
    lunch: z.object({ start: z.string(), end: z.string() }),
    dinner: z.object({ start: z.string(), end: z.string() }),
  }).optional(),
});

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const project = await p.project.create({ data: fromApi(body) });
    res.status(201).json(toApi(project));
  } catch (e) { next(e); }
});

router.put("/:code", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const project = await p.project.update({
      where: { code: req.params.code },
      data: fromApi(body),
    });
    res.json(toApi(project));
  } catch (e) { next(e); }
});

router.delete("/:code", requireRole("admin"), async (req, res, next) => {
  try {
    await p.project.delete({ where: { code: req.params.code } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(c: any) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    location: c.location,
    company: c.company,
    companyCode: c.companyCode ?? null,
    manager: c.manager,
    employees: c.employees,
    active: c.active,
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
    location: b.location ?? "",
    company: b.company ?? "",
    companyCode: b.companyCode ?? null,
    manager: b.manager ?? "",
    employees: b.employees ?? 0,
    active: b.active ?? true,
    breakfastStart: b.schedule?.breakfast.start ?? "05:30",
    breakfastEnd: b.schedule?.breakfast.end ?? "08:30",
    lunchStart: b.schedule?.lunch.start ?? "11:30",
    lunchEnd: b.schedule?.lunch.end ?? "14:00",
    dinnerStart: b.schedule?.dinner.start ?? "18:30",
    dinnerEnd: b.schedule?.dinner.end ?? "21:30",
  };
}

export default router;
