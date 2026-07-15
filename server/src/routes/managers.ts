import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requirePerm } from "../middleware/auth.js";
import { hashPassword, hashPin } from "../lib/auth.js";
import { dubaiDateKey } from "../lib/time.js";
import { listReportSites } from "../lib/sites.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const rows = await prisma.campManager.findMany({
      where: scope ? { camps: { some: { code: { in: scope } } } } : undefined,
      orderBy: { name: "asc" },
      include: { camps: { select: { code: true } }, cateringCompany: { select: { name: true } } },
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

const createSchema = z.object({
  name: z.string(),
  username: z.string().regex(/^[a-z0-9_.-]+$/i, "username must be alphanumeric, dot, underscore or dash"),
  // Optional: suppliers aren't given an admin-panel login, so the dialog omits
  // the password. When absent we generate a random one below to keep the
  // CampManager + linked User account record valid.
  password: z.string().min(6).optional(),
  // Mobile-app PIN. Pass "" or null to clear on update; omit to leave unchanged.
  pin: z.union([pinSchema, z.literal(""), z.null()]).optional(),
  email: z.string().email(),
  phone: z.string(),
  emiratesId: z.string(),
  // One or more camps. campCodes[0] is treated as the primary camp.
  campCodes: z.array(z.string()).min(1, "At least one camp is required"),
  companyCode: z.string().nullable().optional(),
  cateringCompanyId: z.string().nullable().optional(),
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

router.post("/", requirePerm("managers", "edit"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const status = body.status ?? "Active";
    // Dedupe + keep order; first is the primary camp.
    const campCodes = [...new Set(body.campCodes)];
    const primaryCamp = campCodes[0];
    // No password supplied (supplier with no admin login) → generate a random
    // one so the account record is valid; it simply isn't shared with anyone.
    const passwordHash = await hashPassword(body.password ?? randomBytes(18).toString("base64url"));

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
          campCode: primaryCamp,
          camps: { connect: campCodes.map((code) => ({ code })) },
          companyCode: body.companyCode ?? null,
          cateringCompanyId: body.cateringCompanyId ?? null,
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
        include: { camps: { select: { code: true } }, cateringCompany: { select: { name: true } } },
      });
      await tx.user.create({
        data: {
          name: body.name,
          username: body.username,
          email: body.email,
          passwordHash,
          role: "manager",
          status: status === "Active" ? "Active" : "Inactive",
          assignedCampCode: primaryCamp,
          assignedCampCodes: campCodes,
        },
      });
      return m;
    });

    res.status(201).json(toApi(result));
  } catch (e) { next(e); }
});

const updateSchema = createSchema.partial().omit({ password: true });

router.put("/:id", requirePerm("managers", "edit"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await prisma.campManager.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Camp manager not found" });

    const { pin, campCodes, ...rest } = body as any;
    const data: any = { ...rest };
    delete data.username; // username is the link key — don't allow it to change on edit
    if (body.joinDate) data.joinDate = new Date(body.joinDate);
    if (body.expiryDate) data.expiryDate = new Date(body.expiryDate);
    if (pin !== undefined) {
      data.pinHash = pin && pin.length > 0 ? await hashPin(pin) : null;
    }
    // Resolve the camp set (if the caller sent one): primary = first, and
    // replace the many-to-many membership wholesale.
    const codes: string[] | undefined =
      campCodes !== undefined ? [...new Set(campCodes as string[])] : undefined;
    if (codes) {
      if (codes.length === 0) return res.status(400).json({ error: "At least one camp is required" });
      data.campCode = codes[0];
      data.camps = { set: codes.map((code) => ({ code })) };
    }

    const result = await prisma.$transaction(async (tx) => {
      const m = await tx.campManager.update({
        where: { id: req.params.id },
        data,
        include: { camps: { select: { code: true } }, cateringCompany: { select: { name: true } } },
      });
      // Keep the linked User in sync.
      const userPatch: any = {};
      if (body.name !== undefined) userPatch.name = body.name;
      if (body.email !== undefined) userPatch.email = body.email;
      if (codes) {
        userPatch.assignedCampCode = codes[0];
        userPatch.assignedCampCodes = codes;
      }
      if (body.status !== undefined) userPatch.status = body.status === "Active" ? "Active" : "Inactive";
      if (Object.keys(userPatch).length > 0) {
        await tx.user.updateMany({ where: { username: existing.username }, data: userPatch });
      }
      return m;
    });

    res.json(toApi(result));
  } catch (e) { next(e); }
});

// Per-distributor meal-serving report: which camp/site they scanned at and how
// many breakfast/lunch/dinner they served, day by day, over a date range. Used
// by the Catering Company drill-down (company → distributor → this report).
router.get("/:id/scan-report", async (req, res, next) => {
  try {
    const { id } = req.params;
    const fromQ = req.query.from as string | undefined;
    const toQ = req.query.to as string | undefined;
    if (!fromQ || !toQ) return res.status(400).json({ error: "from and to required (YYYY-MM-DD)" });

    const manager = await prisma.campManager.findUnique({ where: { id }, select: { id: true } });
    if (!manager) return res.status(404).json({ error: "Distributor not found" });

    const from = new Date(`${fromQ}T00:00:00.000Z`);
    const to = new Date(`${toQ}T23:59:59.999Z`);

    const scans = await prisma.scan.findMany({
      where: { managerId: id, status: "Eligible", time: { gte: from, lte: to } },
      select: { time: true, campCode: true, meal: true },
    });

    const sites = await listReportSites();
    const nameByCode = new Map(sites.map((s) => [s.code, s.name]));

    const byKey = new Map<string, { date: string; campCode: string; breakfast: number; lunch: number; dinner: number }>();
    for (const s of scans) {
      const day = dubaiDateKey(s.time);
      const key = `${day}|${s.campCode}`;
      const row = byKey.get(key) ?? { date: day, campCode: s.campCode, breakfast: 0, lunch: 0, dinner: 0 };
      if (s.meal === "Breakfast") row.breakfast++;
      else if (s.meal === "Lunch") row.lunch++;
      else if (s.meal === "Dinner") row.dinner++;
      byKey.set(key, row);
    }

    const rows = [...byKey.values()]
      .map((r) => ({ ...r, campName: nameByCode.get(r.campCode) ?? r.campCode }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.campCode.localeCompare(b.campCode));

    const totals = rows.reduce(
      (acc, r) => ({
        breakfast: acc.breakfast + r.breakfast,
        lunch: acc.lunch + r.lunch,
        dinner: acc.dinner + r.dinner,
      }),
      { breakfast: 0, lunch: 0, dinner: 0 },
    );

    const camps = [...new Set(rows.map((r) => r.campCode))].map((code) => ({
      code, name: nameByCode.get(code) ?? code,
    }));

    res.json({ rows, totals, camps });
  } catch (e) { next(e); }
});

router.delete("/:id", requirePerm("managers", "delete"), async (req, res, next) => {
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
    // Full assigned set (includes the primary). Falls back to [primary] when
    // the relation wasn't included on the query.
    camps: Array.isArray(m.camps) ? m.camps.map((c: any) => c.code) : [m.campCode],
    companyCode: m.companyCode ?? null,
    cateringCompanyId: m.cateringCompanyId ?? null,
    cateringCompanyName: m.cateringCompany?.name ?? null,
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
