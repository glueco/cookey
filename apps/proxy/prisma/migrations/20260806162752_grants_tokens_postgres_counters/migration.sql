-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED_INACTIVITY', 'SUSPENDED_ANOMALY', 'SUSPENDED_MANUAL', 'EXPIRED', 'REVOKED', 'DENIED');

-- CreateEnum
CREATE TYPE "GrantAuth" AS ENUM ('BEARER', 'POP');

-- AlterTable
ALTER TABLE "RequestLog" ADD COLUMN     "connectorId" TEXT,
ADD COLUMN     "costEstimate" DOUBLE PRECISION,
ADD COLUMN     "grantId" TEXT;

-- AlterTable
ALTER TABLE "ResourcePermission" ADD COLUMN     "grantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "decisions" JSONB,
    "status" "GrantStatus" NOT NULL DEFAULT 'PENDING',
    "authType" "GrantAuth" NOT NULL,
    "runtime" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "renewalPeriodDays" INTEGER,
    "currentPeriodEnd" TIMESTAMP(3),
    "inactivitySuspendDays" INTEGER,
    "allowBrowser" BOOLEAN NOT NULL DEFAULT false,
    "egressIps" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantToken" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "displayPrefix" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "firstUsedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopNonce" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "RateCounter" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "GrantTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Grant_appId_key" ON "Grant"("appId");

-- CreateIndex
CREATE INDEX "Grant_status_expiresAt_idx" ON "Grant"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Grant_status_currentPeriodEnd_idx" ON "Grant"("status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "GrantToken_tokenHash_key" ON "GrantToken"("tokenHash");

-- CreateIndex
CREATE INDEX "GrantToken_grantId_idx" ON "GrantToken"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCode_codeHash_key" ON "ClaimCode"("codeHash");

-- CreateIndex
CREATE INDEX "ClaimCode_expiresAt_idx" ON "ClaimCode"("expiresAt");

-- CreateIndex
CREATE INDEX "PopNonce_expiresAt_idx" ON "PopNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrantTemplate_name_key" ON "GrantTemplate"("name");

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "RequestLog_grantId_timestamp_idx" ON "RequestLog"("grantId", "timestamp");

-- CreateIndex
CREATE INDEX "ResourcePermission_grantId_idx" ON "ResourcePermission"("grantId");

-- AddForeignKey
ALTER TABLE "ResourcePermission" ADD CONSTRAINT "ResourcePermission_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantToken" ADD CONSTRAINT "GrantToken_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
