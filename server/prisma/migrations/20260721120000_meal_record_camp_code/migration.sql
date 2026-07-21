-- Track which site (Camp.code or Project.code) each meal was actually scanned
-- at, so a duplicate-scan denial can tell staff where the meal was really
-- taken instead of just the employee's home camp.
ALTER TABLE "MealRecord" ADD COLUMN "breakfastCampCode" TEXT;
ALTER TABLE "MealRecord" ADD COLUMN "lunchCampCode" TEXT;
ALTER TABLE "MealRecord" ADD COLUMN "dinnerCampCode" TEXT;
