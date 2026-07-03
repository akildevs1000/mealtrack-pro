import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { campScopeOf, requireAuth, requireRole } from "../middleware/auth.js";
import {
  decodeImagePayload,
  deletePhoto,
  findPhotoFile,
  hasPhoto,
  photoCodeSet,
  safeCode,
  writePhoto,
} from "../lib/employee-photos.js";
import { fetchCmsPhoto, isCmsPhotoConfigured } from "../lib/cms-oracle-photo.js";

const router = Router();

// ---- Profile photo (PUBLIC GET) --------------------------------------------
// Served without auth so it can be used directly in <img src> on the web roster
// / access card and in the mobile app, none of which can attach a Bearer token.
// Photos live on disk, keyed by laborCode (see lib/employee-photos.ts) — never
// in Oracle or the CmsEmployee table, so a CMS sync / Excel re-import can't wipe
// them. Upload/delete (below) stay behind auth.
const PHOTO_EXT_RE = /\.(jpe?g|png|webp)$/i;
router.get("/photo/:file", (req, res, next) => {
  try {
    const code = req.params.file.replace(PHOTO_EXT_RE, "");
    const found = findPhotoFile(code);
    if (!found) return res.status(404).json({ error: "No photo" });
    res.type(found.mime);
    // `no-cache` = browsers may store but must revalidate; sendFile answers the
    // conditional request with 304 when unchanged, so a replaced photo shows
    // immediately while unchanged photos stay cheap.
    res.set("Cache-Control", "no-cache");
    res.sendFile(found.file);
  } catch (e) { next(e); }
});

// ---- Access-card photo: live from Oracle CMS, disk upload as fallback -------
// PUBLIC GET (same reason as /photo above — used in <img> on the printable
// access card, which can't attach a Bearer token). Resolution order:
//   1. live EMP_PHOTO blob from Oracle CMS (fetchCmsPhoto), else
//   2. a manually-uploaded photo on disk (findPhotoFile), else
//   3. 404 → the card renders its placeholder icon.
// On staging / any host where Oracle isn't configured, step 1 is skipped and it
// behaves exactly like the disk photo route.
router.get("/:code/cms-photo", async (req, res, next) => {
  try {
    const code = safeCode(req.params.code);
    if (!code) return res.status(400).json({ error: "Invalid code" });

    const emp = await prisma.cmsEmployee.findFirst({
      where: { laborCode: code },
      select: { laborId: true, laborCode: true },
    });

    // 1. Live CMS photo. Oracle hiccups must not break the card — fall through.
    if (emp && isCmsPhotoConfigured()) {
      try {
        const photo = await fetchCmsPhoto(emp);
        if (photo) {
          res.type(photo.mime);
          res.set("Cache-Control", "private, max-age=300");
          return res.send(photo.bytes);
        }
      } catch (err) {
        console.error(`cms-photo: Oracle fetch failed for ${code}:`, (err as Error)?.message ?? err);
      }
    }

    // 2. Manually-uploaded disk photo as fallback.
    const found = findPhotoFile(code);
    if (found) {
      res.type(found.mime);
      res.set("Cache-Control", "no-cache");
      return res.sendFile(found.file);
    }

    // 3. Nothing available.
    return res.status(404).json({ error: "No photo" });
  } catch (e) {
    next(e);
  }
});

router.use(requireAuth);

