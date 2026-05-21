/**
 * One-off live setup for mobile-app testing.
 *
 * Run on the live server:
 *   cd /path/to/mealtrack-pro/server
 *   npx tsx prisma/live-setup.ts
 *
 * Idempotent — safe to re-run. Does NOT reset passwords or wipe anything.
 *
 * What it does:
 *   1. Registers the test Zebra device (MAC 94:FB:29:62:3E:D9) and binds it to
 *      a camp (defaults to the first camp by code).
 *   2. Sets a 4-digit mobile PIN on one camp manager assigned to that camp, so
 *      the manager picker on the Zebra has at least one entry.
 *
 * Customise the constants below if you want a different camp / PIN / manager.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---- Tweakable constants ----
const DEVICE_MAC = "94:FB:29:62:3E:D9";
const DEVICE_SERIAL = "ZBR-LIVE-94FB29623ED9"; // unique key — keep as-is unless re-using
const DEVICE_NAME = "Zebra-Live-Test-01";
const TARGET_PIN = "1234"; // 4 digits — what operator types on the lock screen
// ---- End tweakable ----

async function main() {
  // 1. Pick a camp. If you want to pin it to a specific one, set CAMP_CODE.
  const campCode = process.env.CAMP_CODE
    || (await prisma.camp.findFirst({ orderBy: { code: "asc" } }))?.code;
  if (!campCode) {
    throw new Error("No camps in the DB. Seed camps first, then re-run.");
  }
  console.log(`Using camp: ${campCode}`);

  // 2. Register the device.
  const device = await prisma.device.upsert({
    where: { serial: DEVICE_SERIAL },
    create: {
      name: DEVICE_NAME,
      campCode,
      battery: 100,
      online: true,
      macAddress: DEVICE_MAC,
      serial: DEVICE_SERIAL,
      model: "Zebra TC22",
      androidVersion: "Android 13",
      appVersion: "MyMeal 4.2.1",
      ipAddress: "",
      assignedTo: "",
      registeredOn: new Date(),
      lastSync: new Date(),
    },
    update: { macAddress: DEVICE_MAC, campCode, lastSync: new Date() },
  });
  console.log(`Device: ${device.name} (${device.macAddress}) → camp ${device.campCode}`);

  // 3. Find an Active manager assigned to that camp. If none exists, fall back
  //    to ANY active manager (just so the picker isn't empty).
  let manager =
    (await prisma.campManager.findFirst({
      where: { campCode, status: "Active" },
      orderBy: { name: "asc" },
    })) ||
    (await prisma.campManager.findFirst({
      where: { status: "Active" },
      orderBy: { name: "asc" },
    }));

  if (!manager) {
    throw new Error(
      "No Active camp managers in the DB. Create one via the admin panel first.",
    );
  }

  // 4. Set the PIN.
  const pinHash = await bcrypt.hash(TARGET_PIN, 10);
  await prisma.campManager.update({
    where: { id: manager.id },
    data: { pinHash },
  });
  console.log(
    `Manager: ${manager.name} (@${manager.username}, camp ${manager.campCode}) → PIN ${TARGET_PIN}`,
  );

  console.log("\nDone. On the Zebra: pick this manager, type PIN", TARGET_PIN);
}

main()
  .catch((e) => {
    console.error("[live-setup] FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
