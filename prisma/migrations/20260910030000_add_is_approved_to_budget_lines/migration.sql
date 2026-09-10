-- AlterTable
ALTER TABLE "budget_labor_lines" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "budget_part_lines" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT true;
