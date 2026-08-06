/*
  Warnings:

  - You are about to drop the `AppLimit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InstallSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AppLimit" DROP CONSTRAINT "AppLimit_appId_fkey";

-- DropForeignKey
ALTER TABLE "InstallSession" DROP CONSTRAINT "InstallSession_appId_fkey";

-- DropTable
DROP TABLE "AppLimit";

-- DropTable
DROP TABLE "InstallSession";

-- DropEnum
DROP TYPE "InstallSessionStatus";

-- DropEnum
DROP TYPE "LimitType";

-- DropEnum
DROP TYPE "PeriodType";
