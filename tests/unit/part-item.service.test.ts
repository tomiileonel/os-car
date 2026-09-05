import { describe, expect, it, vi } from "vitest";
import { DomainConflictException, ValidationException } from "@/shared/errors";
import { updatePartItem, updatePartItemInTx } from "@/server/services/part-item.service";
import type { PartItemPrismaClient, PartItemServiceTx } from "@/server/services/part-item.service";

function buildPartTxMock(): PartItemServiceTx {
  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue({ id: "wo_1", status: "EN_REPARACION" }),
      update: vi.fn().mockResolvedValue({ id: "wo_1" }),
    },
    workItem: { findMany: vi.fn().mockResolvedValue([]) },
    partItem: {
      findFirst: vi.fn().mockResolvedValue({ id: "pi_1", version: 2, workOrderId: "wo_1", status: "PENDIENTE" }),
      findMany: vi.fn().mockResolvedValue([{ status: "CONSEGUIDO", requiresApproval: false, quantity: 1, unitPriceCharged: "10.00" }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    budget: { findFirst: vi.fn().mockResolvedValue(null) },
    intakeRecord: { findFirst: vi.fn().mockResolvedValue({ id: "ir_1" }) },
    qualityControl: { findFirst: vi.fn().mockResolvedValue(null) },
    orderBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "ob_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const baseCommand = {
  workshopId: "ws_1",
  partItemId: "pi_1",
  expectedVersion: 2,
  actorAdminId: "au_1",
  patch: { quantity: 3, unitPriceCharged: "1500.50", status: "CONSEGUIDO" as const },
};

describe("PartItemService — Invariante C1 (concurrencia optimista)", () => {
  it("mutación exitosa incrementa version y recalcula bloqueo y totales en la misma transacción", async () => {
    const tx = buildPartTxMock();
    const result = await updatePartItemInTx(tx, baseCommand);

    expect(result.newVersion).toBe(3);
    expect(tx.partItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "pi_1", version: 2 }),
        data: expect.objectContaining({
          quantity: 3,
          unitPriceCharged: "1500.50",
          status: "CONSEGUIDO",
          version: { increment: 1 },
        }),
      })
    );
    expect(tx.orderBlocker.findMany).toHaveBeenCalled();
    expect(tx.workOrder.update).toHaveBeenCalledWith({
      where: { id: "wo_1" },
      data: expect.objectContaining({ totalEstimated: expect.any(String) }),
    });
  });

  it("rechaza con DomainConflictException si expectedVersion no coincide (pre-check)", async () => {
    const tx = buildPartTxMock();
    vi.mocked(tx.partItem.findFirst).mockResolvedValue({
      id: "pi_1",
      version: 5,
      workOrderId: "wo_1",
      status: "PENDIENTE",
    });

    await expect(updatePartItemInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "VERSION_CONFLICT",
      details: { expectedVersion: 2, actualVersion: 5 },
    });
    expect(tx.partItem.updateMany).not.toHaveBeenCalled();
  });

  it("conflicto concurrente: segundo updateMany con count 0 aborta con VERSION_CONFLICT", async () => {
    const tx = buildPartTxMock();
    const updateManyMock = vi
      .mocked(tx.partItem.updateMany)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const prismaStub: PartItemPrismaClient = {
      $transaction: async <T>(fn: (tx: PartItemServiceTx) => Promise<T>) => fn(tx),
    };

    const first = await updatePartItem(prismaStub, baseCommand);
    expect(first.newVersion).toBe(3);

    await expect(updatePartItem(prismaStub, baseCommand)).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "VERSION_CONFLICT",
    });
    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it("valida precio unitario no negativo antes de mutar", async () => {
    const tx = buildPartTxMock();
    await expect(
      updatePartItemInTx(tx, { ...baseCommand, patch: { unitPriceCharged: "-1.00" } })
    ).rejects.toThrow(ValidationException);
    expect(tx.partItem.updateMany).not.toHaveBeenCalled();
  });
});
