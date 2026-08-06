-- AlterTable
ALTER TABLE "GrantToken" ADD COLUMN     "encryptedToken" TEXT,
ADD COLUMN     "tokenIv" TEXT;
