/**
 * Create (or reset) a single admin user — no demo data.
 *
 * Use this for a schema-only setup on a fresh database: run the Prisma
 * migrations first, then this, instead of `npm run seed` (which injects all
 * the demo camps/managers/scans).
 *
 * Idempotent: if the admin already exists it just resets the password.
 * Role permissions are created automatically by `ensureDefaultPermissions`
 * on server boot, so this only needs to mint the login.
 *
 * Run from `server/`:
 *   npx tsx scripts/create-admin.ts
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='Str0ng!Pass' npx tsx scripts/create-admin.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth.js";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Administrator";
  const email = process.env.ADMIN_EMAIL || `${username}@local`;

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      name,
      email,
      passwordHash,
      role: "admin",
      status: "Active",
      assignedCampCode: null,
      assignedCampCodes: [],
    },
    update: {
      passwordHash,
      role: "admin",
      status: "Active",
    },
    select: { id: true, username: true, name: true, email: true, role: true },
  });

  console.log(`[create-admin] ready: ${user.username} (${user.role})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[create-admin] WARNING: used default password "ChangeMe123!" — change it after first login.`);
  }
}

main()
  .catch((e) => {
    console.error("[create-admin] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
