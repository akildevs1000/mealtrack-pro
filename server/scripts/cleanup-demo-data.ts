// Wipe the demo/seed data before customer handover.
//
//   cd server && npx tsx scripts/cleanup-demo-data.ts            # dry run: shows counts only
//   cd server && npx tsx scripts/cleanup-demo-data.ts --confirm  # actually deletes
//
// Deletes: scans, meal records, CMS employees, devices, camp managers, camps,
// and every app user EXCEPT `admin`. Keeps: the admin user, role permissions,
// schedules, FTP/mail config. Safe to re-run.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const confirm = process.argv.includes("--confirm");

async function main() {
  const counts = {
    scans: await prisma.scan.count(),
    mealRecords: await prisma.mealRecord.count(),
    cmsEmployees: await prisma.cmsEmployee.count(),
    devices: await prisma.device.count(),
    campManagers: await prisma.campManager.count(),
    camps: await prisma.camp.count(),
    nonAdminUsers: await prisma.user.count({ where: { username: { not: "admin" } } }),
  };
  console.log("Current data:", counts);

  if (!confirm) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --confirm to wipe the above.");
    console.log("(Keeps: admin user, role permissions, schedules, FTP/mail config.)");
    return;
  }

  // FK order: Scan and Device reference Camp; MealRecord cascades off
  // CmsEmployee but is deleted explicitly anyway for clear reporting.
  const r = await prisma.$transaction(async (tx) => ({
    scans: (await tx.scan.deleteMany({})).count,
    mealRecords: (await tx.mealRecord.deleteMany({})).count,
    cmsEmployees: (await tx.cmsEmployee.deleteMany({})).count,
    devices: (await tx.device.deleteMany({})).count,
    campManagers: (await tx.campManager.deleteMany({})).count,
    camps: (await tx.camp.deleteMany({})).count,
    nonAdminUsers: (await tx.user.deleteMany({ where: { username: { not: "admin" } } })).count,
  }));

  console.log("\nDeleted:", r);
  console.log("Kept: admin user, role permissions, schedules, FTP/mail config.");
  console.log("Reminder: change the admin password in the UI if you haven't already.");
}

main()
  .catch((e) => {
    console.error("✗ failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
