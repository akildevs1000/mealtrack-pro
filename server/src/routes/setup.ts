// First-run provisioning endpoints for the desktop (Electron) build.
//
// This router is ONLY mounted when the process is started with
// MEALOPS_DESKTOP=1 (see index.ts), so it adds zero attack surface to the
// production web deployment. Every handler is additionally idempotent and
// refuses to touch an already-provisioned database.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/auth.js";

const router = Router();

// GET /api/setup/status — has this database already been provisioned?
router.get("/status", async (_req, res, next) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ initialized: userCount > 0, userCount });
  } catch (err) {
    next(err);
  }
});

const bootstrapSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// POST /api/setup/bootstrap-admin — create the very first admin account.
// Refuses with 409 if ANY user already exists, so it is safe to call on every
// launch and can never add accounts to an already-provisioned database.
router.post("/bootstrap-admin", async (req, res, next) => {
  try {
    const existing = await prisma.user.count();
    if (existing > 0) {
      return res
        .status(409)
        .json({ error: "Database already has users; refusing to bootstrap." });
    }
    const { username, password, name, email } = bootstrapSchema.parse(req.body);
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        name: name || "Administrator",
        email: email || `${username}@local`,
        passwordHash,
        role: "admin",
        status: "Active",
        assignedCampCode: null,
      },
      select: { id: true, username: true, name: true, email: true, role: true },
    });
    res.status(201).json({ created: true, user });
  } catch (err) {
    next(err);
  }
});

export default router;
