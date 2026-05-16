import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await prisma.auditLog.findMany({
      orderBy: { at: "desc" },
      take: limit,
    });
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
