-- Add nullable GRADE column to CmsEmployee (sourced from CMS_EMPLOYEE_MASTER.GRADE)
ALTER TABLE "CmsEmployee" ADD COLUMN "grade" TEXT;
