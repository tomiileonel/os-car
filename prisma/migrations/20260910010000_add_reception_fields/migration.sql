-- AlterTable
ALTER TABLE "customers" ADD COLUMN "document" TEXT;

-- AlterTable
ALTER TABLE "intake_records" ADD COLUMN "signatureHash" TEXT;
ALTER TABLE "intake_records" ADD COLUMN "declaredBelongings" BOOLEAN NOT NULL DEFAULT false;
