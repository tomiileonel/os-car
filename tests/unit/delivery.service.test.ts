import { describe, expect, it, vi } from "vitest";
import { DomainConflictException, NotFoundException, ValidationException } from "@/shared/errors";
import {
  deliverOrder,
  deliverOrderInTx,
  processOrderDelivery,
  processOrderDeliveryInTx,
  validateDeliveryOdometer,
} from "@/server/services/delivery.service";
import type { DeliverOrderCommand, DeliveryPrismaClient, DeliveryServiceTx } from "@/server/services/delivery.service";

function buildDeliveryTxMock(options?: {
  status?: string;
  version?: number;
  odometerAtIntake?: number;
  odometerCorrectedTo?: number | null;
  workOrderNull?: boolean;
  intakeRecordNull?: boolean;
  updateCount?: number;
}): DeliveryServiceTx {
  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue(
        options?.workOrderNull
          ? null
          : {
              id: "wo_1",
              status: options?.status ?? "LISTO",
              version: options?.version ?? 3,
              intakeRecord: options?.intakeRecordNull
                ? null
                : {
                    odometerAtIntake: options?.odometerAtIntake ?? 50000,
                    odometerCorrectedTo: options?.odometerCorrectedTo ?? null,
                  },
            }
      ),
      updateMany: vi.fn().mockResolvedValue({ count: options?.updateCount ?? 1 }),
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

  it("rechaza odómetro de entrega negativo con INVALID_DELIVERY_ODOMETER", () => {
    expect(() =>
      validateDeliveryOdometer({ initialOdometer: 50000, finalOdometer: -100 })
    ).toThrowError(
      expect.objectContaining({ name: "ValidationException", code: "INVALID_DELIVERY_ODOMETER" })
    );
  });

  it("rechaza odómetro de entrega no entero con INVALID_DELIVERY_ODOMETER", () => {
    expect(() =>
      validateDeliveryOdometer({ initialOdometer: 50000, finalOdometer: 50000.5 })
    ).toThrowError(
      expect.objectContaining({ name: "ValidationException", code: "INVALID_DELIVERY_ODOMETER" })
    );
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

  it("rechaza override con supervisorOverrideId vacío o sólo espacios", () => {
    expect(() =>
      validateDeliveryOdometer({
        initialOdometer: 50000,
        finalOdometer: 49900,
        supervisorOverrideId: "   ",
        supervisorNotes: "Justificación válida con suficiente longitud",
      })
    ).toThrowError(
      expect.objectContaining({ name: "ValidationException", code: "ODOMETER_REGRESSION" })
    );
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

  it("prioriza odometerCorrectedTo sobre odometerAtIntake para validar regresión", async () => {
    // intake: 50000, corrección posterior: 52000. Si entrega es 51000, debe fallar por regresión frente a 52000
    const tx = buildDeliveryTxMock({ odometerAtIntake: 50000, odometerCorrectedTo: 52000 });
    await expect(
      deliverOrderInTx(tx, { ...baseCommand, odometerAtDelivery: 51000 })
    ).rejects.toMatchObject({
      name: "ValidationException",
      code: "ODOMETER_REGRESSION",
      details: expect.objectContaining({ initialOdometer: 52000, odometerAtDelivery: 51000 }),
    });
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

  it("rechaza orden inexistente con NotFoundException (fail-closed)", async () => {
    const tx = buildDeliveryTxMock({ workOrderNull: true });
    await expect(deliverOrderInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "NotFoundException",
      code: "WORK_ORDER_NOT_FOUND",
    });
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

  it("rechaza orden sin intakeRecord con INTAKE_RECORD_MISSING", async () => {
    const tx = buildDeliveryTxMock({ intakeRecordNull: true });
    await expect(deliverOrderInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "ValidationException",
      code: "INTAKE_RECORD_MISSING",
    });
  });

  it("lanza VERSION_CONFLICT si CAS updateMany devuelve count 0", async () => {
    const tx = buildDeliveryTxMock({ updateCount: 0 });
    await expect(deliverOrderInTx(tx, baseCommand)).rejects.toMatchObject({
      name: "DomainConflictException",
      code: "VERSION_CONFLICT",
    });
  });

  it("entrega válida libera la bahía mecánica y emite mensaje en outbox", async () => {
    const tx: DeliveryServiceTx = {
      ...buildDeliveryTxMock(),
      bayAssignment: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{ bayId: "bay_elevador_1" }]),
      },
      bay: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      outboxMessage: {
        create: vi.fn().mockResolvedValue({ id: "outbox_1" }),
      },
    };

    const result = await deliverOrderInTx(tx, {
      ...baseCommand,
      recipientDocumentLast4: "4321",
      keysHandedOver: true,
      conformityAccepted: true,
      paymentMethod: "TRANSFERENCIA",
      notes: "Sin observaciones",
    });

    expect(result.status).toBe("ENTREGADO");
    expect(tx.bay!.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["bay_elevador_1"] }, workshopId: "ws_1" },
      data: { status: "LIBRE" },
    });
    expect(tx.deliveryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientDocumentLast4: "4321",
          keysHandedOver: true,
          conformityAccepted: true,
        }),
      })
    );
    expect(tx.outboxMessage!.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workshopId: "ws_1",
          eventType: "WHATSAPP_DELIVERY_RECEIPT",
          status: "PENDING",
          payload: expect.objectContaining({
            workOrderId: "wo_1",
            recipientName: "Juan Pérez",
            odometerAtDelivery: 50100,
            paymentMethod: "TRANSFERENCIA",
          }),
        }),
      })
    );
  });

  it("processOrderDeliveryInTx funciona como contrato unificado de entrega", async () => {
    const tx = buildDeliveryTxMock();
    const result = await processOrderDeliveryInTx(tx, {
      workOrderId: "wo_1",
      workshopId: "ws_1",
      adminId: "au_1",
      odometerAtDelivery: 50200,
      deliveredToName: "Carlos Gómez",
      paymentMethod: "EFECTIVO",
      expectedVersion: 3,
    });

    expect(result.status).toBe("ENTREGADO");
    expect(result.newVersion).toBe(4);
    expect(tx.deliveryRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientName: "Carlos Gómez",
          odometerAtDelivery: 50200,
        }),
      })
    );
  });

  it("deliverOrder ejecuta la transacción con nivel Serializable", async () => {
    const mockTx = buildDeliveryTxMock();
    const mockPrisma: DeliveryPrismaClient = {
      $transaction: vi.fn().mockImplementation(async (callback, options) => {
        expect(options).toEqual(
          expect.objectContaining({
            isolationLevel: "Serializable",
          })
        );
        return callback(mockTx);
      }),
    };

    const result = await deliverOrder(mockPrisma, baseCommand);
    expect(result.status).toBe("ENTREGADO");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("processOrderDelivery ejecuta la transacción con nivel Serializable", async () => {
    const mockTx = buildDeliveryTxMock();
    const mockPrisma: DeliveryPrismaClient = {
      $transaction: vi.fn().mockImplementation(async (callback, options) => {
        expect(options).toEqual(
          expect.objectContaining({
            isolationLevel: "Serializable",
          })
        );
        return callback(mockTx);
      }),
    };

    const result = await processOrderDelivery(mockPrisma, {
      workOrderId: "wo_1",
      workshopId: "ws_1",
      adminId: "au_1",
      odometerAtDelivery: 50100,
      deliveredToName: "Juan Pérez",
      expectedVersion: 3,
    });
    expect(result.status).toBe("ENTREGADO");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

