import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));

vi.mock("@/server/db", () => ({
  prisma: { $transaction: transactionMock },
}));

import { recordAuditEvent, type AuditEventParams } from "@/server/audit/audit.service";

interface FakeAuditTx {
  tx: Prisma.TransactionClient;
  create: ReturnType<typeof vi.fn>;
}

function createFakeTx(): FakeAuditTx {
  const created = {
    id: "audit_1",
    workshopId: "ws_1",
    action: "ORDER_TRANSITIONED",
    entityType: "WORK_ORDER",
    entityId: "wo_1",
    createdAt: new Date("2026-09-03T10:00:00Z"),
  };
  const create = vi.fn().mockResolvedValue(created);
  const tx = { auditLog: { create } } as unknown as Prisma.TransactionClient;
  return { tx, create };
}

const baseParams: AuditEventParams = {
  workshopId: "ws_1",
  actorId: "admin_1",
  action: "ORDER_TRANSITIONED",
  entityType: "WORK_ORDER",
  entityId: "wo_1",
};

describe("recordAuditEvent", () => {
  beforeEach(() => {
    transactionMock.mockReset();
  });

  it("inserta dentro de la transacción recibida sin abrir una nueva", async () => {
    const { tx, create } = createFakeTx();

    const result = await recordAuditEvent(tx, {
      ...baseParams,
      beforeState: { status: "DIAGNOSTICO", password: "oops" },
      afterState: { status: "EN_REPARACION", token: "abc" },
      metadata: { route: "POST /transitions", apiKey: "kkk" },
      correlationId: "corr-42",
      workOrderId: "wo_1",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(result.id).toBe("audit_1");

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.workshopId).toBe("ws_1");
    expect(data.actorType).toBe("ADMIN");
    expect(data.actorAdminId).toBe("admin_1");
    expect(data.requestId).toBe("corr-42");
    expect(data.before).toEqual({ status: "DIAGNOSTICO", password: "[REDACTED]" });
    expect(data.after).toEqual({ status: "EN_REPARACION", token: "[REDACTED]" });
    expect(data.metadata).toEqual({ route: "POST /transitions", apiKey: "[REDACTED]" });
  });

  it("usa actor SYSTEM cuando no hay actorId", async () => {
    const { tx, create } = createFakeTx();

    await recordAuditEvent(tx, {
      workshopId: "ws_1",
      action: "OUTBOX_MESSAGE_ENQUEUED",
      entityType: "OUTBOX_MESSAGE",
      entityId: "msg_1",
    });

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.actorType).toBe("SYSTEM");
    expect(data.actorAdminId).toBeNull();
  });

  it("fail-safe: sin transacción entrante envuelve en prisma.$transaction", async () => {
    const { tx, create } = createFakeTx();
    transactionMock.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    await recordAuditEvent({
      workshopId: "ws_2",
      actorId: "admin_2",
      action: "VEHICLE_CREATED",
      entityType: "VEHICLE",
      entityId: "veh_1",
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.workshopId).toBe("ws_2");
  });

  it("atomicidad: un error de inserción se propaga (rollback delegado a Prisma)", async () => {
    const failingCreate = vi.fn().mockRejectedValue(new Error("DB_WRITE_FAILED"));
    const tx = { auditLog: { create: failingCreate } } as unknown as Prisma.TransactionClient;
    transactionMock.mockImplementation(async (callback: (t: unknown) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(recordAuditEvent({ ...baseParams })).rejects.toThrow("DB_WRITE_FAILED");
    expect(failingCreate).toHaveBeenCalledTimes(1);
  });

  it("aislamiento multi-tenant: exige workshopId y lo escribe siempre desde los parámetros", async () => {
    const { tx, create } = createFakeTx();

    await expect(
      recordAuditEvent(tx, {
        workshopId: "   ",
        action: "ORDER_CANCELLED",
        entityType: "WORK_ORDER",
        entityId: "wo_9",
      }),
    ).rejects.toThrow(/AUDIT_TENANT_REQUIRED/);

    await recordAuditEvent(tx, { ...baseParams, workshopId: "ws_A" });
    await recordAuditEvent(tx, { ...baseParams, workshopId: "ws_B" });

    const firstData = create.mock.calls[0][0].data as Record<string, unknown>;
    const secondData = create.mock.calls[1][0].data as Record<string, unknown>;
    expect(firstData.workshopId).toBe("ws_A");
    expect(secondData.workshopId).toBe("ws_B");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
