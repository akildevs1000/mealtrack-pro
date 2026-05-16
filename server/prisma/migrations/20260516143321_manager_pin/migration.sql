-- AlterTable
ALTER TABLE "CampManager" ADD COLUMN     "pinHash" TEXT;

-- AlterTable
ALTER TABLE "Scan" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "Scan_managerId_idx" ON "Scan"("managerId");

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "CampManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
