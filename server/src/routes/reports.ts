import { Router, json } from "express";
import { Readable } from "node:stream";
import { Client as FtpClient } from "basic-ftp";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth } from "../middleware/auth.js";
import { cmsEmployeeToReportRow } from "../lib/report-data.js";

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
// Parent-Company filter rule: a Company is the parent of Camp/Project/Supplier.
// When ?companyCode= is supplied, restrict the camp-based reports to that
// company's camps (Camp.companyCode), intersected with the caller's camp scope
// and any explicit ?campCode=. Resolves to concrete camp codes so the Scan
// aggregations (which key on campCode) stay correct.
async function scopeForReports(
  req: any,
  campCodeParam?: string,
  companyCodeParam?: string,
): Promise<{ where: any; codes: string[] | null }> {
  const base = campFilter(req, campCodeParam);
  const companyCode =
    typeof companyCodeParam === "string" && companyCodeParam !== "all" ? companyCodeParam : undefined;
  if (!companyCode) return base;
  const combined = base.where ? { AND: [base.where, { companyCode }] } : { companyCode };
  const camps = await prisma.camp.findMany({ where: combined, select: { code: true } });
  return { where: combined, codes: camps.map((c) => c.code) };
}
// Build the Scan campCode filter from the *resolved* scope codes only. Do NOT
// trust the raw ?campCode= param here — campFilter() already validated it against
// the caller's scope and folded it into `codes` ([] = requested an out-of-scope
// camp → match nothing). Reading the raw param would let a scoped manager read
// any camp's scans by flipping the query string (IDOR).
function scanCampWhere(codes: string[] | null) {
  if (codes) return { campCode: { in: codes } };
  return {};
}
function uiStatus(s: string) {
  return s === "AlreadyServed"
    ? "Already Served"
    : s === "NotEligible"
      ? "Not Eligible"
      : s === "WrongCamp"
        ? "Wrong Camp"
        : s;
}
function dbStatus(s: string) {
  return s === "Already Served"
    ? "AlreadyServed"
    : s === "Not Eligible"
      ? "NotEligible"
      : s === "Wrong Camp"
        ? "WrongCamp"
        : s;
}

// ---------------- /reports/consumption ----------------

router.get("/consumption", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });

    const groups = await prisma.scan.groupBy({
      by: ["campCode", "meal"],
      where: {
        time: { gte: from, lte: to },
        status: "Eligible",
        ...scanCampWhere(codes),
      },
      _count: { _all: true },
    });

    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const get = (m: string) =>
        groups.find((g) => g.campCode === c.code && g.meal === m)?._count._all ?? 0;
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
        breakfast,
        lunch,
        dinner,
        served,
        estimated,
        variance: served - estimated,
      };
    });
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days,
      rows,
    });
  } catch (e) {
    next(e);
  }
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
    const { codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );

    const where: any = {
      time: { gte: from, lte: to },
      ...scanCampWhere(codes),
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
    res.json(
      rows.map((s) => ({
        id: s.id,
        time: s.time.toISOString().slice(11, 19),
        date: s.time.toISOString().slice(0, 10),
        name: s.name,
        labourId: s.labourId,
        camp: s.campCode,
        meal: s.meal,
        status: uiStatus(s.status),
      })),
    );
  } catch (e) {
    next(e);
  }
});

// ---------------- /reports/camps ----------------

router.get("/camps", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );

    const [camps, scanGroups, devices] = await Promise.all([
      prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } }),
      prisma.scan.groupBy({
        by: ["campCode", "status"],
        where: {
          time: { gte: from, lte: to },
          ...scanCampWhere(codes),
        },
        _count: { _all: true },
      }),
      prisma.device.findMany({
        where: codes ? { campCode: { in: codes } } : undefined,
      }),
    ]);

    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const served =
        scanGroups.find((g) => g.campCode === c.code && g.status === "Eligible")?._count._all ?? 0;
      const duplicates =
        scanGroups.find((g) => g.campCode === c.code && g.status === "AlreadyServed")?._count
          ._all ?? 0;
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
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days,
      rows,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- /reports/wastage ----------------

