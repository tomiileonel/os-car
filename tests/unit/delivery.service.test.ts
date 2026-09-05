import { describe, expect, it, vi } from "vitest";
import { DomainConflictException, ValidationException } from "@/shared/errors";
import { deliverOrderInTx, validateDeliveryOdometer } from "@/server/services/delivery.service";
import type { DeliverOrderCommand, DeliveryServiceTx } from "@/server/services/delivery.service";

function buildDeliveryTxMock(options?: {
  status?: string;
  version?: number;
  odometerAtIntake?: number;
  odometerCorrectedTo?: number | null;
}): DeliveryServiceTx {
  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue({
        id: "wo_1",
        status: options?.status ?? "LISTO",
        version: options?.version ?? 3,
        intakeRecord: {
          odometerAtIntake: options?.odometerAtIntake ?? 50000,
          odometerCorrectedTo: options?.odometerCorrectedTo ?? null,
        },
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    deliveryRecord: { create: vi.fn().mockResolvedValue({ id: "dr_1" }) },
    bayAssignment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    statusHistory: { create: vi.fn().mockResolvedValue({ id: "sh_1" }) },
  };
}

const baseCommand: DeliverOrderCommand = {
  workshopId: "ws_1",
  workOrderId: "wo_1",
  expectedVersion: 3,
  actorAdminId: "au_1",
  recipientName: "Juan Pérez",
  keysHandedOver: true,
  conformityAccepted: true,
  odometerAtDelivery: 50100,
};

describe("DeliveryService — Invariante A4 (no-regresión de odómetro)", () => {
  it("valida odómetro final igual al inicial", () => {
    const verdict = validateDeliveryOdometer({
      initialOdometer: 50000,
      finalOdometer: 50000,
    });
    expect(verdict).toEqual({ allowed: true, regressionDetected: false, overrideApplied: false });
  });

  it("valida odómetro final mayor", () => {
    const verdict = validateDeliveryOdometer({
      initialOdometer: 50000,
      finalOdometer: 50250,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("rechaza regresión de odómetro sin override", () => {
    expect(() =>
      validateDeliveryOdometer({ initialOdometer: 50000, finalOdometer: 49900 })
    ).toThrow(ValidationException);
  });

  it("rechaza override sin justificación suficiente", () => {
    expect(() =>
      validateDeliveryOdometer({
        initialOdometer: 50000,
        finalOdometer: 49900,
        supervisorOverrideId: "sup_1",
        supervisorNotes: "corto",
      })
    ).toThrow(ValidationException);
  });

  it("entrega válida ejecuta ENTREGADO + revocación + liberación de bahía", async () => {
    const tx = buildDeliveryTxMock();
    const result = await deliverOrderInTx(tx, baseCommand);

    expect(result.status).toBe("ENTREGADO");
    expect(result.newVersion).toBe(4);
    expect(tx.workOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "wo_1", version: 3, status: "LISTO" }),
        data: expect.objectContaining({
          status: "ENTREGADO",
          trackingCodeRevokedAt: expect.any(Date),
          version: { increment: 1 },
        }),
      })
    );
    expect(tx.deliveryRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.bayAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workOrderId: "wo_1", releasedAt: null },
        data: expect.objectContaining({ releasedAt: expect.any(Date), releaseReason: "ENTREGA" }),
      })
    );
    expect(tx.statusHistory.create).toHaveBeenCalledTimes(1);
  });

  it("regresión sin override aborta sin mutaciones", async () => {
    const tx = buildDeliveryTxMock();
    await expect(
      deliverOrderInTx(tx, { ...baseCommand, odometerAtDelivery: 49000 })
    ).rejects.toMatchObject({ name: "ValidationException", code: "ODOMETER_REGRESSION" });

    expect(tx.workOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.deliveryRecord.create).not.toHaveBeenCalled();
    expect(tx.bayAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("override de supervisor audita la excepción en metadata", async () => {
    const tx = buildDeliveryTxMock();
    const result = await deliverOrderInTx(tx, {
      ...baseCommand,
      odometerAtDelivery: 49000,
      supervisorOverrideId: "sup_1",
      supervisorNotes: "Odómetro reemplazado por garantía del fabricante.",
    });

    expect(result.odometerVerdict).toEqual({
      allowed: true,
      regressionDetected: true,
      overrideApplied: true,
    });
    expect(tx.statusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "ENTREGA_REALIZADA",
          metadata: expect.objectContaining({
            odometerRegression: true,
            odometerOverrideApplied: true,
            supervisorOverrideId: "sup_1",
          }),
        }),
      })
    );
  });

  it("rechaza entrega fuera del estado LISTO", async () => {
    const tx = buildDeliveryTxMock({ status: "CONTROL" });
    await expect(deliverOrderInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("rechaza expectedVersion desactualizada", async () => {
    const tx = buildDeliveryTxMock({ version: 4 });
    await expect(deliverOrderInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "VERSION_CONFLICT",
    });
  });
});
