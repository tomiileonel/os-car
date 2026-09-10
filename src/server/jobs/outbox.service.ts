/**
 * OS-CAR · Gate G5 — Outbox Pattern (OT-G5-JOBS-TELEMETRY-001)
 * --------------------------------------------------------------------------
 * enqueueOutboxMessage SIEMPRE se invoca dentro de la misma transacción que
 * la mutación de dominio: o se persisten dominio + auditoría + outbox, o no
 * se persiste nada.
 *
 * Deduplicación estricta por idempotentKey:
 *  - Índice único en DB (OutboxMessage_idempotentKey_key).
 *  - Chequeo previo + captura de P2002 para la carrera entre transacciones.
 *
 * NOTA: el payload NO se enmascara (es dato de negocio que consume el
 * worker). Por diseño no deben viajar secretos en el payload.
 */
import type { Prisma } from "@prisma/client";
import { logger } from "@/shared/telemetry/logger";

export const OUTBOX_EVENT_TYPES = [
  "WORK_ORDER_STATUS_CHANGED",
  "WORK_ORDER_DELIVERED",
  "BUDGET_PUBLISHED",
  "BUDGET_DECISION_RECEIVED",
  "TRACKING_CODE_REGENERATED",
  "BAY_CAPACITY_CHANGED",
  "PART_LOGISTIC_STATUS_CHANGED",
  "WHATSAPP_READY_FOR_PICKUP",
  "WHATSAPP_DELIVERY_RECEIPT",
] as const;

export type CanonicalOutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];
export type OutboxEventType = CanonicalOutboxEventType | (string & {});

export interface OutboxMessageParams {
  workshopId: string;
  eventType: OutboxEventType;
  payload: Record<string, unknown>;
  /** Clave de deduplicación estricta (única en DB). */
  idempotentKey: string;
  /** Default 5 intentos antes de DEAD_LETTER. */
  maxAttempts?: number;
  correlationId?: string | null;
  /** Programación diferida (jobs con retardo). */
  processAfter?: Date;
}

export interface OutboxMessageRecord {
  id: string;
  workshopId: string;
  eventType: string;
  payload: unknown;
  idempotentKey: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lockedBy: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  correlationId: string | null;
}

export interface EnqueueOutboxResult {
  message: OutboxMessageRecord;
  /** true => ya existía un mensaje con la misma idempotentKey. */
  deduplicated: boolean;
}

const UNIQUE_CONSTRAINT_CODE = "P2002";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_CODE
  );
}

export async function enqueueOutboxMessage(
  tx: Prisma.TransactionClient,
  params: OutboxMessageParams,
): Promise<EnqueueOutboxResult> {
  const workshopId = params.workshopId?.trim();
  if (!workshopId) {
    throw new Error("OUTBOX_TENANT_REQUIRED: el mensaje de outbox requiere workshopId.");
  }
  if (!params.eventType?.trim()) {
    throw new Error("OUTBOX_EVENT_TYPE_REQUIRED: el mensaje de outbox requiere eventType.");
  }
  const idempotentKey = params.idempotentKey?.trim();
  if (!idempotentKey) {
    throw new Error("OUTBOX_IDEMPOTENT_KEY_REQUIRED: el mensaje de outbox requiere idempotentKey.");
  }
  if (!params.payload || typeof params.payload !== "object" || Array.isArray(params.payload)) {
    throw new Error("OUTBOX_PAYLOAD_REQUIRED: el payload debe ser un objeto JSON.");
  }

  const existing = await tx.outboxMessage.findUnique({ where: { idempotentKey } });
  if (existing) {
    logger.debug("outbox: mensaje deduplicado por idempotentKey", {
      correlationId: params.correlationId ?? undefined,
      workshopId,
      metadata: { idempotentKey, eventType: params.eventType },
    });
    return { message: existing as unknown as OutboxMessageRecord, deduplicated: true };
  }

  try {
    const created = await tx.outboxMessage.create({
      data: {
        workshopId,
        eventType: params.eventType,
        payload: params.payload as unknown as Prisma.InputJsonValue,
        idempotentKey,
        status: "PENDING",
        attempts: 0,
        maxAttempts: params.maxAttempts ?? 5,
        nextAttemptAt: params.processAfter ?? new Date(),
        correlationId: params.correlationId ?? null,
      },
    });
    return { message: created as unknown as OutboxMessageRecord, deduplicated: false };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Carrera: otra transacción insertó la misma key entre findUnique y create.
      const concurrentlyCreated = await tx.outboxMessage.findUnique({
        where: { idempotentKey },
      });
      if (concurrentlyCreated) {
        return {
          message: concurrentlyCreated as unknown as OutboxMessageRecord,
          deduplicated: true,
        };
      }
    }
    throw error;
  }
}