router.get("/wastage", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });

    const served = await prisma.scan.groupBy({
      by: ["campCode"],
      where: {
        time: { gte: from, lte: to },
        status: "Eligible",
        ...scanCampWhere(codes),
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
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days,
      rows,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- /reports/employees ----------------
// Real CMS labour roster (CmsEmployee). Camp-scoped via campFilter. Note the
// CMS roster uses its own camp-coding scheme ("CAMP 19") which does not join to
// the dashboard Camp.code scheme ("AD-01"), so filtering by a dashboard camp
// code returns no rows — same behaviour as the Employees page.

router.get("/employees", async (req, res, next) => {
  try {
    const { codes } = campFilter(req, req.query.campCode as string);
    // Parent-company filter: the CMS roster's `company` field already holds the
    // Company code (e.g. "INNOVOBLD"), so employees are a sibling of Camp/Project
    // under a Company. Filter on it directly rather than via camp codes (the CMS
    // camp scheme doesn't join to Camp.code anyway — see header comment).
    const companyCode =
      typeof req.query.companyCode === "string" && req.query.companyCode !== "all"
        ? req.query.companyCode
        : undefined;
    const statusFilter = req.query.status as string | undefined;
    const q = (req.query.q as string | undefined)?.toLowerCase().trim();
    const limit = Math.min(Number(req.query.limit) || 300, 1000);

    const where: any = {};
    if (codes) where.campCode = { in: codes };
    if (companyCode) where.company = companyCode;

    const employees = await prisma.cmsEmployee.findMany({
      where,
      orderBy: { laborCode: "asc" },
    });

    const rows: ReturnType<typeof cmsEmployeeToReportRow>[] = [];
    for (const e of employees) {
      const row = cmsEmployeeToReportRow(e);
      if (statusFilter && statusFilter !== "all" && row.status !== statusFilter) continue;
      if (q && !row.name.toLowerCase().includes(q) && !row.labourId.toLowerCase().includes(q))
        continue;
      rows.push(row);
      if (rows.length >= limit) break;
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ===================================================================
// Integrated Reports Architecture Suite — 5 report components.
// All follow the parent-Company filter rule (companyCode resolves to the
// company's camps; supplier/camp/project are sibling filters).
// ===================================================================

function parseDay(s: unknown): { from: Date; to: Date; iso: string } {
  const iso =
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
  return {
    from: new Date(`${iso}T00:00:00.000Z`),
    to: new Date(`${iso}T23:59:59.999Z`),
    iso,
  };
}

const MEAL_KEYS = ["Breakfast", "Lunch", "Dinner"] as const;
function emptyMeals() {
  return { breakfast: 0, lunch: 0, dinner: 0 };
}
function addMeal(acc: { breakfast: number; lunch: number; dinner: number }, meal: string) {
  if (meal === "Breakfast") acc.breakfast++;
  else if (meal === "Lunch") acc.lunch++;
  else if (meal === "Dinner") acc.dinner++;
}

// ---------------- Report 1: Daily distribution (per employee, by date) ----------------
router.get("/daily-distribution", async (req, res, next) => {
  try {
    const { from, to, iso } = parseDay(req.query.date);
    const { codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const scans = await prisma.scan.findMany({
      where: { time: { gte: from, lte: to }, status: "Eligible", ...scanCampWhere(codes) },
      orderBy: { time: "asc" },
    });
    // One row per worker who was served that day; meal cell = the camp/location.
    const byLabour = new Map<string, { name: string; meals: Record<string, string> }>();
    for (const s of scans) {
      const e = byLabour.get(s.labourId) ?? { name: s.name, meals: {} };
      e.meals[s.meal] = s.campCode;
      byLabour.set(s.labourId, e);
    }
    const ids = [...byLabour.keys()];
    const emps = await prisma.cmsEmployee.findMany({ where: { laborCode: { in: ids } } });
    const empByCode = new Map(emps.map((e) => [e.laborCode, e]));
    const rows = ids.map((id) => {
      const e = byLabour.get(id)!;
      const emp = empByCode.get(id);
      return {
        company: emp?.company ?? "",
        employeeId: id,
        name: emp?.name ?? e.name,
        breakfast: e.meals["Breakfast"] ?? "",
        lunch: e.meals["Lunch"] ?? "",
        dinner: e.meals["Dinner"] ?? "",
      };
    });
    res.json({ date: iso, rows });
  } catch (e) {
    next(e);
  }
});

// ---------------- Report 2: Distribution point meal by supplier (pivot) ----------------
router.get("/by-supplier", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { where: campWhere, codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const camps = await prisma.camp.findMany({ where: campWhere, orderBy: { code: "asc" } });
    const supplierId = req.query.supplierId as string | undefined;
    const scanWhere: any = { time: { gte: from, lte: to }, status: "Eligible", ...scanCampWhere(codes) };
    if (supplierId && supplierId !== "all") scanWhere.managerId = supplierId;
    const scans = await prisma.scan.findMany({
      where: scanWhere,
      select: { time: true, campCode: true, meal: true },
    });
    const byDate = new Map<string, Map<string, { breakfast: number; lunch: number; dinner: number }>>();
    for (const s of scans) {
      const day = s.time.toISOString().slice(0, 10);
      const m = byDate.get(day) ?? new Map();
      const cell = m.get(s.campCode) ?? emptyMeals();
      addMeal(cell, s.meal);
      m.set(s.campCode, cell);
      byDate.set(day, m);
    }
    const rows = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => {
        const perCamp: Record<string, { breakfast: number; lunch: number; dinner: number }> = {};
        const totals = emptyMeals();
        for (const c of camps) {
          const cell = m.get(c.code) ?? emptyMeals();
          perCamp[c.code] = cell;
          totals.breakfast += cell.breakfast;
          totals.lunch += cell.lunch;
          totals.dinner += cell.dinner;
        }
        const grand = totals.breakfast + totals.lunch + totals.dinner;
        return { date, perCamp, totals, avgPerDay: Math.round(grand / 3) };
      });
    res.json({ camps: camps.map((c) => ({ code: c.code, name: c.name })), rows });
  } catch (e) {
    next(e);
  }
});

// ---------------- Report 3: Meal distribution by location (single camp, daily) ----------------
router.get("/by-location", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const scans = await prisma.scan.findMany({
      where: { time: { gte: from, lte: to }, status: "Eligible", ...scanCampWhere(codes) },
      select: { time: true, meal: true },
    });
    const byDate = new Map<string, { breakfast: number; lunch: number; dinner: number }>();
    for (const s of scans) {
      const day = s.time.toISOString().slice(0, 10);
      const cell = byDate.get(day) ?? emptyMeals();
      addMeal(cell, s.meal);
      byDate.set(day, cell);
    }
    const rows = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));
    res.json({ rows });
  } catch (e) {
    next(e);
  }
});

// ---------------- Report 4: Request comparison (Food Estimation day-over-day) ----------------
router.get("/request-comparison", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const companyCode =
      typeof req.query.companyCode === "string" && req.query.companyCode !== "all"
        ? req.query.companyCode
        : undefined;
    const supplierId = req.query.supplierId as string | undefined;
    const where: any = { date: { gte: from, lte: to } };
    if (companyCode) where.companyCode = companyCode;
    if (supplierId && supplierId !== "all") where.supplierId = supplierId;
    const ests = await prisma.foodEstimation.findMany({ where, orderBy: { date: "asc" } });

    const suppliers = await prisma.campManager.findMany({ select: { id: true, name: true } });
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

    // Flatten into (date, supplier, camp, meal) → requested, then compare to the
    // previous calendar day for the same supplier+camp+meal.
    type Key = string;
    const k = (d: string, sup: string, camp: string, meal: string): Key => `${sup}|${camp}|${meal}|${d}`;
    const requested = new Map<Key, number>();
    const meta = new Map<Key, { date: string; supplierId: string; campCode: string; meal: string }>();
    for (const e of ests) {
      const d = e.date.toISOString().slice(0, 10);
      const sup = e.supplierId ?? "";
      const camp = e.campCode ?? "";
      const cells: [string, number][] = [
        ["Breakfast", e.breakfast],
        ["Lunch", e.lunch],
        ["Dinner", e.dinner],
      ];
      for (const [meal, qty] of cells) {
        if (qty <= 0) continue;
        const key = k(d, sup, camp, meal);
        requested.set(key, (requested.get(key) ?? 0) + qty);
        meta.set(key, { date: d, supplierId: sup, campCode: camp, meal });
      }
    }
    const prevDay = (iso: string) => {
      const d = new Date(`${iso}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    const rows = [...meta.entries()]
      .sort((a, b) => a[1].date.localeCompare(b[1].date))
      .map(([key, m]) => {
        const today = requested.get(key) ?? 0;
        const yKey = k(prevDay(m.date), m.supplierId, m.campCode, m.meal);
        const yesterday = requested.get(yKey);
        const variance = yesterday === undefined ? null : today - yesterday;
        const pct =
          yesterday === undefined || yesterday === 0
            ? null
            : Math.round(((today - yesterday) / yesterday) * 100);
        return {
          date: m.date,
          supplier: supplierName.get(m.supplierId) ?? "—",
          site: m.campCode || "—",
          meal: m.meal,
          requestedYesterday: yesterday ?? null,
          requestedToday: today,
          variance,
          pctChange: pct,
        };
      });
    res.json({ rows });
  } catch (e) {
    next(e);
  }
});

// ---------------- Report 5: Duplicate / Eligibility ----------------
router.get("/duplicate-eligibility", async (req, res, next) => {
  try {
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const { codes } = await scopeForReports(
      req,
      req.query.campCode as string,
      req.query.companyCode as string,
    );
    const scans = await prisma.scan.findMany({
      where: {
        time: { gte: from, lte: to },
        status: { in: ["AlreadyServed", "NotEligible", "WrongCamp", "Expired"] },
        ...scanCampWhere(codes),
      },
      orderBy: { time: "desc" },
      take: 500,
    });
    const ids = [...new Set(scans.map((s) => s.labourId))];
    const emps = await prisma.cmsEmployee.findMany({
      where: { laborCode: { in: ids } },
      select: { laborCode: true, campCode: true },
    });
    const empCamp = new Map(emps.map((e) => [e.laborCode, e.campCode]));
    const reasonFor = (status: string, meal: string) =>
      status === "AlreadyServed"
        ? `Already scanned for ${meal}`
        : status === "NotEligible"
          ? "Not eligible — plan / HR record"
          : status === "WrongCamp"
            ? "Scanned at non-assigned camp"
            : "Labour card expired";
    const rows = scans.map((s) => ({
      workerId: s.labourId,
      actualLocation: empCamp.get(s.labourId) ?? "—",
      scanLocation: s.campCode,
      status: uiStatus(s.status),
      severity: s.status === "AlreadyServed" ? "duplicate" : "ineligible",
      reason: reasonFor(s.status, s.meal),
      meal: s.meal,
      date: s.time.toISOString().slice(0, 10),
      time: s.time.toISOString().slice(11, 19),
    }));
    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      rows,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------- /reports/push-ftp ----------------
// Uploads one or more report files to an FTP server using credentials supplied
// in the request. The client encodes each file as base64 to keep the payload as
// a single JSON request (no extra multer dependency). Per-route body limit is
// bumped to 25mb because PDFs can be sizeable.

type FtpUploadFile = {
  name: string;
  // base64 (no data: prefix). The browser produces this via FileReader / Buffer.
  contentBase64: string;
};

type FtpUploadBody = {
  host: string;
  port?: number | string;
  user: string;
  password: string;
  // Optional. Trailing slash is normalised. Defaults to "/".
  remotePath?: string;
  // FTPS toggle. Defaults to false (plain FTP on port 21).
  secure?: boolean;
  files: FtpUploadFile[];
};

function sanitiseRemoteName(name: string): string {
  // Strip any path components — we never trust client-supplied paths in filenames.
  const base = name.split(/[\\/]/).pop() || "report.bin";
  return base.replace(/[^\w.\-]+/g, "_");
}

router.post("/push-ftp", json({ limit: "25mb" }), async (req, res, next) => {
  try {
    const body = req.body as Partial<FtpUploadBody>;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid body" });
    }
    const host = String(body.host || "").trim();
    const user = String(body.user || "").trim();
    const password = String(body.password || "");
    const port = Number(body.port ?? 21) || 21;
    const secure = body.secure === true;
    const remotePath = (body.remotePath && String(body.remotePath).trim()) || "/";
    const files = Array.isArray(body.files) ? body.files : [];

    if (!host) return res.status(400).json({ error: "Missing FTP host" });
    if (!user) return res.status(400).json({ error: "Missing FTP username" });
    if (!password) return res.status(400).json({ error: "Missing FTP password" });
    if (files.length === 0) return res.status(400).json({ error: "No files to upload" });

    const client = new FtpClient(30_000);
    client.ftp.verbose = false;
    const uploaded: { name: string; bytes: number; remote: string }[] = [];

    try {
      await client.access({ host, port, user, password, secure });

      if (remotePath && remotePath !== "/" && remotePath !== ".") {
        // ensureDir creates the full path if it doesn't exist and CDs into it.
        await client.ensureDir(remotePath);
      }

      for (const f of files) {
        if (!f || typeof f.name !== "string" || typeof f.contentBase64 !== "string") {
          throw new Error("Malformed file entry");
        }
        const safeName = sanitiseRemoteName(f.name);
        const buf = Buffer.from(f.contentBase64, "base64");
        if (buf.length === 0) throw new Error(`File "${safeName}" is empty`);
        await client.uploadFrom(Readable.from(buf), safeName);
        uploaded.push({
          name: safeName,
          bytes: buf.length,
          remote: `${remotePath.replace(/\/$/, "")}/${safeName}`,
        });
      }

      res.json({
        ok: true,
        host,
        port,
        user,
        remotePath,
        uploaded,
      });
    } finally {
      client.close();
    }
  } catch (e: unknown) {
    // basic-ftp throws plain Errors — surface the message to the client so the
    // dialog can show the actual reason (auth, network, path not creatable…).
    const msg = e instanceof Error ? e.message : "FTP upload failed";
    res.status(502).json({ error: msg });
  }
});

export default router;
