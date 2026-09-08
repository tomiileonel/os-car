-- OS-CAR · Gate G5 — Outbox transaccional + metadata de auditoría.
-- Las tablas usan el mapeo snake_case definido en prisma/schema.prisma.

DO $$
BEGIN
  CREATE TYPE "OutboxMessageStatus" AS ENUM (
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "outbox_messages" (
  "id" TEXT NOT NULL,
  "workshopId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotentKey" TEXT NOT NULL,
  "status" "OutboxMessageStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastError" TEXT,
  "lockedBy" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "correlationId" TEXT,
  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_messages_idempotentKey_key"
  ON "outbox_messages" ("idempotentKey");

CREATE INDEX IF NOT EXISTS "outbox_messages_status_nextAttemptAt_idx"
  ON "outbox_messages" ("status", "nextAttemptAt");

CREATE INDEX IF NOT EXISTS "outbox_messages_workshopId_eventType_idx"
  ON "outbox_messages" ("workshopId", "eventType");

DO $$
BEGIN
  ALTER TABLE "outbox_messages"
    ADD CONSTRAINT "outbox_messages_workshopId_fkey"
    FOREIGN KEY ("workshopId") REFERENCES "workshops"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
