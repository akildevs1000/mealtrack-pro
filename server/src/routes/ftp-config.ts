// CRUD for the singleton FTP-server settings used by FTP-delivery schedules.
// Stored as a single row keyed by id="default" so upsert/delete are trivial.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePerm } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const FTP_ID = "default";

const upsertSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(21),
  user: z.string().min(1),
  password: z.string().min(1),
  remotePath: z.string().default("/"),
  secure: z.boolean().default(false),
});

router.get("/", async (_req, res, next) => {
  try {
    const cfg = await p.ftpConfig.findUnique({ where: { id: FTP_ID } });
    if (!cfg) return res.json(null);
    // Never expose the password to the client — return whether one is set.
    res.json({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      hasPassword: Boolean(cfg.password),
      remotePath: cfg.remotePath,
      secure: cfg.secure,
      updatedAt: cfg.updatedAt,
    });
  } catch (e) { next(e); }
});

router.put("/", requirePerm("automation", "edit"), async (req, res, next) => {
  try {
    const data = upsertSchema.parse(req.body);
    const cfg = await p.ftpConfig.upsert({
      where: { id: FTP_ID },
      create: { id: FTP_ID, ...data },
      update: data,
    });
    res.json({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      hasPassword: Boolean(cfg.password),
      remotePath: cfg.remotePath,
      secure: cfg.secure,
      updatedAt: cfg.updatedAt,
    });
  } catch (e) { next(e); }
});

router.delete("/", requirePerm("automation", "edit"), async (_req, res, next) => {
  try {
    await p.ftpConfig.delete({ where: { id: FTP_ID } }).catch(() => null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
