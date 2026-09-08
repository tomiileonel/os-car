/**
 * OS-CAR · Gate G5 — Outbox Job Worker (OT-G5-JOBS-TELEMETRY-001)
 * --------------------------------------------------------------------------
 * Procesador desacoplado de OutboxMessage con:
 *  - Estados: PENDING -> PROCESSING -> COMPLETED | FAILED -> DEAD_LETTER.
 *  - Reintentos con backoff exponencial + JITTER DETERMINÍSTICO (FNV-1a):
 *    el mismo (attempt, idempotentKey) produce SIEMPRE el mismo delay,
 *    lo que hace los reintentos reproducibles y testeables.
 *  - Claim atómico por updateMany condicional (sin SELECT ... FOR UPDATE),
 *    compatible con Prisma y seguro entre múltiples réplicas.
 *  - Recuperación de leases vencidos (PROCESSING con leaseExpiresAt < now).
 *  - Deduplicación estricta heredada del índice único de idempotentKey.
 */

import { prisma } from "@/server/db";
import { generateCorrelationId } from "@/shared/telemetry/correlation";
import { logger } from "@/shared/telemetry/logger";

export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD_LETTER";

export interface OutboxJobMessage {
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

export type OutboxJobHandler = (message: OutboxJobMessage) => Promise<void> | void;

const handlers = new Map<string, OutboxJobHandler>();

export function registerOutboxHandler(eventType: string, handler: OutboxJobHandler): void {
  handlers.set(eventType, handler);
}

export function getOutboxHandler(eventType: string): OutboxJobHandler | undefined {
  return handlers.get(eventType);
}

/** Solo para tests. */
export function clearOutboxHandlers(): void {
  handlers.clear();
}

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export const DEFAULT_BASE_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 300_000; // 5 minutos

/**
 * Hash FNV-1a 32-bit -> [0, 1). Determinístico, sin dependencias.
 */
export function deterministicRatio(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

/**
 * Backoff exponencial con jitter determinístico ("equal jitter"):
 * delay ∈ [exponential/2, exponential), donde
 * exponential = min(maxDelayMs, baseDelayMs * 2^attempt).
 * Mismo (attempt, seed) => mismo delay (reproducible en tests y retries).
 */
export function computeBackoffDelay(
  attempt: number,
  seed: string,
  options: BackoffOptions = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** safeAttempt);
  const jitter = deterministicRatio(`${seed}::attempt-${safeAttempt}`);
  return Math.floor(exponential / 2 + (exponential / 2) * jitter);
}

/** Interfaz estructural mínima del almacén (Prisma real o fake de tests). */
export interface OutboxStore {
  outboxMessage: {
    findFirst(args: { where?: unknown; orderBy?: unknown }): Promise<OutboxJobMessage | null>;
    findUnique(args: { where: { id: string } }): Promise<OutboxJobMessage | null>;
    updateMany(args: { where: unknown; data: unknown }): Promise<{ count: number }>;
  };
}

export interface WorkerRunSummary {
  scanned: number;
  completed: number;
  failed: number;
  deadLettered: number;
  skipped: number;
  idle: boolean;
}

export interface RunWorkerOnceOptions {
  db?: OutboxStore;
  batchSize?: number;
  workerId?: string;
  leaseMs?: number;
  now?: () => Date;
  backoff?: BackoffOptions;
}

export interface OutboxWorkerOptions extends RunWorkerOnceOptions {
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export interface OutboxWorkerHandle {
  stop(): Promise<void>;
  readonly running: boolean;
}

const CLAIM_RACE = Symbol("outbox-claim-race");
type ClaimResult = OutboxJobMessage | typeof CLAIM_RACE | null;

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

async function claimNextMessage(
  db: OutboxStore,
  workerId: string,
  leaseMs: number,
  now: () => Date,
): Promise<ClaimResult> {
  const currentTime = now();

  // Dueños de reclamo: PENDING/FAILED vencidos y PROCESSING con lease caído.
  const candidate = await db.outboxMessage.findFirst({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: currentTime } },
        { status: "PROCESSING", leaseExpiresAt: { not: null, lt: currentTime } },
      ],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;

  // Claim atómico: solo gana quien encuentra la fila en el estado esperado.
  const claimed = await db.outboxMessage.updateMany({
    where: { id: candidate.id, status: candidate.status },
    data: {
      status: "PROCESSING",
      lockedBy: workerId,
      leaseExpiresAt: new Date(currentTime.getTime() + leaseMs),
      attempts: { increment: 1 },
    },
  });
  if (claimed.count === 0) return CLAIM_RACE;

