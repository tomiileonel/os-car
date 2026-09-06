import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { ValidationException, NotFoundException } from "@/shared/errors";
import {
  calculateLaborLineTotal,
  calculateOrderTotals,
  calculatePartLineTotal,
  isRetryableConcurrencyError,
  recalculateOrderTotals,
  recalculateOrderTotalsInTx,
  withSerializableRetry,
} from "@/server/services/order-calculation.service";
import type {
  OrderTotals,
  OrderTotalsPrismaClient,
  TotalsRecalculationTx,
} from "@/server/services/order-calculation.service";

function buildTotalsTxMock(): TotalsRecalculationTx {
  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue({ id: "wo_1" }),
      update: vi.fn().mockResolvedValue({ id: "wo_1" }),
    },
    workItem: {
      findMany: vi.fn().mockResolvedValue([
        { status: "PENDIENTE", estimatedMinutes: 45, hourlyRateCharged: "24000.00" },
        { status: "CANCELADO", estimatedMinutes: 120, hourlyRateCharged: "99999.00" },
      ]),
    },
    partItem: {
      findMany: vi.fn().mockResolvedValue([
        { status: "CONSEGUIDO", quantity: 2, unitPriceCharged: "1500.50" },
        { status: "CANCELADO", quantity: 9, unitPriceCharged: "777.77" },
      ]),
    },
  };
}

