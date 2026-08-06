-- CreateEnum
CREATE TYPE "ConnectorSource" AS ENUM ('BUILTIN', 'REGISTRY', 'URL', 'CUSTOM');

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "source" "ConnectorSource" NOT NULL,
    "sourceUrl" TEXT,
    "document" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updateAvailable" JSONB,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Connector_connectorId_key" ON "Connector"("connectorId");

-- CreateIndex
CREATE INDEX "Connector_resourceType_enabled_idx" ON "Connector"("resourceType", "enabled");
