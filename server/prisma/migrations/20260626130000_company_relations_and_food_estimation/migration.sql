-- AlterTable
ALTER TABLE "Camp" ADD COLUMN "companyCode" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "companyCode" TEXT;

-- AlterTable
ALTER TABLE "CampManager" ADD COLUMN "companyCode" TEXT;

-- CreateTable
CREATE TABLE "FoodEstimation" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyCode" TEXT NOT NULL,
    "supplierId" TEXT,
    "projectCode" TEXT,
    "campCode" TEXT,
    "breakfast" INTEGER NOT NULL DEFAULT 0,
    "lunch" INTEGER NOT NULL DEFAULT 0,
    "dinner" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodEstimation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodEstimation_companyCode_date_idx" ON "FoodEstimation"("companyCode", "date");

-- AddForeignKey
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_companyCode_fkey" FOREIGN KEY ("companyCode") REFERENCES "Company"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyCode_fkey" FOREIGN KEY ("companyCode") REFERENCES "Company"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampManager" ADD CONSTRAINT "CampManager_companyCode_fkey" FOREIGN KEY ("companyCode") REFERENCES "Company"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodEstimation" ADD CONSTRAINT "FoodEstimation_companyCode_fkey" FOREIGN KEY ("companyCode") REFERENCES "Company"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
