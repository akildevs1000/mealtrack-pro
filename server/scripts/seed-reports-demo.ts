// Demo data for the Integrated Reports Suite so the reports aren't empty.
// Inserts recent scans (last 6 days incl. today) linked to real CmsEmployee
// labour codes — so the Daily Transaction report shows company + name — plus a
// week of food estimations so Request Comparison has day-over-day variance.
//
// Idempotent: clears its own recent demo rows before re-inserting.
// Run: npx tsx scripts/seed-reports-demo.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMPANY = "INNOVOBLD";

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
  const camp = await prisma.camp.findFirst({ where: { companyCode: COMPANY } });
  const supplier = await prisma.campManager.findFirst({ where: { companyCode: COMPANY } });
  const project = await prisma.project.findFirst({ where: { companyCode: COMPANY } });
  const emps = await prisma.cmsEmployee.findMany({ where: { company: COMPANY }, take: 30 });
  if (!camp || emps.length === 0) {
    console.log(`[demo] missing base data (camp/employees) for ${COMPANY} — nothing seeded`);
    return;
  }
  const campCode = camp.code;
  const labourCodes = emps.map((e) => e.laborCode);

  // --- Recent scans (last 6 days incl. today), linked to CMS employees ---
  await prisma.scan.deleteMany({
    where: { campCode, time: { gte: atUTC(7, 0) }, labourId: { in: labourCodes } },
  });
  const meals: { meal: "Breakfast" | "Lunch" | "Dinner"; hour: number }[] = [
    { meal: "Breakfast", hour: 6 },
    { meal: "Lunch", hour: 12 },
    { meal: "Dinner", hour: 19 },
  ];
  const scanData: any[] = [];
  for (let off = 5; off >= 0; off--) {
    for (const { meal, hour } of meals) {
      emps.forEach((e, idx) => {
        if ((idx + off) % 7 === 0) return; // ~85% attendance
        let status = "Eligible";
        if (idx % 13 === 0) status = "AlreadyServed"; // duplicate scan
        else if (e.mealsEligibility === "N" || e.status === "InActive") status = "NotEligible";
        scanData.push({
          time: atUTC(off, hour, idx % 50),
          name: e.name,
          labourId: e.laborCode,
          campCode,
          meal,
          status,
          managerId: supplier?.id ?? null,
        });
      });
    }
  }
  await prisma.scan.createMany({ data: scanData });

  // --- Food estimations (last 7 days) for day-over-day comparison ---
  let estCount = 0;
  if (supplier && project) {
    await prisma.foodEstimation.deleteMany({ where: { companyCode: COMPANY, supplierId: supplier.id } });
    const est: any[] = [];
    for (let off = 7; off >= 1; off--) {
      const b = 460 + ((off * 11) % 70);
      est.push({
        date: new Date(`${isoDay(off)}T08:00:00.000Z`),
        companyCode: COMPANY,
        supplierId: supplier.id,
        projectCode: project.code,
        campCode,
        breakfast: b,
        lunch: b + 40,
        dinner: b - 25,
      });
    }
    await prisma.foodEstimation.createMany({ data: est });
    estCount = est.length;
  }

  console.log(`[demo] seeded ${scanData.length} recent scans + ${estCount} estimations for ${COMPANY} (camp ${campCode})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
