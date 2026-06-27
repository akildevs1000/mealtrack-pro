-- A project is now a physical scanning site like a camp: give it its own meal
-- windows, and let Scan.campCode hold a camp OR project code (drop the FK).

-- DropForeignKey: Scan.campCode becomes a plain site-code string (camp or project).
ALTER TABLE "Scan" DROP CONSTRAINT "Scan_campCode_fkey";

-- AlterTable: Project meal windows (same defaults as Camp).
ALTER TABLE "Project" ADD COLUMN     "breakfastEnd" TEXT NOT NULL DEFAULT '08:30',
ADD COLUMN     "breakfastStart" TEXT NOT NULL DEFAULT '05:30',
ADD COLUMN     "dinnerEnd" TEXT NOT NULL DEFAULT '21:30',
ADD COLUMN     "dinnerStart" TEXT NOT NULL DEFAULT '18:30',
ADD COLUMN     "lunchEnd" TEXT NOT NULL DEFAULT '14:00',
ADD COLUMN     "lunchStart" TEXT NOT NULL DEFAULT '11:30';
