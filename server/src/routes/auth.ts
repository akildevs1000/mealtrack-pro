import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    if (user.status !== "Active") return res.status(403).json({ error: "User is not active" });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken({ sub: user.id, role: user.role, username: user.username });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        assignedCampCode: user.assignedCampCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, username: true, email: true,
        role: true, status: true, assignedCampCode: true, lastLoginAt: true,
      },
    });
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (err) {
    next(err);
  }
});

export default router;
