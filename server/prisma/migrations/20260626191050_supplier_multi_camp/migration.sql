-- Suppliers (CampManager) can now be assigned to multiple camps.

-- Multi-camp scope mirror for the linked login User.
ALTER TABLE "User" ADD COLUMN     "assignedCampCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Many-to-many join between CampManager and Camp (implicit relation "ManagerCamps").
CREATE TABLE "_ManagerCamps" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_ManagerCamps_AB_unique" ON "_ManagerCamps"("A", "B");

CREATE INDEX "_ManagerCamps_B_index" ON "_ManagerCamps"("B");

ALTER TABLE "_ManagerCamps" ADD CONSTRAINT "_ManagerCamps_A_fkey" FOREIGN KEY ("A") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_ManagerCamps" ADD CONSTRAINT "_ManagerCamps_B_fkey" FOREIGN KEY ("B") REFERENCES "CampManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed each existing supplier's camp set with their current primary camp.
INSERT INTO "_ManagerCamps" ("A", "B")
SELECT c."id", m."id"
FROM "CampManager" m
JOIN "Camp" c ON c."code" = m."campCode"
ON CONFLICT DO NOTHING;

-- Backfill: mirror each manager user's single assigned camp into the new array.
UPDATE "User"
SET "assignedCampCodes" = ARRAY["assignedCampCode"]
WHERE "assignedCampCode" IS NOT NULL;
