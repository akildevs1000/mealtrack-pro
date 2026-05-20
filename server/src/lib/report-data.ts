// Report-data fetchers shared by the scheduler and the manual /reports endpoints.
// Two output shapes are exposed:
//   - fetchReportData → flat {title, columns, rows} for the XLSX builder and the
//     plain PDFKit fallback.
//   - fetchTypedReportData → the typed ReportData ReportPreview expects, used
//     by the styled-PDF (Puppeteer) path.

import { prisma } from "./prisma.js";
import type { ReportData as FlatReportData } from "./report-files.js";
import type {
  ReportData as TypedReportData,
  ReportConsumptionRow,
  ReportCampRow,
  ReportWastageRow,
  ReportScanRow,
  ReportEmployeeRow,
} from "../ssr/report-preview-types.js";

export type { TypedReportData };
// Local alias kept for callers that already use this name.
export type ReportData = FlatReportData;
export type ReportType = "consumption" | "employee" | "scans" | "camp" | "wastage";

// Map a CmsEmployee row to the shared ReportEmployeeRow used by the on-screen
// report, the styled PDF and the XLSX export. The CMS roster tracks a single
// meals-eligibility flag (Y/N) rather than per-meal flags, so breakfast/lunch/
// dinner all reflect that flag.
function mapCmsStatus(s: string): ReportEmployeeRow["status"] {
  return s === "leave" ? "Leave" : s === "InActive" ? "Inactive" : "Active";
}
export function cmsEmployeeToReportRow(e: {
  laborCode: string;
  name: string;
  campCode: string;
  company: string;
  designation: string;
  status: string;
  mealsEligibility: string;
}): ReportEmployeeRow {
  const eligible = e.mealsEligibility === "Y";
  return {
    labourId: e.laborCode,
    name: e.name,
    camp: e.campCode,
    company: e.company,
    designation: e.designation,
    status: mapCmsStatus(e.status),
    breakfast: eligible,
    lunch: eligible,
    dinner: eligible,
  };
}

// Pick a sensible reporting window based on the schedule's frequency.
export function windowForFrequency(freq: "daily" | "weekly" | "monthly"): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  if (freq === "daily") from.setUTCDate(from.getUTCDate() - 1);
  else if (freq === "weekly") from.setUTCDate(from.getUTCDate() - 7);
  else from.setUTCMonth(from.getUTCMonth() - 1);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayCount(from: Date, to: Date) {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
}

