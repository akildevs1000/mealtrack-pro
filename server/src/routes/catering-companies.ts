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

const upsertSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
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

function toApi(c: any) {
  return {
    id: c.id,
    name: c.name,
    contact: c.contact,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    status: c.status,
  };
}

function fromApi(b: z.infer<typeof upsertSchema>) {
  return {
    name: b.name,
    contact: b.contact ?? "",
    email: b.email ?? "",
    phone: b.phone ?? "",
    notes: b.notes ?? "",
    status: b.status ?? "Active",
  };
}

export default router;
