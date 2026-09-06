import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateLaborLineTotal,
  calculatePartLineTotal,
  calculateOrderTotals,
} from "../../src/server/services/order-calculation.service";

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN, precision: 20 });

describe("order-calculation.service", () => {
  describe("calculateLaborLineTotal", () => {
    it("calcula correctamente horas exactas", () => {
      const total = calculateLaborLineTotal({
        estimatedMinutes: 120,
        hourlyRateCharged: 10000,
      });
      expect(total.toNumber()).toBe(20000);
    });

    it("calcula fracciones de hora", () => {
      const total = calculateLaborLineTotal({
        estimatedMinutes: 90,
        hourlyRateCharged: 10000,
      });
      expect(total.toNumber()).toBe(15000);
    });

    it("aplica ROUND_HALF_EVEN correctamente (25 min × 2500/h)", () => {
      const total = calculateLaborLineTotal({
        estimatedMinutes: 25,
        hourlyRateCharged: 2500,
      });
      expect(total.toFixed(2)).toBe("1041.67");
    });

    it("banker's rounding: redondea 5 al par más cercano", () => {
      // 3 × 33.335 = 100.005 → 100.00 (par)
      // 3 × 33.345 = 100.035 → 100.04 (sube, impar)
      const r1 = new Decimal(3)
        .times(new Decimal(33.335))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
      expect(r1.toFixed(2)).toBe("100.00");
    });

    it("rechaza minutos no positivos", () => {
      expect(() =>
        calculateLaborLineTotal({ estimatedMinutes: 0, hourlyRateCharged: 100 })
      ).toThrow("LABOR_MINUTES_MUST_BE_POSITIVE_INTEGER");
    });

    it("rechaza tarifa negativa", () => {
      expect(() =>
        calculateLaborLineTotal({ estimatedMinutes: 60, hourlyRateCharged: -100 })
      ).toThrow("HOURLY_RATE_MUST_BE_NON_NEGATIVE");
    });
  });

  describe("calculatePartLineTotal", () => {
    it("calcula cantidad × precio", () => {
      const total = calculatePartLineTotal({
        quantity: 4,
        unitPriceCharged: 1250.5,
      });
      expect(total.toFixed(2)).toBe("5002.00");
    });

    it("rechaza cantidad cero", () => {
      expect(() =>
        calculatePartLineTotal({ quantity: 0, unitPriceCharged: 100 })
      ).toThrow("PART_QUANTITY_MUST_BE_POSITIVE_INTEGER");
    });

    it("rechaza precio negativo", () => {
      expect(() =>
        calculatePartLineTotal({ quantity: 1, unitPriceCharged: -50 })
      ).toThrow("UNIT_PRICE_MUST_BE_NON_NEGATIVE");
    });
  });

  describe("calculateOrderTotals", () => {
    it("suma múltiples líneas", () => {
      const totals = calculateOrderTotals(
        [
          { estimatedMinutes: 60, hourlyRateCharged: 10000 },
          { estimatedMinutes: 90, hourlyRateCharged: 8000 },
        ],
        [
          { quantity: 2, unitPriceCharged: 15000 },
          { quantity: 1, unitPriceCharged: 7500.5 },
        ]
      );
      expect(totals.laborSubtotal.toFixed(2)).toBe("22000.00");
      expect(totals.partsSubtotal.toFixed(2)).toBe("37500.50");
      expect(totals.totalEstimated.toFixed(2)).toBe("59500.50");
    });

    it("retorna ceros para listas vacías", () => {
      const totals = calculateOrderTotals([], []);
      expect(totals.laborSubtotal.toNumber()).toBe(0);
      expect(totals.partsSubtotal.toNumber()).toBe(0);
      expect(totals.totalEstimated.toNumber()).toBe(0);
    });

    it("no acumula errores de punto flotante", () => {
      const lines = Array.from({ length: 100 }, () => ({
        quantity: 1,
        unitPriceCharged: 0.1,
      }));
      const totals = calculateOrderTotals([], lines);
      expect(totals.partsSubtotal.toFixed(2)).toBe("10.00");
    });
  });
});
