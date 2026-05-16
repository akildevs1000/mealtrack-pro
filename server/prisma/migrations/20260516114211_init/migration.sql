-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'user', 'manager');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('Active', 'Inactive');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('Active', 'Leave', 'Vacation', 'Inactive');

-- CreateEnum
CREATE TYPE "CmsEmployeeStatus" AS ENUM ('Active', 'InActive', 'leave');

-- CreateEnum
CREATE TYPE "MealEligibility" AS ENUM ('Y', 'N');

-- CreateEnum
CREATE TYPE "MealKind" AS ENUM ('Breakfast', 'Lunch', 'Dinner');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('Eligible', 'AlreadyServed', 'NotEligible', 'WrongCamp', 'Expired');

-- CreateEnum
CREATE TYPE "ManagerRole" AS ENUM ('CampManager', 'SeniorManager', 'Supervisor');

-- CreateEnum
CREATE TYPE "ManagerShift" AS ENUM ('Morning', 'Evening', 'FullDay');

-- CreateEnum
CREATE TYPE "ManagerStatus" AS ENUM ('Active', 'Suspended', 'Expired');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'Active',
    "assignedCampCode" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tab" TEXT NOT NULL,
    "view" BOOLEAN NOT NULL DEFAULT false,
    "edit" BOOLEAN NOT NULL DEFAULT false,
    "delete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camp" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "breakfastStart" TEXT NOT NULL DEFAULT '05:30',
    "breakfastEnd" TEXT NOT NULL DEFAULT '08:30',
    "lunchStart" TEXT NOT NULL DEFAULT '11:30',
    "lunchEnd" TEXT NOT NULL DEFAULT '14:00',
    "dinnerStart" TEXT NOT NULL DEFAULT '18:30',
    "dinnerEnd" TEXT NOT NULL DEFAULT '21:30',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsEmployee" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "laborId" INTEGER NOT NULL,
    "laborCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "doj" TIMESTAMP(3) NOT NULL,
    "campCode" TEXT NOT NULL,
    "campName" TEXT NOT NULL,
    "mealsEligibility" "MealEligibility" NOT NULL DEFAULT 'Y',
    "status" "CmsEmployeeStatus" NOT NULL DEFAULT 'Active',
    "effectiveDate" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "breakfastTaken" BOOLEAN NOT NULL DEFAULT false,
    "breakfastTime" TEXT,
    "lunchTaken" BOOLEAN NOT NULL DEFAULT false,
    "lunchTime" TEXT,
    "dinnerTaken" BOOLEAN NOT NULL DEFAULT false,
    "dinnerTime" TEXT,

    CONSTRAINT "MealRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "labourId" TEXT NOT NULL,
    "campCode" TEXT NOT NULL,
    "meal" "MealKind" NOT NULL,
    "status" "ScanStatus" NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campCode" TEXT NOT NULL,
    "battery" INTEGER NOT NULL DEFAULT 100,
    "online" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "macAddress" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "androidVersion" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "registeredOn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampManager" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "emiratesId" TEXT NOT NULL,
    "campCode" TEXT NOT NULL,
    "role" "ManagerRole" NOT NULL,
    "shift" "ManagerShift" NOT NULL,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "ManagerStatus" NOT NULL DEFAULT 'Active',
    "lastLoginAt" TIMESTAMP(3),
    "avatar" TEXT,
    "permBreakfast" BOOLEAN NOT NULL DEFAULT true,
    "permLunch" BOOLEAN NOT NULL DEFAULT true,
    "permDinner" BOOLEAN NOT NULL DEFAULT true,
    "permReports" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_tab_key" ON "RolePermission"("role", "tab");

-- CreateIndex
CREATE UNIQUE INDEX "Camp_code_key" ON "Camp"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CmsEmployee_laborId_key" ON "CmsEmployee"("laborId");

-- CreateIndex
CREATE UNIQUE INDEX "CmsEmployee_laborCode_key" ON "CmsEmployee"("laborCode");

-- CreateIndex
CREATE INDEX "CmsEmployee_campCode_idx" ON "CmsEmployee"("campCode");

-- CreateIndex
CREATE INDEX "CmsEmployee_status_idx" ON "CmsEmployee"("status");

-- CreateIndex
CREATE INDEX "MealRecord_date_idx" ON "MealRecord"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MealRecord_employeeId_date_key" ON "MealRecord"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Scan_time_idx" ON "Scan"("time");

-- CreateIndex
CREATE INDEX "Scan_campCode_idx" ON "Scan"("campCode");

-- CreateIndex
CREATE INDEX "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_name_key" ON "Device"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serial_key" ON "Device"("serial");

-- CreateIndex
CREATE INDEX "Device_campCode_idx" ON "Device"("campCode");

-- CreateIndex
CREATE UNIQUE INDEX "CampManager_username_key" ON "CampManager"("username");

-- CreateIndex
CREATE UNIQUE INDEX "CampManager_email_key" ON "CampManager"("email");

-- CreateIndex
CREATE INDEX "CampManager_campCode_idx" ON "CampManager"("campCode");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "MealRecord" ADD CONSTRAINT "MealRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "CmsEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_campCode_fkey" FOREIGN KEY ("campCode") REFERENCES "Camp"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_campCode_fkey" FOREIGN KEY ("campCode") REFERENCES "Camp"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampManager" ADD CONSTRAINT "CampManager_campCode_fkey" FOREIGN KEY ("campCode") REFERENCES "Camp"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
