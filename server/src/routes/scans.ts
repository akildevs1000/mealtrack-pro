import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";
import { formatDubaiTime } from "../lib/time.js";

const router = Router();
router.use(requireAuth);

// Recent scans (defaults to last 50)
router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = await prisma.scan.findMany({
      where: scope ? { campCode: { in: scope } } : undefined,
      orderBy: { time: "desc" },
      take: limit,
    });
    res.json(rows.map(toApi));
  } catch (e) { next(e); }
});

const createSchema = z.object({
  name: z.string(),
  labourId: z.string(),
  campCode: z.string(),
  meal: z.enum(["Breakfast", "Lunch", "Dinner"]),
  status: z.enum(["Eligible", "AlreadyServed", "NotEligible", "WrongCamp", "Expired"]),
});

router.post("/", requireRole("admin", "operator", "manager"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const s = await prisma.scan.create({ data: body });
    res.status(201).json(toApi(s));
  } catch (e) { next(e); }
});

function toApi(s: any) {
  return {
    id: s.id,
    time: formatDubaiTime(s.time),
    name: s.name,
    labourId: s.labourId,
    camp: s.campCode,
    meal: s.meal,
    status: s.status === "AlreadyServed" ? "Already Served"
          : s.status === "NotEligible" ? "Not Eligible"
          : s.status === "WrongCamp" ? "Wrong Camp"
          : s.status,
  };
}

export default router;
