-- Extra catering-company fields (customer type, company name, primary contact, address, tax).
ALTER TABLE "CateringCompany" ADD COLUMN "customerType" TEXT NOT NULL DEFAULT 'Business';
ALTER TABLE "CateringCompany" ADD COLUMN "companyName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "salutation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "addressLine" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "country" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "trn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "taxTreatment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CateringCompany" ADD COLUMN "placeOfSupply" TEXT NOT NULL DEFAULT '';
