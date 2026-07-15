import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signScannerToken, verifyPin } from "../lib/auth.js";
import { requireScannerAuth } from "../middleware/auth.js";
import { dubaiHHMM, dubaiStartOfToday, dubaiStartOfDay, formatDubaiTime } from "../lib/time.js";
import { photoUrl } from "../lib/employee-photos.js";

const router = Router();

// Meal eligibility expires on the employee's `effectiveDate` (the EFECTIVE_DATE
// column from CMS). Workers keep meal access for this many days after that date
// — a grace period for in-flight contract renewals — before the ID is treated
// as expired. Keep in sync with EXPIRY_GRACE_DAYS in src/routes/employees.tsx.
const EXPIRY_GRACE_DAYS = 15;

// A scanning site is a Camp OR a Project (both physical sites with meal windows).
// resolveSite() unifies them into one camp-shaped object the scanner flow uses.
type SiteInfo = {
  code: string;
  name: string;
  site: string; // camp.site or project.location
  companyCode: string | null;
  siteType: "camp" | "project";
  breakfastStart: string; breakfastEnd: string;
  lunchStart: string; lunchEnd: string;
  dinnerStart: string; dinnerEnd: string;
};

async function resolveSite(siteCode: string | null | undefined): Promise<SiteInfo | null> {
  if (!siteCode) return null;
  const windowSel = {
    breakfastStart: true, breakfastEnd: true,
    lunchStart: true, lunchEnd: true,
    dinnerStart: true, dinnerEnd: true,
  };
  const camp = await prisma.camp.findUnique({
    where: { code: siteCode },
    select: { code: true, name: true, site: true, companyCode: true, ...windowSel },
  });
  if (camp) return { ...camp, companyCode: camp.companyCode ?? null, siteType: "camp" };
  const project = await (prisma as any).project.findUnique({
    where: { code: siteCode },
    select: { code: true, name: true, location: true, companyCode: true, ...windowSel },
  });
  if (project) {
    return {
      code: project.code,
      name: project.name,
      site: project.location,
      companyCode: project.companyCode ?? null,
      siteType: "project",
      breakfastStart: project.breakfastStart, breakfastEnd: project.breakfastEnd,
      lunchStart: project.lunchStart, lunchEnd: project.lunchEnd,
      dinnerStart: project.dinnerStart, dinnerEnd: project.dinnerEnd,
    };
  }
  return null;
}

// ---------- PUBLIC: list managers the scanner can log in as ----------
// Mobile clients call this before login to render a picker.
router.get("/managers", async (_req, res, next) => {
  try {
    const managers = await prisma.campManager.findMany({
      where: { status: "Active", pinHash: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, username: true, name: true, campCode: true, avatar: true },
    });
    res.json(managers);
  } catch (e) { next(e); }
});

// ---------- LOGIN ----------
// Body: { managerId, pin, deviceMac? }   (deviceMac is OPTIONAL and IGNORED)
// Returns: { token, manager, device, camp }
//
// The device MAC is no longer an enrolment gate — the scanner does NOT need to
// be registered in the Devices table. The session's site (meal windows + parent
// company) comes from the MANAGER's assigned camp. deviceMac is accepted for
// backward-compat and echoed back, but never validated.
const loginSchema = z.object({
  managerId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  deviceMac: z.string().optional(),
});

