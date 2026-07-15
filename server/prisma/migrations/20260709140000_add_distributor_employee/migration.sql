-- Distributor-employee roster (people per catering company) + optional link
-- from CampManager (login account) to the roster entry it represents.
CREATE TABLE "DistributorEmployee" (
    "id" TEXT NOT NULL,
    "cateringCompanyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DistributorEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DistributorEmployee_cateringCompanyId_name_key" ON "DistributorEmployee"("cateringCompanyId", "name");
CREATE INDEX "DistributorEmployee_cateringCompanyId_idx" ON "DistributorEmployee"("cateringCompanyId");

ALTER TABLE "DistributorEmployee" ADD CONSTRAINT "DistributorEmployee_cateringCompanyId_fkey"
    FOREIGN KEY ("cateringCompanyId") REFERENCES "CateringCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampManager" ADD COLUMN "distributorEmployeeId" TEXT;

CREATE INDEX "CampManager_distributorEmployeeId_idx" ON "CampManager"("distributorEmployeeId");

ALTER TABLE "CampManager" ADD CONSTRAINT "CampManager_distributorEmployeeId_fkey"
    FOREIGN KEY ("distributorEmployeeId") REFERENCES "DistributorEmployee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
