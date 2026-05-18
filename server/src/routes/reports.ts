import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ---------------- helpers ----------------

function parseFrom(s: unknown, defaultDays = 7): Date {
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00.000Z");
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - defaultDays);
  return d;
}
function parseTo(s: unknown): Date {
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T23:59:59.999Z");
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
function dayCount(from: Date, to: Date) {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
}
function campFilter(req: any, codeParam?: string): { where: any; codes: string[] | null } {
  const scope = campScopeOf(req);
  const code = typeof codeParam === "string" && codeParam !== "all" ? codeParam : undefined;
  if (code) {
    if (scope && !scope.includes(code)) return { where: { code: "__none__" }, codes: [] };
    return { where: { code }, codes: [code] };
  }
  if (scope) return { where: { code: { in: scope } }, codes: scope };
  return { where: undefined, codes: null };
}
function scanCampWhere(codes: string[] | null, code?: string) {
  if (code && code !== "all") return { campCode: code };
  if (codes) return { campCode: { in: codes } };
  return {};
}
function uiStatus(s: string) {
  return s === "AlreadyServed" ? "Already Served"
    : s === "NotEligible" ? "Not Eligible"
      : s === "WrongCamp" ? "Wrong Camp"
        : s;
}
function dbStatus(s: string) {
  return s === "Already Served" ? "AlreadyServed"
    : s === "Not Eligible" ? "NotEligible"
      : s === "Wrong Camp" ? "WrongCamp"
        : s;
}

// ---------------- /reports/consumption ----------------

router.get("/consumption", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = campFilter(req, req.query.campCode as string);
    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });

    const groups = await prisma.scan.groupBy({
      by: ["campCode", "meal"],
      where: {
        time: { gte: from, lte: to },
        status: "Eligible",
        ...scanCampWhere(codes, req.query.campCode as string),
      },
      _count: { _all: true },
    });

    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const get = (m: string) => groups.find((g) => g.campCode === c.code && g.meal === m)?._count._all ?? 0;
      const breakfast = get("Breakfast");
      const lunch = get("Lunch");
      const dinner = get("Dinner");
      const served = breakfast + lunch + dinner;
      const estimated = Math.round(c.employees * days * 0.85);
      return {
        code: c.code,
        name: c.name,
        site: c.site,
        employees: c.employees,
        breakfast, lunch, dinner, served, estimated,
        variance: served - estimated,
      };
    });
    res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days, rows });
  } catch (e) { next(e); }
});

// ---------------- /reports/scans ----------------

router.get("/scans", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const meal = req.query.meal as string | undefined;
    const status = req.query.status as string | undefined;
    const q = (req.query.q as string | undefined)?.toLowerCase().trim();
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const { codes } = campFilter(req, req.query.campCode as string);

    const where: any = {
      time: { gte: from, lte: to },
      ...scanCampWhere(codes, req.query.campCode as string),
    };
    if (meal && meal !== "All") where.meal = meal;
    if (status && status !== "all") where.status = dbStatus(status);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { labourId: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.scan.findMany({
      where,
      orderBy: { time: "desc" },
      take: limit,
    });
    res.json(rows.map((s) => ({
      id: s.id,
      time: s.time.toISOString().slice(11, 19),
      date: s.time.toISOString().slice(0, 10),
      name: s.name,
      labourId: s.labourId,
      camp: s.campCode,
      meal: s.meal,
      status: uiStatus(s.status),
    })));
  } catch (e) { next(e); }
});

// ---------------- /reports/camps ----------------

router.get("/camps", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = campFilter(req, req.query.campCode as string);

    const [camps, scanGroups, devices] = await Promise.all([
      prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } }),
      prisma.scan.groupBy({
        by: ["campCode", "status"],
        where: { time: { gte: from, lte: to }, ...scanCampWhere(codes, req.query.campCode as string) },
        _count: { _all: true },
      }),
      prisma.device.findMany({
        where: codes ? { campCode: { in: codes } } : undefined,
      }),
    ]);

    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const served = scanGroups.find((g) => g.campCode === c.code && g.status === "Eligible")?._count._all ?? 0;
      const duplicates = scanGroups.find((g) => g.campCode === c.code && g.status === "AlreadyServed")?._count._all ?? 0;
      const estimated = Math.round(c.employees * days * 0.85);
      const dev = devices.filter((d) => d.campCode === c.code);
      return {
        code: c.code,
        name: c.name,
        site: c.site,
        employees: c.employees,
        served,
        estimated,
        coverage: estimated > 0 ? Math.round((served / estimated) * 100) : 0,
        balance: Math.max(0, estimated - served),
        duplicates,
        online: c.online,
        devicesOnline: dev.filter((d) => d.online).length,
        devicesTotal: dev.length,
      };
    });
    res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days, rows });
  } catch (e) { next(e); }
});

