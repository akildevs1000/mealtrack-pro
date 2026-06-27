import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const devices = await prisma.device.findMany({
      where: scope ? { campCode: { in: scope } } : undefined,
      orderBy: { name: "asc" },
    });
    res.json(devices.map(toApi));
  } catch (e) { next(e); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const d = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!d) return res.status(404).json({ error: "Device not found" });
    res.json(toApi(d));
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  name: z.string(),
  // A device is tied to either a camp or a project — both optional.
  campCode: z.string().optional().nullable(),
  projectCode: z.string().optional().nullable(),
  battery: z.number().int().min(0).max(100),
  online: z.boolean(),
  macAddress: z.string(),
  // Serial / App Version / IP Address are no longer captured in the register
  // dialog. Serial is generated from the MAC when absent (it's unique).
  serial: z.string().optional(),
  model: z.string().optional(),
  androidVersion: z.string(),
  appVersion: z.string().optional(),
  ipAddress: z.string().optional(),
  assignedTo: z.string().optional(),
  registeredOn: z.string(),
});

function buildDeviceData(body: z.infer<typeof upsertSchema>) {
  const serial =
    body.serial && body.serial.trim().length > 0
      ? body.serial
      : `SCN-${body.macAddress.replace(/[^0-9A-Za-z]/g, "").toUpperCase()}`;
  return {
    name: body.name,
    campCode: body.campCode ?? null,
    projectCode: body.projectCode ?? null,
    battery: body.battery,
    online: body.online,
    macAddress: body.macAddress,
    serial,
    model: body.model ?? "",
    androidVersion: body.androidVersion,
    appVersion: body.appVersion ?? "",
    ipAddress: body.ipAddress ?? "",
    assignedTo: body.assignedTo ?? "",
    registeredOn: new Date(body.registeredOn),
  };
}

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const d = await prisma.device.create({
      data: { ...buildDeviceData(body), lastSync: new Date() },
    });
    res.status(201).json(toApi(d));
  } catch (e) { next(e); }
});

router.put("/:id", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const d = await prisma.device.update({
      where: { id: req.params.id },
      data: buildDeviceData(body),
    });
    res.json(toApi(d));
  } catch (e) { next(e); }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await prisma.device.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

function toApi(d: any) {
  return {
    id: d.id,
    name: d.name,
    camp: d.campCode,
    projectCode: d.projectCode,
    battery: d.battery,
    online: d.online,
    lastSync: relativeTime(d.lastSync),
    macAddress: d.macAddress,
    serial: d.serial,
    model: d.model,
    androidVersion: d.androidVersion,
    appVersion: d.appVersion,
    ipAddress: d.ipAddress,
    assignedTo: d.assignedTo,
    registeredOn: d.registeredOn.toISOString().slice(0, 10),
  };
}

function relativeTime(d: Date) {
  const diffSec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default router;