// List CMS employees (the labour roster), paginated. The roster runs to tens
// of thousands of rows, so this is page/pageSize-windowed and all filters are
// applied server-side; the client never holds the full list. Returns
// `{ rows, total, page, pageSize }` (total = count matching the filters, for
// the pager).
router.get("/", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const q = (req.query.q as string | undefined)?.trim().toLowerCase();
    const status = req.query.status as string | undefined;
    const campCode = req.query.campCode as string | undefined;
    const company = req.query.company as string | undefined;

    const where: any = {};
    if (scope) where.campCode = { in: scope };
    if (campCode && campCode !== "all") where.campCode = campCode;
    if (status && status !== "all") where.status = status;
    if (company && company !== "all") where.company = company;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { laborCode: { contains: q, mode: "insensitive" } },
        { designation: { contains: q, mode: "insensitive" } },
        { campName: { contains: q, mode: "insensitive" } },
      ];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

    const [total, rows] = await prisma.$transaction([
      prisma.cmsEmployee.count({ where }),
      prisma.cmsEmployee.findMany({
        where,
        orderBy: { laborCode: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    // Flag photo-bearing rows from a single directory read so the client can
    // skip loading <img> (and the 404 fallback) for the many photo-less,
    // Oracle-synced employees.
    const withPhoto = photoCodeSet();
    res.json({
      rows: rows.map((r) => toApi(r, withPhoto.has(r.laborCode))),
      total,
      page,
      pageSize,
    });
  } catch (e) { next(e); }
});

// Roster facets for the Employees page: status counts (for the stat cards) and
// the distinct camp codes (for the camp filter) — both over the whole scoped
// roster, independent of the active filters, so the list can be paginated
// without the client holding every row. Defined BEFORE `/:laborId` so "meta"
// isn't swallowed by the numeric-id route.
router.get("/meta", async (req, res, next) => {
  try {
    const scope = campScopeOf(req);
    const where: any = {};
    if (scope) where.campCode = { in: scope };

    const [total, active, inactive, leave, campRows] = await prisma.$transaction([
      prisma.cmsEmployee.count({ where }),
      prisma.cmsEmployee.count({ where: { ...where, status: "Active" } as any }),
      prisma.cmsEmployee.count({ where: { ...where, status: "InActive" } as any }),
      prisma.cmsEmployee.count({ where: { ...where, status: "leave" } as any }),
      prisma.cmsEmployee.findMany({
        where,
        distinct: ["campCode"],
        select: { campCode: true },
        orderBy: { campCode: "asc" },
      }),
    ]);

    res.json({
      counts: { total, active, inactive, leave },
      camps: campRows.map((c) => c.campCode),
    });
  } catch (e) { next(e); }
});

router.get("/:laborId", async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const emp = await prisma.cmsEmployee.findUnique({ where: { laborId: id } });
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    res.json(toApi(emp, hasPhoto(emp.laborCode)));
  } catch (e) { next(e); }
});

// Date-range meal report for an employee
router.get("/:laborId/meals", async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const fromQ = req.query.from as string | undefined;
    const toQ = req.query.to as string | undefined;
    if (!fromQ || !toQ) return res.status(400).json({ error: "from and to required (YYYY-MM-DD)" });

    const emp = await prisma.cmsEmployee.findUnique({ where: { laborId: id } });
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const records = await prisma.mealRecord.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: new Date(fromQ), lte: new Date(toQ) },
      },
      orderBy: { date: "asc" },
    });

    res.json({
      employee: toApi(emp, hasPhoto(emp.laborCode)),
      records: records.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        breakfast: { taken: r.breakfastTaken, time: r.breakfastTime },
        lunch: { taken: r.lunchTaken, time: r.lunchTime },
        dinner: { taken: r.dinnerTaken, time: r.dinnerTime },
      })),
    });
  } catch (e) { next(e); }
});

const upsertSchema = z.object({
  company: z.string(),
  laborId: z.number().int(),
  laborCode: z.string(),
  name: z.string(),
  designation: z.string(),
  grade: z.string().nullable().optional(),
  doj: z.string(),
  campCode: z.string(),
  campName: z.string(),
  mealsEligibility: z.enum(["Y", "N"]),
  status: z.enum(["Active", "InActive", "leave"]),
  effectiveDate: z.string().nullable().optional(),
  lastUpdated: z.string(),
});

router.post("/", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    const created = await prisma.cmsEmployee.create({
      data: {
        ...body,
        doj: new Date(body.doj),
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        lastUpdated: new Date(body.lastUpdated),
      },
    });
    res.status(201).json(toApi(created));
  } catch (e) { next(e); }
});

router.put("/:laborId", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    const body = upsertSchema.parse(req.body);
    const updated = await prisma.cmsEmployee.update({
      where: { laborId: id },
      data: {
        ...body,
        doj: new Date(body.doj),
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        lastUpdated: new Date(body.lastUpdated),
      },
    });
    res.json(toApi(updated, hasPhoto(updated.laborCode)));
  } catch (e) { next(e); }
});

// ---- Profile photo: upload / remove (AUTH) ---------------------------------
const photoSchema = z.object({
  // Either a full data URL, or a {mimeType, data} split. Clients should
  // downscale before upload — the byte cap is enforced server-side.
  dataUrl: z.string().optional(),
  mimeType: z.string().optional(),
  data: z.string().optional(),
});