// ---------------- /reports/wastage ----------------

router.get("/wastage", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = campFilter(req, req.query.campCode as string);
    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });

    const served = await prisma.scan.groupBy({
      by: ["campCode"],
      where: {
        time: { gte: from, lte: to },
        status: "Eligible",
        ...scanCampWhere(codes, req.query.campCode as string),
      },
      _count: { _all: true },
    });

    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const s = served.find((g) => g.campCode === c.code)?._count._all ?? 0;
      const estimated = Math.round(c.employees * days * 0.85);
      const wastage = Math.max(0, estimated - s);
      const pct = estimated > 0 ? (wastage / estimated) * 100 : 0;
      const status: "healthy" | "watch" | "critical" =
        pct <= 5 ? "healthy" : pct <= 10 ? "watch" : "critical";
      return {
        code: c.code,
        name: c.name,
        site: c.site,
        estimated,
        served: s,
        wastage,
        pct,
        status,
      };
    });
    res.json({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days, rows });
  } catch (e) { next(e); }
});

// ---------------- /reports/employees ----------------
// Synthesized roster aligned to Camp.code (separate from the CMS roster which
// uses a different camp-coding scheme). Deterministic per (camp, slot).

const NAMES = [
  "Mohammed Rafiq", "Suresh Kumar", "Anwar Hussain", "Ramesh Babu", "Bilal Ahmed",
  "Vinod Sharma", "Iqbal Khan", "Tariq Mahmood", "Sanjay Patel", "Imran Sheikh",
  "Ravi Verma", "Karim Aslam", "Naveen Kumar", "Faisal Iqbal", "Pradeep Singh",
  "Mohammed Asif", "Wasim Akram", "Hari Krishnan", "Vimal Raj", "Younis Ahmed",
];
const COMPANIES = ["Al Futtaim Construction", "Arabtec", "ALEC", "Khansaheb"];
const DESIGNATIONS = ["Mason", "Carpenter", "Steel Fixer", "Electrician", "Plumber", "Helper"];
const STATUSES = ["Active", "Active", "Active", "Active", "Active", "Active", "Leave", "Vacation", "Inactive"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

router.get("/employees", async (req, res, next) => {
  try {
    const { where: campWhere } = campFilter(req, req.query.campCode as string);
    const statusFilter = req.query.status as string | undefined;
    const q = (req.query.q as string | undefined)?.toLowerCase().trim();
    const limit = Math.min(Number(req.query.limit) || 300, 1000);

    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });

    const rows: any[] = [];
    for (const c of camps) {
      const per = Math.min(50, Math.max(8, Math.floor(c.employees / 30)));
      for (let i = 0; i < per; i++) {
        const h = hash(`${c.code}:${i}`);
        const nameBase = NAMES[h % NAMES.length];
        const name = i >= NAMES.length ? `${nameBase} ${Math.floor(i / NAMES.length) + 1}` : nameBase;
        const status = STATUSES[(h >> 3) % STATUSES.length];
        if (statusFilter && statusFilter !== "all" && status !== statusFilter) continue;
        const labourId = `LB-${(20000 + (h % 79999)).toString().padStart(5, "0")}`;
        if (q && !name.toLowerCase().includes(q) && !labourId.toLowerCase().includes(q)) continue;
        rows.push({
          labourId,
          name,
          camp: c.code,
          company: COMPANIES[(h >> 5) % COMPANIES.length],
          designation: DESIGNATIONS[(h >> 7) % DESIGNATIONS.length],
          status,
          breakfast: (h % 7) !== 0,
          lunch: true,
          dinner: (h % 5) !== 0,
        });
      }
    }
    res.json(rows.slice(0, limit));
  } catch (e) { next(e); }
});

export default router;