router.post("/login", async (req, res, next) => {
  try {
    const { managerId, pin, deviceMac } = loginSchema.parse(req.body);

    // 1) Credentials.
    const manager = await prisma.campManager.findUnique({
      where: { id: managerId },
      select: {
        id: true, username: true, name: true, campCode: true,
        status: true, pinHash: true, avatar: true,
        camps: { select: { code: true } },
      },
    });
    if (!manager || !manager.pinHash) {
      return res.status(401).json({ error: "Invalid manager or PIN" });
    }
    if (manager.status !== "Active") {
      return res.status(403).json({ error: "Manager account is not active" });
    }
    const ok = await verifyPin(pin, manager.pinHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid manager or PIN" });
    }

    // 2) Site = the manager's assigned camp (primary campCode, else first of the
    //    supplier's camp set). The device MAC is ignored entirely.
    const siteCode = manager.campCode ?? manager.camps[0]?.code ?? null;
    const site = await resolveSite(siteCode);
    if (!site) {
      return res.status(403).json({
        error: "No site for this session",
        reason: "manager_no_site",
        message: "This manager isn't assigned to a camp or project. Ask an admin to set it.",
      });
    }

    // Scans belong to the manager's own camp, so there is never a mismatch.
    const sessionCampCode = site.code;
    const campMismatch = false;

    // Camp-shaped site object the scanner app renders (name + meal windows).
    const camp = {
      code: site.code,
      name: site.name,
      site: site.site,
      breakfastStart: site.breakfastStart, breakfastEnd: site.breakfastEnd,
      lunchStart: site.lunchStart, lunchEnd: site.lunchEnd,
      dinnerStart: site.dinnerStart, dinnerEnd: site.dinnerEnd,
    };

    await prisma.campManager.update({
      where: { id: manager.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signScannerToken({
      sub: manager.id,
      username: manager.username,
      campCode: sessionCampCode,
      siteType: site.siteType,
      companyCode: site.companyCode,
    });

    // Synthetic device row so the client keeps its expected shape (no Devices
    // table row is required anymore).
    const device = {
      id: null,
      name: "Scanner",
      campCode: site.siteType === "camp" ? site.code : null,
      projectCode: site.siteType === "project" ? site.code : null,
      model: null,
      serial: null,
      macAddress: deviceMac ?? null,
    };

    res.json({
      token,
      manager: {
        id: manager.id,
        username: manager.username,
        name: manager.name,
        campCode: sessionCampCode,
        avatar: manager.avatar,
      },
      device,
      camp,
      campMismatch,
    });
  } catch (e) {
    next(e);
  }
});

// ---------- SESSION INFO (after login) ----------
router.get("/me", requireScannerAuth, async (req, res, next) => {
  try {
    const m = await prisma.campManager.findUnique({
      where: { id: req.scanner!.managerId },
      select: {
        id: true, username: true, name: true, campCode: true, status: true,
        permBreakfast: true, permLunch: true, permDinner: true,
      },
    });
    if (!m) return res.status(404).json({ error: "Manager not found" });
    res.json({ manager: m });
  } catch (e) { next(e); }
});

// ---------- HOME DASHBOARD: STATS ----------
// Today's counts for the logged-in manager's camp. Scoped by the scanner token
// (campCode), so the :id the mobile client passes is ignored — the server is
// the source of truth.
router.get("/stats", requireScannerAuth, async (req, res, next) => {
  try {
    const campCode = req.scanner!.campCode;
    const dayStart = dubaiStartOfToday(new Date());

    const employees = await prisma.cmsEmployee.count({
      where: { campCode, status: "Active", mealsEligibility: "Y" },
    });

    // Served today = distinct labourIds with an Eligible scan today in this camp.
    const eligible = await prisma.scan.findMany({
      where: { campCode, status: "Eligible", time: { gte: dayStart } },
      select: { labourId: true },
    });
    const served_today = new Set(eligible.map((s) => s.labourId)).size;

    // "Denied" = anything that isn't a successful serve. Matches the app's NO
    // badge, which marks every non-Eligible scan (NotEligible + AlreadyServed +
    // Expired) red — so the tile and the list agree.
    const denied_today = await prisma.scan.count({
      where: { campCode, status: { not: "Eligible" }, time: { gte: dayStart } },
    });

    const pending = Math.max(0, employees - served_today);

    res.json({ employees, served_today, pending, denied_today });
  } catch (e) { next(e); }
});

// ---------- HOME DASHBOARD: RECENT ACTIVITY ----------
// Today's scans for the manager's camp, newest first, paginated. Shape matches
// what the mobile HomeScreen renders (result / employee / meal_rule / reason).
router.get("/logs", requireScannerAuth, async (req, res, next) => {
  try {
    const campCode = req.scanner!.campCode;
    const dayStart = dubaiStartOfToday(new Date());
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

    const rows = await prisma.scan.findMany({
      where: { campCode, time: { gte: dayStart } },
      orderBy: { time: "desc" },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((s) => toLogApi(s, req));

    res.json({ data, hasMore });
  } catch (e) { next(e); }
});

// ---------- HOME DASHBOARD: MEAL RULES ----------
// The manager's camp meal windows, in the {name,start_time,end_time} shape the
// mobile client uses to highlight the active meal.
router.get("/meal-rules", requireScannerAuth, async (req, res, next) => {
  try {
    const site = await resolveSite(req.scanner!.campCode);
    if (!site) return res.json([]);
    res.json([
      { name: "Breakfast", start_time: site.breakfastStart, end_time: site.breakfastEnd },
      { name: "Lunch", start_time: site.lunchStart, end_time: site.lunchEnd },
      { name: "Dinner", start_time: site.dinnerStart, end_time: site.dinnerEnd },
    ]);
  } catch (e) { next(e); }
});

// ---------- DEVICE INFO BY MAC ----------
// Public — the scanner calls this BEFORE login so the operator can confirm
// they're binding the right device.
router.get("/device/:mac", async (req, res, next) => {
  try {
    const mac = req.params.mac;
    const device = await prisma.device.findFirst({
      where: { macAddress: { equals: mac, mode: "insensitive" } },
      select: { id: true, name: true, campCode: true, projectCode: true, model: true, serial: true },
    });
    if (!device) return res.status(404).json({ error: "Device not registered" });
    const site = await resolveSite(device.campCode ?? device.projectCode);
    const camp = site
      ? { code: site.code, name: site.name, site: site.site }
      : null;
    res.json({ device, camp });
  } catch (e) { next(e); }
});

// ---------- SCAN ----------
// Decodes the QR (CmsEmployee.laborCode) and records a scan. Camp is the
// manager's assigned camp. deviceMac is optional and only recorded for audit.
const scanSchema = z.object({
  code: z.string().min(1),
  deviceMac: z.string().optional(),
  meal: z.enum(["Breakfast", "Lunch", "Dinner"]).optional(),
});

router.post("/scan", requireScannerAuth, async (req, res, next) => {
  try {
    const { code, meal: forcedMeal, deviceMac } = scanSchema.parse(req.body);

    const campCode = req.scanner!.campCode;
    const companyCode = req.scanner!.companyCode;
    const site = await resolveSite(campCode);
    if (!site) {
      return res.status(400).json({ status: "error", reason: "site_missing" });
    }

    // Resolve the employee up front so even denied results (outside meal
    // window, etc.) can show the person's name + photo on the result card.
    const employee = await prisma.cmsEmployee.findFirst({
      where: { OR: [{ laborCode: code }, { laborId: Number.isFinite(Number(code)) ? Number(code) : -1 }] },
    });

    const now = new Date();
    const hhmm = dubaiHHMM(now);
    const meal = forcedMeal ?? mealForTime(hhmm, site);
    if (!meal) {
      const scan = await prisma.scan.create({
        data: {
          name: employee?.name ?? code,
          labourId: employee?.laborCode ?? code,
          campCode,
          meal: "Lunch",
          status: "Expired",
          managerId: req.scanner!.managerId,
          deviceMac,
        },
      });
      return res.json({
        status: "expired",
        reason: "outside_meal_window",
        ...(employee ? { employee: toEmployeeApi(employee, req) } : {}),
        scan: toScanApi(scan),
      });
    }

    if (!employee) {
      const scan = await prisma.scan.create({
        data: {
          name: code, labourId: code, campCode, meal,
          status: "NotEligible",
          managerId: req.scanner!.managerId,
          deviceMac,
        },
      });
      return res.json({ status: "not_eligible", reason: "unknown_employee", scan: toScanApi(scan) });
    }

    // Company scope: a worker may take a meal at ANY camp/project of their parent
    // company, but not at another company's site. CmsEmployee.company holds the
    // company code (e.g. "INNOVOBLD"), matched against the site's companyCode.
    if (companyCode && employee.company !== companyCode) {
      const scan = await prisma.scan.create({
        data: {
          name: employee.name, labourId: employee.laborCode, campCode, meal,
          status: "WrongCamp",
          managerId: req.scanner!.managerId,
          deviceMac,
        },
      });
      return res.json({
        status: "wrong_camp",
        reason: "wrong_company",
        employee: toEmployeeApi(employee, req),
        scan: toScanApi(scan),
      });
    }

    // Eligibility expiry (effectiveDate) + 15-day grace. Past the grace window
    // the ID is denied as expired even if the Y/N flag still says eligible.
    if (employee.effectiveDate) {
      const graceCutoff = dubaiStartOfDay(employee.effectiveDate);
      graceCutoff.setUTCDate(graceCutoff.getUTCDate() + EXPIRY_GRACE_DAYS);
      if (dubaiStartOfToday(now).getTime() > graceCutoff.getTime()) {
        const scan = await prisma.scan.create({
          data: {
            name: employee.name, labourId: employee.laborCode, campCode, meal,
            status: "NotEligible",
            managerId: req.scanner!.managerId,
            deviceMac,
          },
        });
        return res.json({
          status: "not_eligible",
          reason: "id_expired",
          employee: toEmployeeApi(employee, req),
          scan: toScanApi(scan),
        });
      }
    }

    if (employee.mealsEligibility !== "Y" || employee.status !== "Active") {
      const scan = await prisma.scan.create({
        data: {
          name: employee.name, labourId: employee.laborCode, campCode, meal,
          status: "NotEligible",
          managerId: req.scanner!.managerId,
          deviceMac,
        },
      });
      return res.json({
        status: "not_eligible",
        reason:
          employee.status === "leave"
            ? "on_leave"
            : employee.status !== "Active"
              ? "employee_inactive"
              : "meal_ineligible",
        employee: toEmployeeApi(employee, req),
        scan: toScanApi(scan),
      });
    }

    const dayStart = dubaiStartOfToday(now);
    const record = await prisma.mealRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: dayStart } },
    });
    const tag = meal === "Breakfast" ? "breakfastTaken" : meal === "Lunch" ? "lunchTaken" : "dinnerTaken";
    if (record && (record as any)[tag]) {
      const scan = await prisma.scan.create({
        data: {
          name: employee.name, labourId: employee.laborCode, campCode, meal,
          status: "AlreadyServed",
          managerId: req.scanner!.managerId,
          deviceMac,
        },
      });
      return res.json({
        status: "already_served",
        reason: `already_${meal.toLowerCase()}`,
        employee: toEmployeeApi(employee, req),
        scan: toScanApi(scan),
      });
    }

    const timeStr = hhmm; // already Dubai HH:MM
    const upsertData: any = {};
    upsertData[tag] = true;
    upsertData[meal === "Breakfast" ? "breakfastTime" : meal === "Lunch" ? "lunchTime" : "dinnerTime"] = timeStr;
    await prisma.mealRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date: dayStart } },
      create: { employeeId: employee.id, date: dayStart, ...upsertData },
      update: upsertData,
    });

    const scan = await prisma.scan.create({
      data: {
        name: employee.name, labourId: employee.laborCode, campCode, meal,
        status: "Eligible",
        managerId: req.scanner!.managerId,
        deviceMac,
      },
    });

    res.json({
      status: "eligible",
      employee: toEmployeeApi(employee, req),
      meal,
      time: timeStr,
      scan: toScanApi(scan),
    });
  } catch (e) {
    next(e);
  }
});

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