describe("OrderCalculationService — precisión decimal", () => {
  it("45 min a 24000.00/h producen 18000.00 exactos", () => {
    const total = calculateLaborLineTotal({ estimatedMinutes: 45, hourlyRateCharged: "24000.00" });
    expect(total.toFixed(2)).toBe("18000.00");
  });

  it("redondea HALF_EVEN (banker's rounding) en caso de empate exacto .xx5 (30 min a 3.33/h -> 1.66, no 1.67)", () => {
    // 30 / 60 * 3.33 = 1.665. En HALF_EVEN el último dígito par es 6 -> 1.66. (En HALF_UP daría 1.67)
    const total = calculateLaborLineTotal({ estimatedMinutes: 30, hourlyRateCharged: "3.33" });
    expect(total.toFixed(2)).toBe("1.66");
  });

  it("redondea HALF_EVEN en caso de empate con impar (30 min a 3.35/h -> 1.68)", () => {
    // 30 / 60 * 3.35 = 1.675. En HALF_EVEN el par más cercano es 8 -> 1.68.
    const total = calculateLaborLineTotal({ estimatedMinutes: 30, hourlyRateCharged: "3.35" });
    expect(total.toFixed(2)).toBe("1.68");
  });

  it("30 min a 1999.99/h redondean 999.995 a 1000.00", () => {
    const total = calculateLaborLineTotal({ estimatedMinutes: 30, hourlyRateCharged: "1999.99" });
    expect(total.toFixed(2)).toBe("1000.00");
  });

  it("rechaza tarifas horarias negativas", () => {
    expect(() =>
      calculateLaborLineTotal({ estimatedMinutes: 45, hourlyRateCharged: "-5.00" })
    ).toThrow(ValidationException);
  });

  it("línea de repuestos 2 × 1500.50 = 3001.00", () => {
    const total = calculatePartLineTotal({ quantity: 2, unitPriceCharged: "1500.50" });
    expect(total.toFixed(2)).toBe("3001.00");
  });

  it("rechaza cantidades de repuestos no positivas", () => {
    expect(() => calculatePartLineTotal({ quantity: 0, unitPriceCharged: "10.00" })).toThrow(
      ValidationException
    );
  });

  it("excluye líneas CANCELADO del cálculo de totales", () => {
    const totals = calculateOrderTotals({
      workItems: [
        { status: "PENDIENTE", estimatedMinutes: 45, hourlyRateCharged: "24000.00" },
        { status: "CANCELADO", estimatedMinutes: 120, hourlyRateCharged: "99999.00" },
      ],
      partItems: [
        { status: "CONSEGUIDO", quantity: 2, unitPriceCharged: "1500.50" },
        { status: "CANCELADO", quantity: 9, unitPriceCharged: "777.77" },
      ],
    });
    expect(totals.laborSubtotal).toBe("18000.00");
    expect(totals.partsSubtotal).toBe("3001.00");
    expect(totals.totalEstimated).toBe("21001.00");
  });

  it("recalculateOrderTotalsInTx persiste subtotales como strings Decimal(12,2)", async () => {
    const tx = buildTotalsTxMock();
    const totals = await recalculateOrderTotalsInTx(tx, { workshopId: "ws_1", workOrderId: "wo_1" });
    expect(totals.totalEstimated).toBe("21001.00");
    expect(tx.workOrder.update).toHaveBeenCalledWith({
      where: { id: "wo_1" },
      data: { laborSubtotal: "18000.00", partsSubtotal: "3001.00", totalEstimated: "21001.00" },
    });
  });

  it("recalculateOrderTotalsInTx arroja NotFoundException si la orden no existe", async () => {
    const tx = buildTotalsTxMock();
    vi.mocked(tx.workOrder.findFirst).mockResolvedValue(null);
    await expect(
      recalculateOrderTotalsInTx(tx, { workshopId: "ws_1", workOrderId: "wo_missing" })
    ).rejects.toThrow(NotFoundException);
  });

  it("recalculateOrderTotals abre transacción con aislamiento Serializable", async () => {
    const tx = buildTotalsTxMock();
    const transactionSpy = vi.fn(
      async (fn: (t: TotalsRecalculationTx) => Promise<OrderTotals>, _options?: { isolationLevel?: string }) =>
        fn(tx)
    );
    const prismaStub: OrderTotalsPrismaClient = {
      $transaction: transactionSpy as unknown as OrderTotalsPrismaClient["$transaction"],
    };

    const result = await recalculateOrderTotals(prismaStub, { workshopId: "ws_1", workOrderId: "wo_1" });

    expect(result.totalEstimated).toBe("21001.00");
    expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  describe("withSerializableRetry — Motor Resiliente de Reintentos SSI", () => {
    it("intercepta exitosamente PrismaClientKnownRequestError con código P2034 en intento 1 y resuelve en intento 2", async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
            {
              code: "P2034",
              clientVersion: "6.19.3",
            }
          );
        }
        return { success: true, attempts: callCount };
      });

      const result = await withSerializableRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 5,
        maxDelayMs: 20,
      });
      expect(result).toEqual({ success: true, attempts: 2 });
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("intercepta errores con código 40001 anidado en error.cause (@prisma/adapter-pg)", async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          const error = new Error("Database error occurred");
          (error as unknown as Record<string, unknown>).cause = {
            code: "40001",
            message: "could not serialize access due to read/write dependencies among transactions",
          };
          throw error;
        }
        return "RECOVERED_FROM_ADAPTER_ERROR";
      });

      const result = await withSerializableRetry(fn, { maxAttempts: 2, baseDelayMs: 2 });
      expect(result).toBe("RECOVERED_FROM_ADAPTER_ERROR");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("intercepta error con código 40P01 (deadlock)", async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          const error = new Error("deadlock detected");
          (error as unknown as Record<string, unknown>).code = "40P01";
          throw error;
        }
        return "RECOVERED_DEADLOCK";
      });

      const result = await withSerializableRetry(fn, { maxAttempts: 2, baseDelayMs: 2 });
      expect(result).toBe("RECOVERED_DEADLOCK");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("rechaza de inmediato sin reintentar ante P2002 (Unique Violation) o NotFoundException", async () => {
      const fnUnique = vi.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        });
      });

      await expect(withSerializableRetry(fnUnique, { maxAttempts: 3 })).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError
      );
      expect(fnUnique).toHaveBeenCalledTimes(1);

      const fnNotFound = vi.fn(async () => {
        throw new NotFoundException("RECORD_NOT_FOUND", "No existe registro.");
      });

      await expect(withSerializableRetry(fnNotFound, { maxAttempts: 3 })).rejects.toThrow(
        NotFoundException
      );
      expect(fnNotFound).toHaveBeenCalledTimes(1);
    });

    it("arroja el error si se agota el número máximo de intentos", async () => {
      const fn = vi.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError(
          "Transaction failed due to a write conflict",
          {
            code: "P2034",
            clientVersion: "6.19.3",
          }
        );
      });

      await expect(
        withSerializableRetry(fn, { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 5 })
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});

