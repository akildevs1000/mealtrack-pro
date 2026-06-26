-- Add the Integrated Reports Suite report types to the schedule enum.
ALTER TYPE "ScheduleReportType" ADD VALUE IF NOT EXISTS 'dailyTransaction';
ALTER TYPE "ScheduleReportType" ADD VALUE IF NOT EXISTS 'bySupplier';
ALTER TYPE "ScheduleReportType" ADD VALUE IF NOT EXISTS 'byLocation';
ALTER TYPE "ScheduleReportType" ADD VALUE IF NOT EXISTS 'requestComparison';
ALTER TYPE "ScheduleReportType" ADD VALUE IF NOT EXISTS 'duplicateEligibility';
