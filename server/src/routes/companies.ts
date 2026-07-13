import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// `prisma as any`: Company may be missing on a stale client until
// `prisma generate` runs (see CLAUDE.md → Gotchas). Surfaces as a runtime 500.
const p = prisma as any;

router.get("/", async (_req, res, next) => {
  try {
    const companies = await p.company.findMany({ orderBy: { code: "asc" } });
    res.json(companies.map(toApi));
  } catch (e) { next(e); }
});

router.get("/:code", async (req, res, next) => {
  try {
    const company = await p.company.findUnique({ where: { code: req.params.code } });
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(toApi(company));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contact: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  employees: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

router.post("/", requirePerm("companies", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const company = await p.company.create({ data: fromApi(body) });
    res.status(201).json(toApi(company));
  } catch (e) { next(e); }
});

router.put("/:code", requirePerm("companies", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const company = await p.company.update({
      where: { code: req.params.code },
      data: fromApi(body),
    });
    res.json(toApi(company));
  } catch (e) { next(e); }
});

router.delete("/:code", requirePerm("companies", "delete"), async (req, res, next) => {
  try {
    await p.company.delete({ where: { code: req.params.code } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(c: any) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    contact: c.contact,
    email: c.email,
    phone: c.phone,
    employees: c.employees,
    active: c.active,
  };
}

function fromApi(b: z.infer<typeof upsertSchema>) {
  return {
    code: b.code,
    name: b.name,
    contact: b.contact ?? "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    employees: b.employees ?? 0,
    active: b.active ?? true,
  };
}

export default router;
