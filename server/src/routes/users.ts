import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, username: true, email: true, role: true,
        status: true, assignedCampCode: true, lastLoginAt: true, createdAt: true,
      },
    });
    res.json(users);
  } catch (e) { next(e); }
});

const createSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "operator", "user", "manager"]),
  assignedCampCode: z.string().nullable().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const u = await prisma.user.create({
      data: {
        name: body.name,
        username: body.username,
        email: body.email,
        passwordHash,
        role: body.role,
        assignedCampCode: body.assignedCampCode ?? null,
        status: body.status ?? "Active",
      },
      select: {
        id: true, name: true, username: true, email: true, role: true,
        status: true, assignedCampCode: true,
      },
    });
    res.status(201).json(u);
  } catch (e) { next(e); }
});

const updateSchema = createSchema.partial().extend({
  password: z.string().min(6).optional(),
});

router.put("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const data: any = { ...body };
    if (body.password) {
      data.passwordHash = await hashPassword(body.password);
      delete data.password;
    }
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, name: true, username: true, email: true, role: true,
        status: true, assignedCampCode: true,
      },
    });
    res.json(u);
  } catch (e) { next(e); }
});

router.patch("/:id/status", requireRole("admin"), async (req, res, next) => {
  try {
    const status = req.body?.status as "Active" | "Inactive";
    if (status !== "Active" && status !== "Inactive") {
      return res.status(400).json({ error: "status must be Active or Inactive" });
    }
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, status: true },
    });
    res.json(u);
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Role permissions matrix
router.get("/permissions/all", requireRole("admin"), async (_req, res, next) => {
  try {
    const perms = await prisma.rolePermission.findMany();
    // Reshape to { role: { tab: {view, edit, delete} } }
    const out: Record<string, Record<string, { view: boolean; edit: boolean; delete: boolean }>> = {};
    for (const p of perms) {
      out[p.role] ??= {};
      out[p.role][p.tab] = { view: p.view, edit: p.edit, delete: p.delete };
    }
    res.json(out);
  } catch (e) { next(e); }
});

const setPermSchema = z.object({
  role: z.enum(["admin", "operator", "user", "manager"]),
  tab: z.string(),
  view: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

router.put("/permissions/one", requireRole("admin"), async (req, res, next) => {
  try {
    const b = setPermSchema.parse(req.body);
    const p = await prisma.rolePermission.upsert({
      where: { role_tab: { role: b.role, tab: b.tab } },
      create: b,
      update: { view: b.view, edit: b.edit, delete: b.delete },
    });
    res.json(p);
  } catch (e) { next(e); }
});

export default router;
