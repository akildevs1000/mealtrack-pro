import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// List CMS employees (the labour roster)
router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const q = (req.query.q as string | undefined)?.trim().toLowerCase();
    const status = req.query.status as string | undefined;
    const campCode = req.query.campCode as string | undefined;

    const where: any = {};
    if (scope) where.campCode = { in: scope };
    if (campCode && campCode !== "all") where.campCode = campCode;
    if (status && status !== "all") where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { laborCode: { contains: q, mode: "insensitive" } },
        { designation: { contains: q, mode: "insensitive" } },
        { campName: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.cmsEmployee.findMany({
      where,
      orderBy: { laborCode: "asc" },
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

router.get("/:laborId", async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const emp = await prisma.cmsEmployee.findUnique({ where: { laborId: id } });
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(toApi(emp));
  } catch (e) { next(e); }
});

// Date-range meal report for an employee
router.get("/:laborId/meals", async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const fromQ = req.query.from as string | undefined;
    const toQ = req.query.to as string | undefined;
    if (!fromQ || !toQ) return res.status(400).json({ error: "from and to required (YYYY-MM-DD)" });

    const emp = await prisma.cmsEmployee.findUnique({ where: { laborId: id } });
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const records = await prisma.mealRecord.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: new Date(fromQ), lte: new Date(toQ) },
      },
      orderBy: { date: "asc" },
    });

    res.json({
      employee: toApi(emp),
      records: records.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        breakfast: { taken: r.breakfastTaken, time: r.breakfastTime },
        lunch: { taken: r.lunchTaken, time: r.lunchTime },
        dinner: { taken: r.dinnerTaken, time: r.dinnerTime },
      })),
    });
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  company: z.string(),
  laborId: z.number().int(),
  laborCode: z.string(),
  name: z.string(),
  designation: z.string(),
  doj: z.string(),
  campCode: z.string(),
  campName: z.string(),
  mealsEligibility: z.enum(["Y", "N"]),
  status: z.enum(["Active", "InActive", "leave"]),
  effectiveDate: z.string().nullable().optional(),
  lastUpdated: z.string(),
});

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const created = await prisma.cmsEmployee.create({
      data: {
        ...body,
        doj: new Date(body.doj),
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        lastUpdated: new Date(body.lastUpdated),
      },
    });
    res.status(201).json(toApi(created));
  } catch (e) { next(e); }
});

router.put("/:laborId", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const body = upsertSchema.parse(req.body);
    const updated = await prisma.cmsEmployee.update({
      where: { laborId: id },
      data: {
        ...body,
        doj: new Date(body.doj),
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        lastUpdated: new Date(body.lastUpdated),
      },
    });
    res.json(toApi(updated));
  } catch (e) { next(e); }
});

router.delete("/:laborId", requireRole("admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    await prisma.cmsEmployee.delete({ where: { laborId: id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Bulk import — wipes the CmsEmployee table (cascade-deletes meal records)
// and replaces it with the uploaded rows. Used by the "Import Excel" flow on
// the Employees page.
const importRowSchema = z.object({
  company: z.string(),
  laborId: z.number().int(),
  laborCode: z.string(),
  name: z.string(),
  designation: z.string(),
  doj: z.string(),
  campCode: z.string(),
  campName: z.string(),
  mealsEligibility: z.enum(["Y", "N"]),
  status: z.enum(["Active", "InActive", "leave"]),
  // EFECTIVE_DATE in the source workbook — used as the meal-eligibility
  // expiry date.
  effectiveDate: z.string().nullable().optional(),
  // Source LAST_UPDATED column is ignored; the server stamps this on import.
  lastUpdated: z.string().optional(),
});
const importSchema = z.object({ rows: z.array(importRowSchema).min(1) });

router.post("/import", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const { rows } = importSchema.parse(req.body);

    // Reject duplicate laborIds inside the upload itself so the user gets a
    // clean error rather than a partial wipe followed by a unique-constraint
    // failure mid-insert.
    const ids = new Set<number>();
    for (const r of rows) {
      if (ids.has(r.laborId)) {
        return res.status(400).json({ error: `Duplicate laborId in upload: ${r.laborId}` });
      }
      ids.add(r.laborId);
    }

    const importedAt = new Date();
    const data = rows.map((r) => ({
      company: r.company,
      laborId: r.laborId,
      laborCode: r.laborCode,
      name: r.name,
      designation: r.designation,
      doj: new Date(r.doj),
      campCode: r.campCode,
      campName: r.campName,
      mealsEligibility: r.mealsEligibility,
      status: r.status,
      effectiveDate: r.effectiveDate ? new Date(r.effectiveDate) : null,
      lastUpdated: importedAt,
    }));

    const result = await prisma.$transaction(async (tx) => {
      // MealRecord has onDelete: Cascade on the CmsEmployee FK so this also
      // wipes meal records.
      const deleted = await tx.cmsEmployee.deleteMany({});
      const inserted = await tx.cmsEmployee.createMany({ data });
      return { deleted: deleted.count, inserted: inserted.count };
    });

    res.json(result);
  } catch (e) { next(e); }
});

function toApi(e: any) {
  return {
    id: e.id,
    company: e.company,
    laborId: e.laborId,
    laborCode: e.laborCode,
    name: e.name,
    designation: e.designation,
    doj: e.doj.toISOString().slice(0, 10),
    campCode: e.campCode,
    campName: e.campName,
    mealsEligibility: e.mealsEligibility,
    status: e.status,
    effectiveDate: e.effectiveDate ? e.effectiveDate.toISOString().slice(0, 10) : null,
    lastUpdated: e.lastUpdated.toISOString().slice(0, 10),
  };
}

export default router;