router.put("/photo/:laborCode", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const code = safeCode(req.params.laborCode.replace(PHOTO_EXT_RE, ""));
    if (!code) return res.status(400).json({ error: "Invalid employee code" });
    const body = photoSchema.parse(req.body);
    const { mime, bytes } = decodeImagePayload(body);
    writePhoto(code, mime, bytes);
    res.json({ ok: true, laborCode: code });
  } catch (e) {
    if (e instanceof Error && /image|large|unsupported|empty|invalid/i.test(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  }
});

router.delete("/photo/:laborCode", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const code = safeCode(req.params.laborCode.replace(PHOTO_EXT_RE, ""));
    if (!code) return res.status(400).json({ error: "Invalid employee code" });
    deletePhoto(code);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.delete("/:laborId", requireRole("admin"), async (req, res, next) => {
  try {
    const id = Number(req.params.laborId);
    await prisma.cmsEmployee.delete({ where: { laborId: id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// Bulk import — wipes the CmsEmployee table (cascade-deletes meal records)
// and replaces it with the uploaded rows. Used by the "Import Excel" flow on
// the Employees page.
const importRowSchema = z.object({
  company: z.string(),
  laborId: z.number().int(),
  laborCode: z.string(),
  name: z.string(),
  designation: z.string(),
  grade: z.string().nullable().optional(),
  doj: z.string(),
  campCode: z.string(),
  campName: z.string(),
  mealsEligibility: z.enum(["Y", "N"]),
  status: z.enum(["Active", "InActive", "leave"]),
  // EFECTIVE_DATE in the source workbook — used as the meal-eligibility
  // expiry date.
  effectiveDate: z.string().nullable().optional(),
  // Source LAST_UPDATED column is ignored; the server stamps this on import.
  lastUpdated: z.string().optional(),
});
const importSchema = z.object({ rows: z.array(importRowSchema).min(1) });

router.post("/import", requireRole("admin", "operator"), async (req, res, next) => {
  try {
    const { rows } = importSchema.parse(req.body);

    // Reject duplicate laborIds inside the upload itself so the user gets a
    // clean error rather than a partial wipe followed by a unique-constraint
    // failure mid-insert.
    const ids = new Set<number>();
    for (const r of rows) {
      if (ids.has(r.laborId)) {
        return res.status(400).json({ error: `Duplicate laborId in upload: ${r.laborId}` });
      }
      ids.add(r.laborId);
    }

    const importedAt = new Date();
    const data = rows.map((r) => ({
      company: r.company,
      laborId: r.laborId,
      laborCode: r.laborCode,
      name: r.name,
      designation: r.designation,
      grade: r.grade ?? null,
      doj: new Date(r.doj),
      campCode: r.campCode,
      campName: r.campName,
      mealsEligibility: r.mealsEligibility,
      status: r.status,
      effectiveDate: r.effectiveDate ? new Date(r.effectiveDate) : null,
      lastUpdated: importedAt,
    }));

    const result = await prisma.$transaction(async (tx) => {
      // MealRecord has onDelete: Cascade on the CmsEmployee FK so this also
      // wipes meal records.
      const deleted = await tx.cmsEmployee.deleteMany({});
      const inserted = await tx.cmsEmployee.createMany({ data });
      return { deleted: deleted.count, inserted: inserted.count };
    });

    res.json(result);
  } catch (e) { next(e); }
});

function toApi(e: any, withPhoto = false) {
  return {
    id: e.id,
    company: e.company,
    laborId: e.laborId,
    laborCode: e.laborCode,
    name: e.name,
    designation: e.designation,
    grade: e.grade ?? null,
    doj: e.doj.toISOString().slice(0, 10),
    campCode: e.campCode,
    campName: e.campName,
    mealsEligibility: e.mealsEligibility,
    status: e.status,
    effectiveDate: e.effectiveDate ? e.effectiveDate.toISOString().slice(0, 10) : null,
    lastUpdated: e.lastUpdated.toISOString().slice(0, 10),
    // Whether a profile photo is stored on disk for this employee (false for
    // every freshly Oracle-synced row until one is uploaded). The client uses
    // this to decide whether to render <img> or fall straight back to initials.
    hasPhoto: withPhoto,
  };
}

export default router;
