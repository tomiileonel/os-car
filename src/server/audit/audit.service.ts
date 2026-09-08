/**
 * OS-CAR · Gate G5 — Auditoría transaccional inmutable (OT-G5-JOBS-TELEMETRY-001)
 * --------------------------------------------------------------------------
 * Reglas (Especificación Maestra §19/§29):
 *  - Todo evento de auditoría se escribe DENTRO de la misma transacción que
 *    la mutación de dominio. Nunca en una transacción independiente.
 *  - Todo evento queda anclado al tenant (workshopId) de la sesión.
 *  - before/after/metadata se enmascaran ANTES de persistir (secretos/PII).
 *  - Fail-safe: si el caller no tiene transacción abierta, se envuelve
 *    automáticamente en prisma.$transaction (sobrecarga de un argumento).
 */
import type { Prisma, ActorType } from "@prisma/client";
import { prisma } from "@/server/db";
import { logger, maskSensitiveData } from "@/shared/telemetry/logger";

/** Acciones canónicas de auditoría (string tipado, extensible). */
export const AUDIT_ACTIONS = [
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "VEHICLE_CREATED",
  "VEHICLE_UPDATED",
  "ORDER_CREATED",
  "ORDER_TRANSITIONED",
  "ORDER_CANCELLED",
  "ORDER_DELIVERED",
  "ODOMETER_CORRECTED",
  "BAY_ASSIGNED",
  "BAY_REASSIGNED",
  "BAY_RELEASED",
  "WORK_ITEM_CREATED",
  "WORK_ITEM_UPDATED",
  "PART_ITEM_CREATED",
  "PART_ITEM_STATUS_CHANGED",
  "BUDGET_PUBLISHED",
  "BUDGET_APPROVED",
  "BUDGET_REJECTED",
  "TRACKING_CODE_REGENERATED",
  "OUTBOX_MESSAGE_ENQUEUED",
] as const;

export type CanonicalAuditAction = (typeof AUDIT_ACTIONS)[number];
/** String tipado con autocomplete, sin cerrar el dominio. */
export type AuditAction = CanonicalAuditAction | (string & {});

export const AUDIT_ENTITY_TYPES = [
  "WORKSHOP",
  "CUSTOMER",
  "VEHICLE",
  "WORK_ORDER",
  "BAY",
  "BAY_ASSIGNMENT",
  "WORK_ITEM",
  "PART_ITEM",
  "BUDGET",
  "BUDGET_VERSION",
  "TRACKING_CODE",
  "OUTBOX_MESSAGE",
] as const;

export type CanonicalAuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditEntityType = CanonicalAuditEntityType | (string & {});

export interface AuditEventParams {
  /** Tenant. OBLIGATORIO: nunca se deriva de la entidad auditada. */
  workshopId: string;
  /** AdminUser.id; null/undefined => actor SYSTEM. */
  actorId?: string | null;
  /** Default: ADMIN si hay actorId, SYSTEM si no. */
  actorType?: ActorType;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  workOrderId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  /** Se persiste en AuditLog.requestId (correlación punta a punta). */
  correlationId?: string | null;
  ipHash?: string | null;
}

export interface AuditLogRecord {
  id: string;
  workshopId: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

function toJsonInput(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return maskSensitiveData(value) as unknown as Prisma.InputJsonValue;
}

async function insertAuditEvent(
  tx: Prisma.TransactionClient,
  params: AuditEventParams,
): Promise<AuditLogRecord> {
  const workshopId = params.workshopId?.trim();
  if (!workshopId) {
    throw new Error("AUDIT_TENANT_REQUIRED: todo evento de auditoría debe anclarse a un workshopId.");
  }
  const entityId = params.entityId?.trim();
  if (!entityId) {
    throw new Error("AUDIT_ENTITY_ID_REQUIRED: el evento de auditoría requiere entityId.");
  }
  const actorType: ActorType = params.actorType ?? (params.actorId ? "ADMIN" : "SYSTEM");

  const created = await tx.auditLog.create({
    data: {
      workshopId,
      actorType,
      actorAdminId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId,
      workOrderId: params.workOrderId ?? null,
      before: toJsonInput(params.beforeState),
      after: toJsonInput(params.afterState),
      metadata: toJsonInput(params.metadata),
      reason: params.reason ?? null,
      requestId: params.correlationId ?? null,
      ipHash: params.ipHash ?? null,
    },
  });

  return created;
}

/**
 * Registra un evento de auditoría.
 *
 * Sobrecargas:
 *  1. recordAuditEvent(tx, params)  -> inserta dentro de la transacción recibida.
 *  2. recordAuditEvent(params)      -> fail-safe: envuelve en prisma.$transaction.
 */
export function recordAuditEvent(
  tx: Prisma.TransactionClient,
  params: AuditEventParams,
): Promise<AuditLogRecord>;
export function recordAuditEvent(params: AuditEventParams): Promise<AuditLogRecord>;
export async function recordAuditEvent(
  txOrParams: Prisma.TransactionClient | AuditEventParams,
  maybeParams?: AuditEventParams,
): Promise<AuditLogRecord> {
  if (maybeParams !== undefined) {
    const client = txOrParams as Prisma.TransactionClient | (Prisma.TransactionClient & {
      $transaction?: unknown;
    });
    // Si alguien pasa un PrismaClient completo como "tx", envolvemos igualmente.
    if (typeof (client as { $transaction?: unknown }).$transaction === "function") {
      const fullClient = client as unknown as typeof prisma;
      return fullClient.$transaction((tx) => insertAuditEvent(tx, maybeParams));
    }
    return insertAuditEvent(client, maybeParams);
  }

  const params = txOrParams as AuditEventParams;
  logger.debug("audit: sin transacción entrante; envolviendo en prisma.$transaction", {
    correlationId: params.correlationId ?? undefined,
    workshopId: params.workshopId,
    metadata: { action: params.action, entityType: params.entityType },
  });
  return prisma.$transaction((tx) => insertAuditEvent(tx, params));
}
