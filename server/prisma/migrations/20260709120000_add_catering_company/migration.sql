-- Catering company records + link from distributor (CampManager).
CREATE TABLE "CateringCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CateringCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CateringCompany_name_key" ON "CateringCompany"("name");

ALTER TABLE "CampManager" ADD COLUMN "cateringCompanyId" TEXT;

CREATE INDEX "CampManager_cateringCompanyId_idx" ON "CampManager"("cateringCompanyId");

ALTER TABLE "CampManager" ADD CONSTRAINT "CampManager_cateringCompanyId_fkey"
    FOREIGN KEY ("cateringCompanyId") REFERENCES "CateringCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
