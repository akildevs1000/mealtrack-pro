import { Router, json } from "express";
import { Readable } from "node:stream";
import { Client as FtpClient } from "basic-ftp";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth } from "../middleware/auth.js";
import { fetchTypedReportData, type ReportType } from "../lib/report-data.js";
import { buildStyledPdfBuffer } from "../lib/report-pdf-styled.js";

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

// ---------------- /reports/render-pdf ----------------
// Renders the same styled PDF the scheduler uses, but on demand for the
// /reports page's Download PDF button. Filters mirror the GET data endpoints.

const REPORT_TYPES: ReportType[] = ["consumption", "employee", "scans", "camp", "wastage"];

router.get("/render-pdf", async (req, res, next) => {
  try {
    const type = String(req.query.type ?? "") as ReportType;
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: "Invalid report type" });
    }
    const from = parseFrom(req.query.from);
    const to = parseTo(req.query.to);
    const scope = campScopeOf(req);
    const campParam = typeof req.query.camp === "string" && req.query.camp !== "all"
      ? req.query.camp
      : undefined;
    // Effective camp restriction: intersect manager scope with explicit filter.
    let campCodes: string[] | null = null;
    if (campParam) {
      if (scope && !scope.includes(campParam)) campCodes = []; // no overlap → empty result
      else campCodes = [campParam];
    } else if (scope) {
      campCodes = scope;
    }

    const meal = typeof req.query.meal === "string" ? req.query.meal : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

    const data = await fetchTypedReportData(type, { from, to }, {
      campCodes,
      meal,
      status,
      q: q || undefined,
    });

    const fromIso = from.toISOString().slice(0, 10);
    const toIso = to.toISOString().slice(0, 10);
    const scopeLabel = campParam ?? (scope
      ? (scope.length === 1 ? scope[0]! : `${scope.length} camps`)
      : "All Camps");

    const buffer = await buildStyledPdfBuffer({
      type,
      filters: {
        from: fromIso, to: toIso,
        camp: campParam ?? "all",
        meal: (meal as "All" | "Breakfast" | "Lunch" | "Dinner" | undefined) ?? "All",
        status: status ?? "all",
        query: q ?? "",
      },
      scopeLabel,
      data,
    });

    const filename = `${type}_${fromIso}_to_${toIso}${campParam ? "_" + campParam : ""}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (e) { next(e); }
});

export default router;
