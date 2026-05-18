-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "ScheduleReportType" AS ENUM ('consumption', 'employee', 'scans', 'camp', 'wastage');

-- CreateEnum
CREATE TYPE "ScheduleFormat" AS ENUM ('pdf', 'excel', 'both');

-- CreateEnum
CREATE TYPE "ScheduleDestination" AS ENUM ('email', 'ftp');

-- CreateEnum
CREATE TYPE "ScheduleRunStatus" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "FtpConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 21,
    "user" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL DEFAULT '/',
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FtpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reportType" "ScheduleReportType" NOT NULL,
    "format" "ScheduleFormat" NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL,
    "time" TEXT NOT NULL,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "destination" "ScheduleDestination" NOT NULL DEFAULT 'email',
    "recipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "ScheduleRunStatus",
    "lastRunDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Schedule_enabled_nextRunAt_idx" ON "Schedule"("enabled", "nextRunAt");
