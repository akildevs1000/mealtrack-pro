// Removes everything scripts/seed-catering-dummy.ts created:
//   - the dummy Scan rows (labourId starting with "DUMMY-")
//   - the 2 catering companies it created ("Sabari Catering LLC", "Gulf Fresh Meals")
//   - unlinks the 6 distributors it linked (cateringCompanyId -> null)
// Leaves the "frncis" catering company itself (it existed before the seed —
// this only clears the dummy scans/link touching it, matching the "already
// existed" upsert semantics of the seed script).
//
//   cd server && npx tsx scripts/unseed-catering-dummy.ts

import { prisma } from "../src/lib/prisma.js";

const LINKED_USERNAMES = [
  "ahmed.mansouri", "rajesh.pillai", "khalid.suwaidi",
  "fatima.hosani", "bilal.ahmed", "imran.sheikh",
];
const CREATED_COMPANY_NAMES = ["Sabari Catering LLC", "Gulf Fresh Meals"];

async function main() {
  console.log("→ deleting dummy scans…");
  const { count: scansDeleted } = await prisma.scan.deleteMany({
    where: { labourId: { startsWith: "DUMMY-" } },
  });
  console.log(`   ${scansDeleted} scans deleted`);

  console.log("\n→ unlinking distributors…");
  const { count: unlinked } = await prisma.campManager.updateMany({
    where: { username: { in: LINKED_USERNAMES } },
    data: { cateringCompanyId: null },
  });
  console.log(`   ${unlinked} distributors unlinked`);

  console.log("\n→ removing catering companies created by the seed…");
  const { count: companiesDeleted } = await prisma.cateringCompany.deleteMany({
    where: { name: { in: CREATED_COMPANY_NAMES } },
  });
  console.log(`   ${companiesDeleted} catering companies deleted`);
  console.log('   ("frncis" left as-is — it existed before the seed script ran)');

  console.log("\n✓ cleanup done.");
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
