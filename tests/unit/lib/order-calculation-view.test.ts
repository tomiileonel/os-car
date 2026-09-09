import { describe, it, expect } from "vitest";
import {
  calculateLaborLineTotal,
  calculatePartLineTotal,
  calculateOrderFinancials,
  roundTo2Decimals,
  formatCurrency,
} from "@/lib/order-calculation-view";

describe("order-calculation-view (Pure Financial Calculation)", () => {
  describe("calculateLaborLineTotal", () => {
    it("calculates labor correctly for exact hours (60 min)", () => {
      expect(calculateLaborLineTotal(60, 20000)).toBe(20000);
    });

    it("calculates labor correctly for fractional hours (90 min = 1.5h)", () => {
      expect(calculateLaborLineTotal(90, 22000)).toBe(33000);
    });

    it("calculates labor correctly for 3.5 hours (210 min @ $22,000)", () => {
      expect(calculateLaborLineTotal(210, 22000)).toBe(77000);
    });

    it("calculates labor correctly for 30 minutes (0.5h @ $15,000)", () => {
      expect(calculateLaborLineTotal(30, 15000)).toBe(7500);
    });

    it("returns 0 for 0 minutes or 0 rate", () => {
      expect(calculateLaborLineTotal(0, 22000)).toBe(0);
      expect(calculateLaborLineTotal(60, 0)).toBe(0);
      expect(calculateLaborLineTotal(-10, 22000)).toBe(0);
    });

    it("accepts string representations of numbers safely", () => {
      expect(calculateLaborLineTotal(60, "25000")).toBe(25000);
    });
  });

  describe("calculatePartLineTotal", () => {
    it("multiplies quantity by unit price", () => {
      expect(calculatePartLineTotal(1, 67200)).toBe(67200);
      expect(calculatePartLineTotal(2, 44800)).toBe(89600);
      expect(calculatePartLineTotal(4, 2500)).toBe(10000);
    });

    it("handles decimal prices with 2-decimal precision", () => {
      expect(calculatePartLineTotal(3, 10.55)).toBe(31.65);
    });

    it("returns 0 for 0 quantity or 0 price", () => {
      expect(calculatePartLineTotal(0, 15000)).toBe(0);
      expect(calculatePartLineTotal(5, 0)).toBe(0);
      expect(calculatePartLineTotal(-2, 10000)).toBe(0);
    });
  });

  describe("calculateOrderFinancials", () => {
    const sampleLabor = [
      { description: "Sustitución kit distribución", estimatedMinutes: 180, hourlyRateCharged: 22000 }, // 3h = $66,000
      { description: "Reemplazo bomba agua", estimatedMinutes: 90, hourlyRateCharged: 22000 }, // 1.5h = $33,000
      { description: "Diagnóstico escáner", estimatedMinutes: 60, hourlyRateCharged: 15000 }, // 1h = $15,000
    ];

    const sampleParts = [
      { description: "Kit Distribución Gates", quantity: 1, unitPriceCharged: 67200 },
      { description: "Bomba de Agua Dolz", quantity: 1, unitPriceCharged: 44800 },
      { description: "Refrigerante 5L", quantity: 1, unitPriceCharged: 20300 },
      { description: "Filtro Polen", quantity: 1, unitPriceCharged: 11200 },
    ];

    it("calculates exact labor subtotal, parts subtotal, 21% IVA, and total", () => {
      const summary = calculateOrderFinancials(sampleLabor, sampleParts);

      // Labor = 66,000 + 33,000 + 15,000 = 114,000
      expect(summary.laborSubtotal).toBe(114000);
      // Parts = 67,200 + 44,800 + 20,300 + 11,200 = 143,500
      expect(summary.partsSubtotal).toBe(143500);
      // Net = 114,000 + 143,500 = 257,500
      expect(summary.netSubtotal).toBe(257500);
      // Tax (21%) = 257,500 * 0.21 = 54,075
      expect(summary.taxAmount).toBe(54075);
      // Total = 257,500 + 54,075 = 311,575
      expect(summary.total).toBe(311575);

      expect(summary.laborCount).toBe(3);
      expect(summary.partsCount).toBe(4);
    });

    it("excludes lines marked as CANCELADO from calculations", () => {
      const laborWithCanceled = [
        ...sampleLabor,
        { description: "Lavado motor", estimatedMinutes: 60, hourlyRateCharged: 10000, status: "CANCELADO" },
      ];
      const partsWithCanceled = [
        ...sampleParts,
        { description: "Aceite sobrante", quantity: 2, unitPriceCharged: 8000, status: "CANCELADO" },
      ];

      const summary = calculateOrderFinancials(laborWithCanceled, partsWithCanceled);
      expect(summary.laborSubtotal).toBe(114000);
      expect(summary.partsSubtotal).toBe(143500);
      expect(summary.total).toBe(311575);
      expect(summary.laborCount).toBe(3);
      expect(summary.partsCount).toBe(4);
    });

    it("handles empty lists gracefully", () => {
      const summary = calculateOrderFinancials([], []);
      expect(summary.laborSubtotal).toBe(0);
      expect(summary.partsSubtotal).toBe(0);
      expect(summary.netSubtotal).toBe(0);
      expect(summary.taxAmount).toBe(0);
      expect(summary.total).toBe(0);
    });

    it("provides formatted currency strings", () => {
      const summary = calculateOrderFinancials(sampleLabor, sampleParts);
      expect(typeof summary.formatted.total).toBe("string");
      expect(summary.formatted.total.length).toBeGreaterThan(0);
    });
  });

  describe("formatCurrency", () => {
    it("formats positive amounts with currency symbol and 2 decimals", () => {
      const formatted = formatCurrency(114000);
      expect(formatted).toContain("114.000");
    });
  });
});
