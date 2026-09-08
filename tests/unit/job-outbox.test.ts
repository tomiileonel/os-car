import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock("@/server/db", () => ({
  prisma: { $transaction: transactionMock },
}));

import { enqueueOutboxMessage } from "@/server/jobs/outbox.service";
import {
  clearOutboxHandlers,
  computeBackoffDelay,
  deterministicRatio,
  registerOutboxHandler,
  runWorkerOnce,
  type OutboxJobMessage,
} from "@/server/jobs/worker";

const FIXED_NOW = new Date("2026-09-03T12:00:00Z");

function buildMessage(overrides: Partial<OutboxJobMessage> = {}): OutboxJobMessage {
  return {
    id: "msg_1",
    workshopId: "ws_1",
    eventType: "WORK_ORDER_DELIVERED",
    payload: { workOrderId: "wo_1" },
    idempotentKey: "key-1",
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    lastError: null,
    lockedBy: null,
    leaseExpiresAt: null,
    nextAttemptAt: new Date("2026-09-03T11:00:00Z"),
    createdAt: new Date("2026-09-03T10:00:00Z"),
    updatedAt: new Date("2026-09-03T10:00:00Z"),
    completedAt: null,
    correlationId: null,
    ...overrides,
  };
}

describe("enqueueOutboxMessage — deduplicación estricta", () => {
  it("si ya existe la idempotentKey no crea duplicado", async () => {
    const existing = buildMessage();
    const txFake = {
      outboxMessage: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
      },
    };
    const tx = txFake as unknown as Prisma.TransactionClient;

    const result = await enqueueOutboxMessage(tx, {
      workshopId: "ws_1",
      eventType: "WORK_ORDER_DELIVERED",
      payload: { workOrderId: "wo_1" },
      idempotentKey: "key-1",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.message.id).toBe("msg_1");
    expect(txFake.outboxMessage.create).not.toHaveBeenCalled();
  });

  it("crea el mensaje en PENDING cuando la clave es nueva", async () => {
    const created = buildMessage({ id: "msg_new" });
    const txFake = {
      outboxMessage: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const tx = txFake as unknown as Prisma.TransactionClient;

    const result = await enqueueOutboxMessage(tx, {
      workshopId: "ws_1",
      eventType: "WORK_ORDER_DELIVERED",
      payload: { workOrderId: "wo_1" },
      idempotentKey: "key-1",
      correlationId: "corr-7",
    });

    expect(result.deduplicated).toBe(false);
    expect(result.message.id).toBe("msg_new");
    const data = txFake.outboxMessage.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe("PENDING");
    expect(data.idempotentKey).toBe("key-1");
    expect(data.maxAttempts).toBe(5);
    expect(data.correlationId).toBe("corr-7");
  });

  it("carrera P2002: resuelve como deduplicado releyendo la fila ganadora", async () => {
    const existing = buildMessage();
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    const create = vi.fn().mockRejectedValue(p2002);
    const txFake = { outboxMessage: { findUnique, create } };
    const tx = txFake as unknown as Prisma.TransactionClient;

    const result = await enqueueOutboxMessage(tx, {
      workshopId: "ws_1",
      eventType: "WORK_ORDER_DELIVERED",
      payload: { workOrderId: "wo_1" },
      idempotentKey: "key-1",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.message.id).toBe("msg_1");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("rechaza payloads sin idempotentKey o sin tenant", async () => {
    const txFake = { outboxMessage: { findUnique: vi.fn(), create: vi.fn() } };
    const tx = txFake as unknown as Prisma.TransactionClient;

    await expect(
      enqueueOutboxMessage(tx, {
        workshopId: "ws_1",
        eventType: "X",
        payload: {},
        idempotentKey: "  ",
      }),
    ).rejects.toThrow(/OUTBOX_IDEMPOTENT_KEY_REQUIRED/);

    await expect(
      enqueueOutboxMessage(tx, {
        workshopId: "",
        eventType: "X",
        payload: {},
        idempotentKey: "k",
      }),
    ).rejects.toThrow(/OUTBOX_TENANT_REQUIRED/);
  });
});

describe("backoff exponencial con jitter determinístico", () => {
  it("deterministicRatio es reproducible y cae en [0, 1)", () => {
    expect(deterministicRatio("seed-1")).toBe(deterministicRatio("seed-1"));
    expect(deterministicRatio("seed-1")).not.toBe(deterministicRatio("seed-2"));
    const ratio = deterministicRatio("seed-1");
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThan(1);
  });

  it("computeBackoffDelay es determinístico y acotado a [exp/2, exp)", () => {
    const attempt = 3;
    const first = computeBackoffDelay(attempt, "seed-A");
    const second = computeBackoffDelay(attempt, "seed-A");
    expect(first).toBe(second);

    const exponential = 1000 * 2 ** attempt; // base default 1000ms
    expect(first).toBeGreaterThanOrEqual(exponential / 2);
    expect(first).toBeLessThan(exponential);
  });

  it("respeta maxDelayMs en intentos altos", () => {
    const value = computeBackoffDelay(30, "seed-B", { baseDelayMs: 1000, maxDelayMs: 5000 });
    expect(value).toBeGreaterThanOrEqual(2500);
    expect(value).toBeLessThanOrEqual(5000);
  });

  it("el delay crece con el intento hasta el techo", () => {
    const low = computeBackoffDelay(1, "seed-C", { baseDelayMs: 1000, maxDelayMs: 60_000 });
    const high = computeBackoffDelay(4, "seed-C", { baseDelayMs: 1000, maxDelayMs: 60_000 });
    expect(high).toBeGreaterThan(low);
  });
});

describe("runWorkerOnce — ciclo de vida del job", () => {
  beforeEach(() => {
    clearOutboxHandlers();
  });

  function buildDb(candidate: OutboxJobMessage | null, claimed: OutboxJobMessage | null) {
    return {
      outboxMessage: {
        findFirst: vi.fn().mockResolvedValueOnce(candidate).mockResolvedValueOnce(null),
        findUnique: vi.fn().mockResolvedValue(claimed),
        updateMany: vi.fn(),
      },
    };
  }

  it("reclama un PENDING, ejecuta el handler y lo marca COMPLETED", async () => {
    const handler = vi.fn();
    registerOutboxHandler("WORK_ORDER_DELIVERED", handler);

    const candidate = buildMessage();
    const claimedRecord = buildMessage({ status: "PROCESSING", attempts: 1, lockedBy: "w-1" });
    const db = buildDb(candidate, claimedRecord);
    db.outboxMessage.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // settle COMPLETED

    const summary = await runWorkerOnce({
      db: db as never,
      batchSize: 2,
      workerId: "w-1",
      now: () => FIXED_NOW,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(summary.completed).toBe(1);
    expect(summary.scanned).toBe(1);

    const claimCall = db.outboxMessage.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(claimCall.data.status).toBe("PROCESSING");
    expect(claimCall.data.attempts).toEqual({ increment: 1 });

    const settleCall = db.outboxMessage.updateMany.mock.calls[1][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(settleCall.data.status).toBe("COMPLETED");
    expect(settleCall.where.lockedBy).toBe("w-1");

    // El polling contempla leases PROCESSING vencidos.
    const findFirstArgs = db.outboxMessage.findFirst.mock.calls[0][0] as {
      where: { OR: unknown[] };
    };
    expect(JSON.stringify(findFirstArgs.where.OR)).toContain("PROCESSING");
  });

  it("ante fallo programa reintento con FAILED + nextAttemptAt futuro", async () => {
    registerOutboxHandler("WORK_ORDER_DELIVERED", () => {
      throw new Error("BOOM");
    });

    const candidate = buildMessage();
    const claimedRecord = buildMessage({ status: "PROCESSING", attempts: 2, lockedBy: "w-1" });
    const db = buildDb(candidate, claimedRecord);
    db.outboxMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const summary = await runWorkerOnce({
      db: db as never,
      batchSize: 1,
      workerId: "w-1",
      now: () => FIXED_NOW,
    });

    expect(summary.failed).toBe(1);
    const settleCall = db.outboxMessage.updateMany.mock.calls[1][0] as {
      data: { status: string; nextAttemptAt: Date; lastError: string };
    };
    expect(settleCall.data.status).toBe("FAILED");
    expect(settleCall.data.nextAttemptAt.getTime()).toBeGreaterThan(FIXED_NOW.getTime());
    expect(settleCall.data.lastError).toContain("BOOM");
  });

  it("con reintentos agotados envía el mensaje a DEAD_LETTER", async () => {
    registerOutboxHandler("WORK_ORDER_DELIVERED", () => {
      throw new Error("BOOM AGAIN");
    });

    const candidate = buildMessage();
    const claimedRecord = buildMessage({
      status: "PROCESSING",
      attempts: 5,
      maxAttempts: 5,
      lockedBy: "w-1",
    });
    const db = buildDb(candidate, claimedRecord);
    db.outboxMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const summary = await runWorkerOnce({
      db: db as never,
      batchSize: 1,
      workerId: "w-1",
      now: () => FIXED_NOW,
    });

    expect(summary.deadLettered).toBe(1);
    const settleCall = db.outboxMessage.updateMany.mock.calls[1][0] as {
      data: { status: string; lastError: string };
    };
    expect(settleCall.data.status).toBe("DEAD_LETTER");
    expect(settleCall.data.lastError).toContain("BOOM AGAIN");
  });

  it("sin handler registrado va directo a DEAD_LETTER", async () => {
    const candidate = buildMessage({ eventType: "UNKNOWN_EVENT" });
    const claimedRecord = buildMessage({
      eventType: "UNKNOWN_EVENT",
      status: "PROCESSING",
      attempts: 1,
      lockedBy: "w-1",
    });
    const db = buildDb(candidate, claimedRecord);
    db.outboxMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const summary = await runWorkerOnce({
      db: db as never,
      batchSize: 1,
      workerId: "w-1",
      now: () => FIXED_NOW,
    });

    expect(summary.deadLettered).toBe(1);
    const settleCall = db.outboxMessage.updateMany.mock.calls[1][0] as {
      data: { status: string; lastError: string };
    };
    expect(settleCall.data.status).toBe("DEAD_LETTER");
    expect(settleCall.data.lastError).toContain("NO_HANDLER_FOR_EVENT:UNKNOWN_EVENT");
  });

  it("carrera de claim: si otro worker gana, se salta sin ejecutar el handler", async () => {
    const handler = vi.fn();
    registerOutboxHandler("WORK_ORDER_DELIVERED", handler);

    const candidate = buildMessage();
    const db = buildDb(candidate, null);
    db.outboxMessage.updateMany.mockResolvedValueOnce({ count: 0 }); // perdió el claim

    const summary = await runWorkerOnce({
      db: db as never,
      batchSize: 2,
      workerId: "w-2",
      now: () => FIXED_NOW,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(db.outboxMessage.findUnique).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(summary.scanned).toBe(0);
    expect(summary.completed).toBe(0);
  });
});
