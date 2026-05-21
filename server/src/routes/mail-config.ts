// CRUD for the singleton SMTP settings used by email-delivery schedules.
// Mirrors ftp-config.ts. Password is write-only in responses.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const MAIL_ID = "default";

const upsertSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  username: z.string().min(1),
  password: z.string().min(1),
  secure: z.boolean().default(false),
  fromName: z.string().default("MyMeal"),
  fromEmail: z.string().email(),
});

function view(cfg: {
  host: string; port: number; username: string; password: string;
  secure: boolean; fromName: string; fromEmail: string; updatedAt: Date;
}) {
  return {
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    hasPassword: Boolean(cfg.password),
    secure: cfg.secure,
    fromName: cfg.fromName,
    fromEmail: cfg.fromEmail,
    updatedAt: cfg.updatedAt,
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const cfg = await p.mailConfig.findUnique({ where: { id: MAIL_ID } });
    res.json(cfg ? view(cfg) : null);
  } catch (e) { next(e); }
});

router.put("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const cfg = await p.mailConfig.upsert({
      where: { id: MAIL_ID },
      create: { id: MAIL_ID, ...data },
      update: data,
    });
    res.json(view(cfg));
  } catch (e) { next(e); }
});

router.delete("/", requireRole("admin", "operator"), async (_req, res, next) => {
  try {
    await p.mailConfig.delete({ where: { id: MAIL_ID } }).catch(() => null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
