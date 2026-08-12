-- AlterTable
ALTER TABLE "PermissionUsage" ADD COLUMN     "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ResourcePermission" ADD COLUMN     "dailyCostBudgetUsd" DOUBLE PRECISION,
ADD COLUMN     "monthlyCostBudgetUsd" DOUBLE PRECISION;
