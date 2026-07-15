// LOCAL DEV ONLY — seeds dummy data for testing the Catering Company →
// Distributor → Meal Report drill-down. Idempotent: safe to re-run (upserts
// catering companies by name, only creates NEW scans, doesn't touch anything
// else). Never run this against staging/prod.
//
//   cd server && npx tsx scripts/seed-catering-dummy.ts

import { prisma } from "../src/lib/prisma.js";

const CATERING_COMPANIES = [
  {
    name: "frncis", // already exists locally — just enrich it if blank
    customerType: "Business" as const,
    companyName: "Francis Gill Catering",
    salutation: "Mr.", firstName: "Francis", lastName: "Gill",
    email: "francisgill1000@gmail.com", phone: "12345678900",
    addressLine: "Al Quoz Industrial 3", city: "Dubai", country: "United Arab Emirates",
    trn: "", taxTreatment: "", placeOfSupply: "Dubai",
    notes: "Dummy seed for local testing", status: "Active" as const,
  },
  {
    name: "Sabari Catering LLC",
    customerType: "Business" as const,
    companyName: "Sabari Foods Trading LLC",
    salutation: "Mr.", firstName: "Sabari", lastName: "Krishnan",
    email: "sabari@example.com", phone: "+971501234567",
    addressLine: "Al Quoz Industrial 4", city: "Dubai", country: "United Arab Emirates",
    trn: "100123456700003", taxTreatment: "VAT Registered", placeOfSupply: "Dubai",
    notes: "Dummy seed for local testing", status: "Active" as const,
  },
  {
    name: "Gulf Fresh Meals",
    customerType: "Business" as const,
    companyName: "Gulf Fresh Meals Catering Est.",
    salutation: "Mrs.", firstName: "Layla", lastName: "Haddad",
    email: "layla@gulffresh.example", phone: "+971559876543",
    addressLine: "Mussafah M-9", city: "Abu Dhabi", country: "United Arab Emirates",
    trn: "100987654300003", taxTreatment: "VAT Registered", placeOfSupply: "Abu Dhabi",
    notes: "Dummy seed for local testing", status: "Active" as const,
  },
];

// distributor username -> which catering company (by name) it belongs to.
const LINKS: Record<string, string> = {
  "ahmed.mansouri": "frncis",
  "rajesh.pillai": "frncis",
  "khalid.suwaidi": "Sabari Catering LLC",
  "fatima.hosani": "Sabari Catering LLC",
  "bilal.ahmed": "Gulf Fresh Meals",
  "imran.sheikh": "Gulf Fresh Meals",
};

// UTC hours chosen so Dubai (UTC+4) calendar day always matches the UTC date.
const MEAL_UTC_HOUR: Record<"Breakfast" | "Lunch" | "Dinner", number> = {
  Breakfast: 5, Lunch: 8, Dinner: 14,
};

async function main() {
  console.log("→ upserting catering companies…");
  const companyIdByName = new Map<string, string>();
  for (const c of CATERING_COMPANIES) {
    const { name, ...rest } = c;
    const row = await prisma.cateringCompany.upsert({
      where: { name },
      create: { name, ...rest },
      update: {}, // don't clobber if the user already edited it by hand
    });
    companyIdByName.set(name, row.id);
    console.log(`   ${name} -> ${row.id}`);
  }

  console.log("\n→ linking distributors to catering companies…");
  for (const [username, companyName] of Object.entries(LINKS)) {
    const cateringCompanyId = companyIdByName.get(companyName);
    if (!cateringCompanyId) continue;
    const mgr = await prisma.campManager.findUnique({ where: { username }, select: { id: true, name: true, campCode: true } });
    if (!mgr) {
      console.log(`   ! no manager with username ${username}, skipping`);
      continue;
    }
    await prisma.campManager.update({ where: { id: mgr.id }, data: { cateringCompanyId } });
    console.log(`   ${mgr.name} (@${username}) -> ${companyName}`);
  }

  console.log("\n→ generating dummy scans (last 10 days)…");
  const managers = await prisma.campManager.findMany({
    where: { username: { in: Object.keys(LINKS) } },
    select: { id: true, name: true, campCode: true },
  });

  let created = 0;
  const today = new Date();
  const todayUtcMidnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  for (const mgr of managers) {
    for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
      const dayUtcMs = todayUtcMidnight - dayOffset * 86_400_000;
      // Vary how many meals per day (breakfast+lunch+dinner not every day, for realism).
      const meals: ("Breakfast" | "Lunch" | "Dinner")[] =
        dayOffset % 3 === 0 ? ["Breakfast", "Lunch", "Dinner"] : dayOffset % 3 === 1 ? ["Breakfast", "Lunch"] : ["Lunch", "Dinner"];

      for (let i = 0; i < meals.length; i++) {
        const meal = meals[i];
        const time = new Date(dayUtcMs + MEAL_UTC_HOUR[meal] * 3_600_000);
        // A handful of distinct employees "served" per meal so counts look real.
        const servedCount = 3 + ((dayOffset + i) % 4); // 3-6 per meal
        for (let n = 0; n < servedCount; n++) {
          await prisma.scan.create({
            data: {
              time,
              name: `Dummy Worker ${dayOffset}-${meal[0]}-${n}`,
              labourId: `DUMMY-${mgr.id.slice(-4)}-${dayOffset}-${meal[0]}-${n}`,
              campCode: mgr.campCode,
              meal: meal as any,
              status: "Eligible",
              managerId: mgr.id,
            },
          });
          created++;
        }
      }
    }
  }

  console.log(`\n✓ done — ${created} dummy scans created across ${managers.length} distributors.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
