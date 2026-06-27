-- A device is tied to either a camp OR a project. Make campCode nullable and
-- add a nullable projectCode; the register dialog merges them into one picker.

-- DropForeignKey
ALTER TABLE "Device" DROP CONSTRAINT "Device_campCode_fkey";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "projectCode" TEXT,
ALTER COLUMN "campCode" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_campCode_fkey" FOREIGN KEY ("campCode") REFERENCES "Camp"("code") ON DELETE SET NULL ON UPDATE CASCADE;
