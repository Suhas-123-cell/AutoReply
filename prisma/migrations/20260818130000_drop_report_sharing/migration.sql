-- DropIndex
DROP INDEX "Automation_reportShareSlug_key";

-- AlterTable
ALTER TABLE "Automation" DROP COLUMN "reportShareSlug",
DROP COLUMN "reportShareEnabled";
