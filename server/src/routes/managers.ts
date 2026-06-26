import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword, hashPin } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const rows = await prisma.campManager.findMany({
      where: scope ? { campCode: { in: scope } } : undefined,
      orderBy: { name: "asc" },
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

const createSchema = z.object({
  name: z.string(),
  username: z.string().regex(/^[a-z0-9_.-]+$/i, "username must be alphanumeric, dot, underscore or dash"),
  password: z.string().min(6),
  // Mobile-app PIN. Pass "" or null to clear on update; omit to leave unchanged.
  pin: z.union([pinSchema, z.literal(""), z.null()]).optional(),
  email: z.string().email(),
  phone: z.string(),
  emiratesId: z.string(),
  campCode: z.string(),
  companyCode: z.string().nullable().optional(),
  role: z.enum(["CampManager", "SeniorManager", "Supervisor"]),
  shift: z.enum(["Morning", "Evening", "FullDay"]),
  joinDate: z.string(),
  expiryDate: z.string(),
  status: z.enum(["Active", "Suspended", "Expired"]).optional(),
  avatar: z.string().optional(),
  permBreakfast: z.boolean().optional(),
  permLunch: z.boolean().optional(),
  permDinner: z.boolean().optional(),
  permReports: z.boolean().optional(),
});

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const status = body.status ?? "Active";
    const passwordHash = await hashPassword(body.password);

    // Reject if the username is already taken in either table — keeps the
    // two-row link (CampManager + User) consistent and avoids surprises.
    const [existingMgr, existingUser] = await Promise.all([
      prisma.campManager.findUnique({ where: { username: body.username }, select: { id: true } }),
      prisma.user.findUnique({ where: { username: body.username }, select: { id: true } }),
    ]);
    if (existingMgr) return res.status(409).json({ error: "Username already used by another camp manager" });
    if (existingUser) return res.status(409).json({ error: "Username already used by an app user" });

    const pinHash = body.pin && body.pin.length > 0 ? await hashPin(body.pin) : null;
    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.campManager.create({
        data: {
          name: body.name,
          username: body.username,
          passwordHash,
          pinHash,
          email: body.email,
          phone: body.phone,
          emiratesId: body.emiratesId,
          campCode: body.campCode,
          companyCode: body.companyCode ?? null,
          role: body.role,
          shift: body.shift,
          joinDate: new Date(body.joinDate),
          expiryDate: new Date(body.expiryDate),
          status,
          avatar: body.avatar,
          permBreakfast: body.permBreakfast ?? true,
          permLunch: body.permLunch ?? true,
          permDinner: body.permDinner ?? true,
          permReports: body.permReports ?? true,
        },
      });
      await tx.user.create({
        data: {
          name: body.name,
          username: body.username,
          email: body.email,
          passwordHash,
          role: "manager",
          status: status === "Active" ? "Active" : "Inactive",
          assignedCampCode: body.campCode,
        },
      });
      return m;
    });

    res.status(201).json(toApi(result));
  } catch (e) { next(e); }
});

const updateSchema = createSchema.partial().omit({ password: true });

router.put("/:id", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await prisma.campManager.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Camp manager not found" });

    const { pin, ...rest } = body as any;
    const data: any = { ...rest };
    delete data.username; // username is the link key — don't allow it to change on edit
    if (body.joinDate) data.joinDate = new Date(body.joinDate);
    if (body.expiryDate) data.expiryDate = new Date(body.expiryDate);
    if (pin !== undefined) {
      data.pinHash = pin && pin.length > 0 ? await hashPin(pin) : null;
    }

    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.campManager.update({ where: { id: req.params.id }, data });
      // Keep the linked User in sync.
      const userPatch: any = {};
      if (body.name !== undefined) userPatch.name = body.name;
      if (body.email !== undefined) userPatch.email = body.email;
      if (body.campCode !== undefined) userPatch.assignedCampCode = body.campCode;
      if (body.status !== undefined) userPatch.status = body.status === "Active" ? "Active" : "Inactive";
      if (Object.keys(userPatch).length > 0) {
        await tx.user.updateMany({ where: { username: existing.username }, data: userPatch });
      }
      return m;
    });

    res.json(toApi(result));
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const existing = await prisma.campManager.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Camp manager not found" });
    await prisma.$transaction(async (tx) => {
      await tx.campManager.delete({ where: { id: req.params.id } });
      await tx.user.deleteMany({ where: { username: existing.username } });
    });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(m: any) {
  return {
    id: m.id,
    name: m.name,
    username: m.username,
    email: m.email,
    phone: m.phone,
    emiratesId: m.emiratesId,
    camp: m.campCode,
    companyCode: m.companyCode ?? null,
    role: m.role === "CampManager" ? "Camp Manager" : m.role === "SeniorManager" ? "Senior Manager" : "Supervisor",
    shift: m.shift === "FullDay" ? "Full Day" : m.shift,
    joinDate: m.joinDate.toISOString().slice(0, 10),
    expiryDate: m.expiryDate.toISOString().slice(0, 10),
    status: m.status,
    lastLogin: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
    avatar: m.avatar ?? m.name.split(" ").map((p: string) => p[0]).slice(0, 2).join(""),
    hasPin: !!m.pinHash,
    permissions: {
      breakfast: m.permBreakfast,
      lunch: m.permLunch,
      dinner: m.permDinner,
      reports: m.permReports,
    },
  };
}

export default router;
