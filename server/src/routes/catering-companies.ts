import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// `prisma as any`: CateringCompany may be missing on a stale client until
// `prisma generate` runs (see CLAUDE.md → Gotchas).
const p = prisma as any;

router.get("/", async (_req, res, next) => {
  try {
    const rows = await p.cateringCompany.findMany({ orderBy: { name: "asc" } });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const s = z.string().optional();
const upsertSchema = z.object({
  name: z.string().min(1),
  customerType: z.enum(["Business", "Individual"]).optional(),
  companyName: s,
  salutation: s,
  firstName: s,
  lastName: s,
  contact: s,
  email: s,
  phone: s,
  addressLine: s,
  city: s,
  country: s,
  trn: s,
  taxTreatment: s,
  placeOfSupply: s,
  notes: s,
  status: z.enum(["Active", "Inactive"]).optional(),
});

// A distributor references CateringCompany.id, so its name is @unique — surface
// a clash as a clean 409 rather than a bare 500.
function writeError(e: unknown, res: Response): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code === "P2002") {
    res.status(409).json({ error: "A catering company with this name already exists." });
    return true;
  }
  return false;
}

router.post("/", requirePerm("catering", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const row = await p.cateringCompany.create({ data: fromApi(body) });
    res.status(201).json(toApi(row));
  } catch (e) {
    if (!writeError(e, res)) next(e);
  }
});

router.put("/:id", requirePerm("catering", "edit"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const row = await p.cateringCompany.update({
      where: { id: req.params.id },
      data: fromApi(body),
    });
    res.json(toApi(row));
  } catch (e) {
    if (!writeError(e, res)) next(e);
  }
});

router.delete("/:id", requirePerm("catering", "delete"), async (req, res, next) => {
  try {
    // The distributor FK is ON DELETE SET NULL, so deleting a catering company
    // just unlinks any distributors pointing at it — no cascade damage.
    await p.cateringCompany.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

const FIELDS = [
  "companyName", "salutation", "firstName", "lastName", "contact",
  "email", "phone", "addressLine", "city", "country", "trn",
  "taxTreatment", "placeOfSupply", "notes",
] as const;

function toApi(c: any) {
  const out: Record<string, any> = {
    id: c.id,
    name: c.name,
    customerType: c.customerType,
    status: c.status,
  };
  for (const f of FIELDS) out[f] = c[f] ?? "";
  return out;
}

function fromApi(b: z.infer<typeof upsertSchema>) {
  const out: Record<string, any> = {
    name: b.name,
    customerType: b.customerType ?? "Business",
    status: b.status ?? "Active",
  };
  for (const f of FIELDS) out[f] = (b as any)[f] ?? "";
  return out;
}

export default router;
