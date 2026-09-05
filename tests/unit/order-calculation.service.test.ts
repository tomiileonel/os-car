import { describe, expect, it, vi } from "vitest";
import { ValidationException, NotFoundException } from "@/shared/errors";
import {
  calculateLaborLineTotal,
  calculateOrderTotals,
  calculatePartLineTotal,
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

  describe("withSerializableRetry", () => {
    it("reintenta automáticamente ante error de serialización pg 40001 y resuelve", async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("could not serialize access due to read/write dependencies");
          (err as unknown as { code: string }).code = "40001";
          throw err;
        }
        return "SUCCESS";
      });

      const result = await withSerializableRetry(fn, 3);
      expect(result).toBe("SUCCESS");
      expect(attempts).toBe(2);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("reintenta automáticamente ante deadlock pg 40P01", async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error("deadlock detected");
          (err as unknown as { code: string }).code = "40P01";
          throw err;
        }
        return "SUCCESS_AFTER_DEADLOCK";
      });

      const result = await withSerializableRetry(fn, 3);
      expect(result).toBe("SUCCESS_AFTER_DEADLOCK");
      expect(attempts).toBe(2);
    });

    it("arroja el error si se agota el número máximo de intentos", async () => {
      const fn = vi.fn(async () => {
        const err = new Error("serialization_failure permanent");
        (err as unknown as { code: string }).code = "40001";
        throw err;
      });

      await expect(withSerializableRetry(fn, 3)).rejects.toThrow("serialization_failure permanent");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("no reintenta ante errores no relacionados a concurrencia y falla inmediatamente", async () => {
      const fn = vi.fn(async () => {
        throw new NotFoundException("ORDER_NOT_FOUND", "No existe");
      });

      await expect(withSerializableRetry(fn, 3)).rejects.toThrow(NotFoundException);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

