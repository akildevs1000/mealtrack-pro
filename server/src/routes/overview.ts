import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth } from "../middleware/auth.js";
import { dubaiDateKey, dubaiDayOfWeek, dubaiHour, dubaiStartOfToday } from "../lib/time.js";

const router = Router();
router.use(requireAuth);

// Aggregated dashboard payload used by /overview route
router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    // Allow the client to narrow further to a single camp (e.g. the branch
    // dropdown on the Overview page). The requested camp must be inside the
    // user's permitted scope; otherwise it falls back to the full scope.
    const requested = typeof req.query.campCode === "string" ? req.query.campCode : null;
    let filterCodes: string[] | null = scope ?? null;
    if (requested) {
      if (scope && !scope.includes(requested)) {
        return res.status(403).json({ error: "Camp outside your assigned scope" });
      }
      filterCodes = [requested];
    }
    // Parent-company filter: narrow to the company's camps (Camp.companyCode),
    // intersected with the camp scope / explicit camp. Camp is a sibling of the
    // Company, so picking a company restricts the whole dashboard to its camps.
    const companyCode =
      typeof req.query.companyCode === "string" && req.query.companyCode !== "all"
        ? req.query.companyCode
        : null;
    if (companyCode) {
      const companyCamps = await prisma.camp.findMany({
        where: { companyCode },
        select: { code: true },
      });
      const companyCodes = companyCamps.map((c) => c.code);
      filterCodes = filterCodes ? filterCodes.filter((c) => companyCodes.includes(c)) : companyCodes;
    }
    const campsWhere = filterCodes ? { code: { in: filterCodes } } : undefined;
    const scanFilter = filterCodes ? { campCode: { in: filterCodes } } : {};

    const [camps, devices, todayScans] = await Promise.all([
      prisma.camp.findMany({ where: campsWhere, orderBy: { code: "asc" } }),
      prisma.device.findMany({ where: filterCodes ? { campCode: { in: filterCodes } } : undefined }),
      prisma.scan.findMany({
        where: {
          time: { gte: dubaiStartOfToday() },
          ...scanFilter,
        },
      }),
    ]);
    // Employee count reflects the camps in scope (Camp.employees is the
    // authoritative per-camp headcount used elsewhere on the dashboard).
    const employees = camps.reduce((sum, c) => sum + c.employees, 0);

    const servedToday = todayScans.filter((s) => s.status === "Eligible").length;
    const duplicates = todayScans.filter((s) => s.status === "AlreadyServed").length;
    const estimatedToday = camps.reduce((sum, c) => sum + c.employees * 3, 0);
    const onlineDevices = devices.filter((d) => d.online).length;

    // Hourly distribution (today) — buckets are Dubai hours.
    const hourlyMap = new Map<number, { breakfast: number; lunch: number; dinner: number }>();
    for (const s of todayScans) {
      const h = dubaiHour(s.time);
      const slot = hourlyMap.get(h) ?? { breakfast: 0, lunch: 0, dinner: 0 };
      if (s.meal === "Breakfast") slot.breakfast++;
      else if (s.meal === "Lunch") slot.lunch++;
      else if (s.meal === "Dinner") slot.dinner++;
      hourlyMap.set(h, slot);
    }
    const hourlyDistribution = Array.from(hourlyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([h, v]) => ({
        hour: `${(h % 12) === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"}`,
        ...v,
      }));

    // Weekly trend (last 7 days, Dubai calendar).
    const todayKey = dubaiDateKey(new Date());
    const weekStart = new Date(`${todayKey}T00:00:00.000Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekScans = await prisma.scan.groupBy({
      by: ["time"],
      where: {
        time: { gte: weekStart },
        ...scanFilter,
      },
      _count: { _all: true },
    });
    const byDay = new Map<string, number>();
    for (const r of weekScans) {
      const day = dubaiDateKey(r.time);
      byDay.set(day, (byDay.get(day) ?? 0) + r._count._all);
    }
    const weekly: { day: string; served: number; estimated: number }[] = [];
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + i);
      const key = dubaiDateKey(d);
      weekly.push({
        day: dayLabels[dubaiDayOfWeek(d)],
        served: byDay.get(key) ?? 0,
        estimated: estimatedToday,
      });
    }

    // Meal split (today)
    const split = { Breakfast: 0, Lunch: 0, Dinner: 0 };
    for (const s of todayScans) split[s.meal as keyof typeof split]++;
    const perMealEstimate = camps.reduce((sum, c) => sum + c.employees, 0);

    res.json({
      kpis: {
        totalCamps: camps.length,
        activeEmployees: employees,
        servedToday,
        estimatedToday,
        balance: Math.max(0, estimatedToday - servedToday),
        duplicates,
        onlineDevices,
        totalDevices: devices.length,
      },
      hourlyDistribution,
      weeklyTrend: weekly,
      mealSplit: [
        { name: "Breakfast", value: split.Breakfast },
        { name: "Lunch", value: split.Lunch },
        { name: "Dinner", value: split.Dinner },
      ],
      mealSessions: {
        breakfast: { served: split.Breakfast, estimated: perMealEstimate },
        lunch:     { served: split.Lunch,     estimated: perMealEstimate },
        dinner:    { served: split.Dinner,    estimated: perMealEstimate },
      },
      campComparison: camps.map((c) => ({
        name: c.code,
        served: todayScans.filter((s) => s.campCode === c.code && s.status === "Eligible").length,
        estimated: c.employees * 3,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
