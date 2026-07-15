import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// `prisma as any`: DistributorEmployee may be missing on a stale client until
// `prisma generate` runs (see CLAUDE.md → Gotchas).
const p = prisma as any;

// Roster of people per catering company. ?cateringCompanyId= narrows to one
// company's roster (used by the Add/Edit Distributor picker AND the
// Distributor Employees page's filter); omitted returns everyone.
router.get("/", async (req, res, next) => {
  try {
    const cateringCompanyId = req.query.cateringCompanyId as string | undefined;
    const rows = await p.distributorEmployee.findMany({
      where: cateringCompanyId ? { cateringCompanyId } : undefined,
      orderBy: { name: "asc" },
      include: { cateringCompany: { select: { name: true } }, managers: { select: { id: true } } },
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  cateringCompanyId: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  emiratesId: z.string().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
  notes: z.string().optional(),
});

// Name is unique per catering company — surface a clash as a clean 409.
function writeError(e: unknown, res: Response): boolean {
  const err = e as { code?: string };
  if (err?.code === "P2002") {
    res.status(409).json({ error: "A person with this name already exists in this catering company's roster." });
    return true;
  }
  return false;
}

router.post("/", requirePerm("distributorEmployees", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const row = await p.distributorEmployee.create({
      data: fromApi(body),
      include: { cateringCompany: { select: { name: true } }, managers: { select: { id: true } } },
    });
    res.status(201).json(toApi(row));
  } catch (e) {
    if (!writeError(e, res)) next(e);
  }
});

router.put("/:id", requirePerm("distributorEmployees", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const row = await p.distributorEmployee.update({
      where: { id: req.params.id },
      data: fromApi(body),
      include: { cateringCompany: { select: { name: true } }, managers: { select: { id: true } } },
    });
    res.json(toApi(row));
  } catch (e) {
    if (!writeError(e, res)) next(e);
  }
});

router.delete("/:id", requirePerm("distributorEmployees", "delete"), async (req, res, next) => {
  try {
    // FK from CampManager is ON DELETE SET NULL, so this never breaks an
    // existing login account — it just unlinks it from this roster entry.
    await p.distributorEmployee.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(d: any) {
  return {
    id: d.id,
    cateringCompanyId: d.cateringCompanyId,
    cateringCompanyName: d.cateringCompany?.name ?? null,
    name: d.name,
    phone: d.phone,
    email: d.email,
    emiratesId: d.emiratesId,
    status: d.status,
    notes: d.notes,
    // Whether a Distributor login account has been created for this roster
    // entry yet — lets the page show "who still needs an account."
    hasAccount: Array.isArray(d.managers) ? d.managers.length > 0 : false,
  };
}

function fromApi(b: z.infer<typeof upsertSchema>) {
  return {
    cateringCompanyId: b.cateringCompanyId,
    name: b.name,
    phone: b.phone ?? "",
    email: b.email ?? "",
    emiratesId: b.emiratesId ?? "",
    status: b.status ?? "Active",
    notes: b.notes ?? "",
  };
}

export default router;