  const fresh = await db.outboxMessage.findUnique({ where: { id: candidate.id } });
  return fresh ?? null;
}

async function settleMessage(
  db: OutboxStore,
  messageId: string,
  workerId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const result = await db.outboxMessage.updateMany({
    where: { id: messageId, status: "PROCESSING", lockedBy: workerId },
    data,
  });
  if (result.count === 0) {
    logger.warn("outbox: lease perdido; otro worker tomó el mensaje", {
      metadata: { messageId, workerId },
    });
  }
}

type ProcessOutcome = "completed" | "failed" | "deadLettered";

async function processClaimedMessage(
  db: OutboxStore,
  message: OutboxJobMessage,
  workerId: string,
  now: () => Date,
  backoff?: BackoffOptions,
): Promise<ProcessOutcome> {
  const baseLog = {
    correlationId: message.correlationId ?? undefined,
    workshopId: message.workshopId,
    metadata: {
      messageId: message.id,
      eventType: message.eventType,
      idempotentKey: message.idempotentKey,
      attempt: message.attempts,
      maxAttempts: message.maxAttempts,
    },
  };

  const handler = getOutboxHandler(message.eventType);
  if (!handler) {
    // Sin handler no hay arreglo posible por reintento: DEAD_LETTER inmediato.
    logger.error("outbox: sin handler registrado para el eventType", baseLog);
    await settleMessage(db, message.id, workerId, {
      status: "DEAD_LETTER",
      lastError: `NO_HANDLER_FOR_EVENT:${message.eventType}`,
      lockedBy: null,
      leaseExpiresAt: null,
    });
    return "deadLettered";
  }

  try {
    await handler(message);
    await settleMessage(db, message.id, workerId, {
      status: "COMPLETED",
      completedAt: now(),
      lastError: null,
      lockedBy: null,
      leaseExpiresAt: null,
    });
    logger.info("outbox: mensaje completado", baseLog);
    return "completed";
  } catch (error) {
    const lastError = truncate(
      error instanceof Error ? error.stack ?? error.message : String(error),
      2000,
    );

    if (message.attempts >= message.maxAttempts) {
      await settleMessage(db, message.id, workerId, {
        status: "DEAD_LETTER",
        lastError,
        lockedBy: null,
        leaseExpiresAt: null,
      });
      logger.error("outbox: reintentos agotados; mensaje a DEAD_LETTER", {
        ...baseLog,
        error,
      });
      return "deadLettered";
    }

    const delayMs = computeBackoffDelay(message.attempts, message.idempotentKey, backoff);
    await settleMessage(db, message.id, workerId, {
      status: "FAILED",
      lastError,
      lockedBy: null,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(now().getTime() + delayMs),
    });
    logger.warn("outbox: intento fallido; reintento reprogramado", {
      ...baseLog,
      error,
      metadata: { ...baseLog.metadata, delayMs },
    });
    return "failed";
  }
}

/**
 * Procesa hasta batchSize mensajes. Seguro para múltiples réplicas:
 * el claim es condicional y la resolución verifica lockedBy.
 */
export async function runWorkerOnce(options: RunWorkerOnceOptions = {}): Promise<WorkerRunSummary> {
  const db: OutboxStore = options.db ?? (prisma as unknown as OutboxStore);
  const batchSize = Math.max(1, options.batchSize ?? 10);
  const workerId = options.workerId ?? `worker-${generateCorrelationId()}`;
  const leaseMs = options.leaseMs ?? 60_000;
  const now = options.now ?? (() => new Date());

  const summary: WorkerRunSummary = {
    scanned: 0,
    completed: 0,
    failed: 0,
    deadLettered: 0,
    skipped: 0,
    idle: true,
  };

  for (let index = 0; index < batchSize; index += 1) {
    const claim = await claimNextMessage(db, workerId, leaseMs, now);
    if (claim === null) break;

    summary.idle = false;
    if (claim === CLAIM_RACE) {
      summary.skipped += 1;
      continue;
    }

    summary.scanned += 1;
    const outcome = await processClaimedMessage(db, claim, workerId, now, options.backoff);
    summary[outcome] += 1;
  }

  return summary;
}

/**
 * Loop continuo del worker (setTimeout encadenado, un tick a la vez).
 * `stop()` detiene el polling de forma limpia (shutdown graceful).
 */
export function startOutboxWorker(options: OutboxWorkerOptions = {}): OutboxWorkerHandle {
  const pollIntervalMs = Math.max(50, options.pollIntervalMs ?? 2_000);
  const runOptions: RunWorkerOnceOptions = {
    db: options.db,
    batchSize: options.batchSize,
    workerId: options.workerId,
    leaseMs: options.leaseMs,
    now: options.now,
    backoff: options.backoff,
  };

  let stopped = false;
  let ticking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, pollIntervalMs);
    const maybeUnref = timer as { unref?: () => void };
    if (typeof maybeUnref.unref === "function") maybeUnref.unref();
  }

  async function tick(): Promise<void> {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const summary = await runWorkerOnce(runOptions);
      if (!summary.idle) {
        logger.debug("outbox: ciclo de polling completado", {
          metadata: { ...summary, workerId: runOptions.workerId },
        });
      }
    } catch (error) {
      logger.error("outbox: fallo inesperado en el ciclo del worker", { error });
    } finally {
      ticking = false;
      schedule();
    }
  }

  function stop(): Promise<void> {
    stopped = true;
    if (timer) clearTimeout(timer);
    return Promise.resolve();
  }

  options.signal?.addEventListener(
    "abort",
    () => {
      void stop();
    },
    { once: true },
  );

  void tick();

  return {
    stop,
    get running() {
      return ticking;
    },
  };
}