export async function fetchReportData(
  type: ReportType,
  window: { from: Date; to: Date },
): Promise<ReportData> {
  const { from, to } = window;
  const subtitle = `Period: ${fmtDate(from)} → ${fmtDate(to)}`;

  if (type === "consumption") {
    const camps = await prisma.camp.findMany({ orderBy: { code: "asc" } });
    const groups = await prisma.scan.groupBy({
      by: ["campCode", "meal"],
      where: { time: { gte: from, lte: to }, status: "Eligible" },
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
      return [c.code, c.site, breakfast, lunch, dinner, served, estimated, served - estimated];
    });
    return {
      title: "Daily Meal Consumption",
      subtitle,
      columns: [
        "Camp",
        "Site",
        "Breakfast",
        "Lunch",
        "Dinner",
        "Total Served",
        "Estimated",
        "Variance",
      ],
      rows,
    };
  }

  if (type === "camp") {
    const [camps, scanGroups, devices] = await Promise.all([
      prisma.camp.findMany({ orderBy: { code: "asc" } }),
      prisma.scan.groupBy({
        by: ["campCode", "status"],
        where: { time: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      prisma.device.findMany(),
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
      const coverage = estimated > 0 ? Math.round((served / estimated) * 100) : 0;
      return [
        c.code,
        c.name,
        c.site,
        c.employees,
        served,
        `${coverage}%`,
        Math.max(0, estimated - served),
        duplicates,
        c.online ? "Online" : "Offline",
        `${dev.filter((d) => d.online).length}/${dev.length}`,
      ];
    });
    return {
      title: "Camp Performance",
      subtitle,
      columns: [
        "Code",
        "Name",
        "Site",
        "Employees",
        "Served",
        "Coverage %",
        "Balance",
        "Duplicates",
        "Online",
        "Devices",
      ],
      rows,
    };
  }

  if (type === "wastage") {
    const camps = await prisma.camp.findMany({ orderBy: { code: "asc" } });
    const served = await prisma.scan.groupBy({
      by: ["campCode"],
      where: { time: { gte: from, lte: to }, status: "Eligible" },
      _count: { _all: true },
    });
    const days = dayCount(from, to);
    const rows = camps.map((c) => {
      const s = served.find((g) => g.campCode === c.code)?._count._all ?? 0;
      const estimated = Math.round(c.employees * days * 0.85);
      const wastage = Math.max(0, estimated - s);
      const pct = estimated > 0 ? (wastage / estimated) * 100 : 0;
      const status = pct > 10 ? "Critical" : pct > 5 ? "Watch" : "OK";
      return [c.code, c.site, estimated, s, wastage, `${pct.toFixed(1)}%`, status];
    });
    return {
      title: "Wastage & Variance",
      subtitle,
      columns: ["Camp", "Site", "Estimated", "Served", "Wastage", "% Wastage", "Status"],
      rows,
    };
  }

  if (type === "scans") {
    const rows = await prisma.scan.findMany({
      where: { time: { gte: from, lte: to } },
      orderBy: { time: "desc" },
      take: 1000,
    });
    return {
      title: "Scan Activity Log",
      subtitle,
      columns: ["Date", "Time", "Labour ID", "Name", "Camp", "Meal", "Status"],
      rows: rows.map((s) => [
        s.time.toISOString().slice(0, 10),
        s.time.toISOString().slice(11, 19),
        s.labourId,
        s.name,
        s.campCode,
        s.meal,
        s.status,
      ]),
    };
  }

  // employee — the real CMS labour roster (CmsEmployee), not a synthetic set.
  const employees = await prisma.cmsEmployee.findMany({ orderBy: { laborCode: "asc" } });
  const rows: (string | number)[][] = employees.map((e) => {
    const r = cmsEmployeeToReportRow(e);
    return [
      r.labourId,
      r.name,
      r.camp,
      r.company,
      r.designation,
      r.status,
      r.breakfast ? "Yes" : "No",
      r.lunch ? "Yes" : "No",
      r.dinner ? "Yes" : "No",
    ];
  });
  return {
    title: "Employee Master",
    subtitle: `${rows.length} employees`,
    columns: [
      "Labour ID",
      "Name",
      "Camp",
      "Company",
      "Designation",
      "Status",
      "Breakfast",
      "Lunch",
      "Dinner",
    ],
    rows,
  };
}

// Typed variant used by the styled-PDF (Puppeteer) renderer. Matches the row
// shapes ReportPreview expects, parallel to the /api/reports/* responses.
//
// Filters are optional so the scheduler can call this without one. The
// /reports/render-pdf endpoint forwards the request filters so the printed PDF
// matches the on-screen preview exactly.
export type TypedReportFilters = {
  campCodes?: string[] | null; // null = unrestricted; restrict to these codes if set
  meal?: string; // "All" | "Breakfast" | "Lunch" | "Dinner"
  status?: string; // "all" | "Eligible" | "Already Served" | ...
  q?: string; // search query (name / labour id)
};

function dbStatus(s: string) {
  return s === "Already Served"
    ? "AlreadyServed"
    : s === "Not Eligible"
      ? "NotEligible"
      : s === "Wrong Camp"
        ? "WrongCamp"
        : s;
}

function campWhere(filters: TypedReportFilters | undefined) {
  if (filters?.campCodes && filters.campCodes.length > 0) {
    return { code: { in: filters.campCodes } };
  }
  return undefined;
}
function scanCampWhere(filters: TypedReportFilters | undefined) {
  if (filters?.campCodes && filters.campCodes.length > 0) {
    return { campCode: { in: filters.campCodes } };
  }
  return {};
}

export async function fetchTypedReportData(
  type: ReportType,
  window: { from: Date; to: Date },
  filters: TypedReportFilters = {},
): Promise<TypedReportData> {
  const { from, to } = window;
  const days = dayCount(from, to);

  if (type === "consumption") {
    const camps = await prisma.camp.findMany({
      where: campWhere(filters),
      orderBy: { code: "asc" },
    });
    const groups = await prisma.scan.groupBy({
      by: ["campCode", "meal"],
      where: { time: { gte: from, lte: to }, status: "Eligible", ...scanCampWhere(filters) },
      _count: { _all: true },
    });
    const rows: ReportConsumptionRow[] = camps.map((c) => {
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
    return { kind: "consumption", rows };
  }

  if (type === "camp") {
    const [camps, scanGroups, devices] = await Promise.all([
      prisma.camp.findMany({ where: campWhere(filters), orderBy: { code: "asc" } }),
      prisma.scan.groupBy({
        by: ["campCode", "status"],
        where: { time: { gte: from, lte: to }, ...scanCampWhere(filters) },
        _count: { _all: true },
      }),
      prisma.device.findMany({
        where:
          filters.campCodes && filters.campCodes.length > 0
            ? { campCode: { in: filters.campCodes } }
            : undefined,
      }),
    ]);
    const rows: ReportCampRow[] = camps.map((c) => {
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
    return { kind: "camp", rows };
  }

  if (type === "wastage") {
    const camps = await prisma.camp.findMany({
      where: campWhere(filters),
      orderBy: { code: "asc" },
    });
    const served = await prisma.scan.groupBy({
      by: ["campCode"],
      where: { time: { gte: from, lte: to }, status: "Eligible", ...scanCampWhere(filters) },
      _count: { _all: true },
    });
    const rows: ReportWastageRow[] = camps.map((c) => {
      const s = served.find((g) => g.campCode === c.code)?._count._all ?? 0;
      const estimated = Math.round(c.employees * days * 0.85);
      const wastage = Math.max(0, estimated - s);
      const pct = estimated > 0 ? (wastage / estimated) * 100 : 0;
      const status: ReportWastageRow["status"] =
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
    return { kind: "wastage", rows };
  }

  if (type === "scans") {
    const where: Record<string, unknown> = {
      time: { gte: from, lte: to },
      ...scanCampWhere(filters),
    };
    if (filters.meal && filters.meal !== "All") where.meal = filters.meal;
    if (filters.status && filters.status !== "all") {
      where.status = dbStatus(filters.status);
    }
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { labourId: { contains: filters.q, mode: "insensitive" } },
      ];
    }
    const raw = await prisma.scan.findMany({
      where,
      orderBy: { time: "desc" },
      take: 1000,
    });
    const rows: ReportScanRow[] = raw.map((s) => ({
      id: s.id,
      date: s.time.toISOString().slice(0, 10),
      time: s.time.toISOString().slice(11, 19),
      name: s.name,
      labourId: s.labourId,
      camp: s.campCode,
      meal: s.meal as ReportScanRow["meal"],
      status: (s.status === "AlreadyServed"
        ? "Already Served"
        : s.status === "NotEligible"
          ? "Not Eligible"
          : s.status === "WrongCamp"
            ? "Wrong Camp"
            : s.status) as ReportScanRow["status"],
    }));
    return { kind: "scans", rows };
  }

  // employee — the real CMS labour roster (CmsEmployee). Note the CMS roster
  // uses its own camp-coding scheme ("CAMP 19"), which does not join to the
  // dashboard Camp.code scheme ("AD-01"); filtering by a dashboard camp code
  // therefore returns no rows, mirroring the Employees page.
  const empWhere: Record<string, unknown> = {};
  if (filters.campCodes && filters.campCodes.length > 0) {
    empWhere.campCode = { in: filters.campCodes };
  }
  const employees = await prisma.cmsEmployee.findMany({
    where: empWhere,
    orderBy: { laborCode: "asc" },
  });
  const qLower = filters.q?.toLowerCase();
  const erows: ReportEmployeeRow[] = [];
  for (const e of employees) {
    const row = cmsEmployeeToReportRow(e);
    if (filters.status && filters.status !== "all" && row.status !== filters.status) continue;
    if (
      qLower &&
      !row.name.toLowerCase().includes(qLower) &&
      !row.labourId.toLowerCase().includes(qLower)
    ) {
      continue;
    }
    erows.push(row);
  }
  return { kind: "employee", rows: erows };
}
