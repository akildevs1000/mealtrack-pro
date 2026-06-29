// Demo data for the Integrated Reports Suite so the reports aren't empty.
// Inserts recent scans (last 12 days incl. today) linked to real CmsEmployee
// labour codes — so the Daily Transaction report shows company + name — split
// across the company's camp AND project site (so Reports-by-Supplier shows
// multiple distribution points and project filtering has data), plus a sprinkle
// of exception statuses for the Duplicate/Eligibility report, and ~2 weeks of
// food estimations so Request Comparison has day-over-day variance.
//
// Idempotent: clears its own recent demo rows before re-inserting.
// Run: npx tsx scripts/seed-reports-demo.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMPANY = "INNOVOBLD";
const DAYS = 12;

function atUTC(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}
function isoDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Prefer the company's own sites/supplier, but fall back to any — on live the
  // CMS-created camps/managers may not carry a companyCode yet, which would make
  // the company-scoped lookups (and thus the whole seed) silently no-op.
  const camp =
    (await prisma.camp.findFirst({ where: { companyCode: COMPANY } })) ??
    (await prisma.camp.findFirst());
  const supplier =
    (await prisma.campManager.findFirst({ where: { companyCode: COMPANY } })) ??
    (await prisma.campManager.findFirst());
  const project =
    (await prisma.project.findFirst({ where: { companyCode: COMPANY } })) ??
    (await prisma.project.findFirst());
  let emps = await prisma.cmsEmployee.findMany({ where: { company: COMPANY }, take: 30 });
  if (emps.length === 0) emps = await prisma.cmsEmployee.findMany({ take: 30 });
  if (!camp || emps.length === 0) {
    console.log(`[demo] missing base data (camp/employees) for ${COMPANY} — nothing seeded`);
    return;
  }
  const primary = camp.code;
  const secondary = project?.code ?? null; // project site (e.g. PRJ-01) if present
  const sites = secondary ? [primary, secondary] : [primary];
  const labourCodes = emps.map((e) => e.laborCode);

  // --- Recent scans (last DAYS days incl. today), linked to CMS employees ---
  await prisma.scan.deleteMany({
    where: { campCode: { in: sites }, time: { gte: atUTC(DAYS + 1, 0) }, labourId: { in: labourCodes } },
  });
  const meals: { meal: "Breakfast" | "Lunch" | "Dinner"; hour: number }[] = [
    { meal: "Breakfast", hour: 6 },
    { meal: "Lunch", hour: 12 },
    { meal: "Dinner", hour: 19 },
  ];
  const scanData: any[] = [];
  for (let off = DAYS - 1; off >= 0; off--) {
    meals.forEach(({ meal, hour }, mi) => {
      emps.forEach((e, idx) => {
        if ((idx + off) % 7 === 0) return; // ~85% attendance
        // ~30% of workers eat at the project site, the rest at the camp.
        const site = secondary && idx % 10 < 3 ? secondary : primary;
        // Mostly Eligible, with a realistic sprinkle of exceptions.
        let status = "Eligible";
        if (e.mealsEligibility === "N" || e.status === "InActive") status = "NotEligible";
        else if ((idx + mi) % 17 === 0) status = "AlreadyServed"; // duplicate scan
        else if ((idx + off) % 23 === 0) status = "Expired"; // expired labour card
        else if ((idx + off + mi) % 29 === 0) status = "WrongCamp"; // scanned at wrong site
        scanData.push({
          time: atUTC(off, hour, (idx * 7 + mi * 3) % 50),
          name: e.name,
          labourId: e.laborCode,
          campCode: site,
          meal,
          status,
          managerId: supplier?.id ?? null,
        });
      });
    });
  }
  await prisma.scan.createMany({ data: scanData });

  // --- Food estimations (last DAYS days incl. today) for day-over-day comparison ---
  // One row per day per site so Request Comparison shows variance per site.
  // FoodEstimation.companyCode is an FK to Company.code — resolve a Company that
  // actually exists (the supplier's, else any) so the insert doesn't violate it.
  const company =
    (supplier?.companyCode
      ? await prisma.company.findUnique({ where: { code: supplier.companyCode } })
      : null) ?? (await prisma.company.findFirst());
  let estCount = 0;
  if (supplier && company) {
    await prisma.foodEstimation.deleteMany({ where: { supplierId: supplier.id } });
    const est: any[] = [];
    for (let off = DAYS - 1; off >= 0; off--) {
      for (const site of sites) {
        const base = site === primary ? 480 : 150;
        const b = base + ((off * 13) % 60) - 20; // gentle day-to-day swing
        est.push({
          date: new Date(`${isoDay(off)}T08:00:00.000Z`),
          companyCode: company.code,
          supplierId: supplier.id,
          projectCode: site === secondary ? site : null,
          campCode: site,
          breakfast: b,
          lunch: b + 35,
          dinner: b - 20,
        });
      }
    }
    await prisma.foodEstimation.createMany({ data: est });
    estCount = est.length;
  } else if (!company) {
    console.log("[demo] no Company row found — skipped food estimations (Request Comparison)");
  }

  console.log(
    `[demo] seeded ${scanData.length} scans across ${sites.join(", ")} + ${estCount} estimations ` +
      `for ${COMPANY} over ${DAYS} days (${isoDay(DAYS - 1)} → ${isoDay(0)})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