function mealForTime(hhmm: string, camp: { breakfastStart: string; breakfastEnd: string; lunchStart: string; lunchEnd: string; dinnerStart: string; dinnerEnd: string }) {
  if (hhmm >= camp.breakfastStart && hhmm <= camp.breakfastEnd) return "Breakfast" as const;
  if (hhmm >= camp.lunchStart && hhmm <= camp.lunchEnd) return "Lunch" as const;
  if (hhmm >= camp.dinnerStart && hhmm <= camp.dinnerEnd) return "Dinner" as const;
  return null;
}

function toScanApi(s: any) {
  return {
    id: s.id,
    // ISO so the mobile UI can format locally; also include a pre-formatted
    // Dubai time string for any consumer that just wants to display it.
    time: new Date(s.time).toISOString(),
    timeDubai: formatDubaiTime(s.time),
    name: s.name,
    labourId: s.labourId,
    camp: s.campCode,
    meal: s.meal,
    status: s.status,
  };
}

// Maps a Scan row to the log shape the mobile HomeScreen renders. The Scan
// table only persists a coarse status (not the granular scan reason), so we
// derive a reason code the app's reasonLabel() understands.
function toLogApi(s: any, req: Request) {
  const allowed = s.status === "Eligible";
  let reason: string | null = null;
  if (!allowed) {
    if (s.status === "AlreadyServed") reason = `already_${String(s.meal).toLowerCase()}`;
    else if (s.status === "Expired") reason = "outside_meal_window";
    else reason = "meal_ineligible";
  }
  return {
    id: s.id,
    result: allowed ? "allowed" : "denied",
    reason,
    // Scan.labourId holds the laborCode, which keys the on-disk photo.
    employee: { name: s.name, employee_code: s.labourId, profile_picture: photoUrl(req, s.labourId) },
    meal_rule: { name: s.meal },
    scanned_at: new Date(s.time).toISOString(),
  };
}

function toEmployeeApi(e: any, req: Request) {
  return {
    id: e.id,
    laborId: e.laborId,
    laborCode: e.laborCode,
    name: e.name,
    designation: e.designation,
    company: e.company,
    campCode: e.campCode,
    campName: e.campName,
    profile_picture: photoUrl(req, e.laborCode),
    profilePicture: photoUrl(req, e.laborCode),
  };
}

export default router;
