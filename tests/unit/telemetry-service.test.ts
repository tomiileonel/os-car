import { describe, expect, it, vi } from "vitest";
import {
  parseTelemetryPeriod,
  resolvePeriodDates,
  getWorkshopTelemetry,
} from "@/server/services/telemetry.service";
import type { PrismaClient } from "@prisma/client";

describe("TelemetryService — Unit Tests", () => {
  describe("Period parsing & date boundaries", () => {
    it("parses valid periods accurately", () => {
      expect(parseTelemetryPeriod("today")).toBe("today");
      expect(parseTelemetryPeriod("week")).toBe("week");
      expect(parseTelemetryPeriod("month")).toBe("month");
      expect(parseTelemetryPeriod("quarter")).toBe("quarter");
    });

    it("falls back to 'month' on invalid or missing period", () => {
      expect(parseTelemetryPeriod(null)).toBe("month");
      expect(parseTelemetryPeriod(undefined)).toBe("month");
      expect(parseTelemetryPeriod("invalid_period")).toBe("month");
      expect(parseTelemetryPeriod("year")).toBe("month");
    });

    it("resolves date intervals deterministically", () => {
      const fixedNow = new Date("2026-09-10T12:00:00.000Z");
      const today = resolvePeriodDates("today", fixedNow);
      expect(today.endDate.getTime()).toBe(fixedNow.getTime());
      expect(today.startDate.getHours()).toBe(0);

      const week = resolvePeriodDates("week", fixedNow);
      const diffWeek = week.endDate.getTime() - week.startDate.getTime();
      expect(diffWeek).toBe(7 * 24 * 60 * 60 * 1000);

      const month = resolvePeriodDates("month", fixedNow);
      const diffMonth = month.endDate.getTime() - month.startDate.getTime();
      expect(diffMonth).toBe(30 * 24 * 60 * 60 * 1000);

      const quarter = resolvePeriodDates("quarter", fixedNow);
      const diffQuarter = quarter.endDate.getTime() - quarter.startDate.getTime();
      expect(diffQuarter).toBe(90 * 24 * 60 * 60 * 1000);
    });
  });

  describe("Zero-division defenses and empty workshop metrics", () => {
    it("returns zero metrics without NaN or Infinity when workshop is empty", async () => {
      const mockPrisma = {
        workOrder: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        bay: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      const report = await getWorkshopTelemetry(mockPrisma, {
        workshopId: "empty_workshop_1",
        period: "month",
        now: new Date("2026-09-10T12:00:00Z"),
      });

      expect(report.workshopId).toBe("empty_workshop_1");
      expect(report.period).toBe("month");

      // Cycle times
      expect(report.cycleTimes.avgLeadTimeHours).toBe(0);
      expect(report.cycleTimes.avgLeadTimeDays).toBe(0);
      expect(report.cycleTimes.avgRepairTimeHours).toBe(0);
      expect(report.cycleTimes.avgDiagnosisTimeHours).toBe(0);
      expect(report.cycleTimes.deliveredOrdersCount).toBe(0);

      // Bays
      expect(report.bays.totalBays).toBe(0);
      expect(report.bays.occupiedBays).toBe(0);
      expect(report.bays.freeBays).toBe(0);
      expect(report.bays.utilizationRate).toBe(0);

      // Budgets
      expect(report.budgets.totalBudgets).toBe(0);
      expect(report.budgets.approvedBudgets).toBe(0);
      expect(report.budgets.approvalRate).toBe(0);
      expect(report.budgets.lineApprovalRate).toBe(0);
      expect(report.budgets.totalEstimatedAmount).toBe(0);
      expect(report.budgets.totalApprovedAmount).toBe(0);

      // Financials
      expect(report.financials.deliveredRevenue).toBe(0);
      expect(report.financials.workInProgressEstimated).toBe(0);
      expect(report.financials.totalRevenue).toBe(0);

      // FSM
      expect(report.fsmDistribution.totalActive).toBe(0);
      expect(report.fsmDistribution.totalInPeriod).toBe(0);
    });
  });

  describe("Accurate calculation of cycle times, bays, and budgets", () => {
    it("calculates cycle times, bay occupancy, and granular line approval accurately", async () => {
      const now = new Date("2026-09-10T15:00:00Z");

      // 2 delivered orders:
      // wo1: opened 48h ago, diagnosed 4h later, repairStarted 8h later, ready 24h later, delivered 2h later (total 48h)
      // wo2: opened 24h ago, diagnosed 2h later, repairStarted 4h later, ready 12h later, delivered 1h later (total 24h)
      const deliveredOrdersMock = [
        {
          id: "wo_del_1",
          status: "ENTREGADO",
          openedAt: new Date(now.getTime() - 48 * 3600 * 1000),
          diagnosedAt: new Date(now.getTime() - 44 * 3600 * 1000),
          repairStartedAt: new Date(now.getTime() - 40 * 3600 * 1000),
          readyAt: new Date(now.getTime() - 16 * 3600 * 1000), // repair duration = 24h
          deliveredAt: new Date(now.getTime() - 1 * 3600 * 1000), // lead time = 47h
          totalEstimated: 100000,
          totalFinal: 120000,
        },
        {
          id: "wo_del_2",
          status: "ENTREGADO",
          openedAt: new Date(now.getTime() - 25 * 3600 * 1000),
          diagnosedAt: new Date(now.getTime() - 23 * 3600 * 1000),
          repairStartedAt: new Date(now.getTime() - 20 * 3600 * 1000),
          readyAt: new Date(now.getTime() - 8 * 3600 * 1000), // repair duration = 12h
          deliveredAt: new Date(now.getTime() - 1 * 3600 * 1000), // lead time = 24h
          totalEstimated: 80000,
          totalFinal: 80000,
        },
      ];

      // Active orders in floor:
      const activeOrdersMock = [
        {
          id: "wo_act_1",
          status: "DIAGNOSTICO",
          openedAt: new Date(now.getTime() - 10 * 3600 * 1000),
          totalEstimated: 50000,
          vehicle: { licensePlate: "AB 123 CD", make: "Toyota", model: "Corolla" },
        },
        {
          id: "wo_act_2",
          status: "EN_REPARACION",
          openedAt: new Date(now.getTime() - 15 * 3600 * 1000),
          totalEstimated: 150000,
          vehicle: { licensePlate: "AF 999 ZZ", make: "Ford", model: "Ranger" },
        },
      ];

      // Orders opened in period with budgets:
      const ordersInPeriodMock = [
        {
          id: "wo_del_1",
          status: "ENTREGADO",
          openedAt: new Date(now.getTime() - 48 * 3600 * 1000),
          budget: {
            currentVersion: {
              status: "APROBADO",
              totalEstimated: 120000,
              laborLines: [
                { id: "l1", isApproved: true, lineTotal: 40000 },
                { id: "l2", isApproved: true, lineTotal: 20000 },
              ],
              partLines: [
                { id: "p1", isApproved: true, lineTotal: 60000 },
              ],
            },
          },
        },
        {
          id: "wo_act_1",
          status: "DIAGNOSTICO",
          openedAt: new Date(now.getTime() - 10 * 3600 * 1000),
          budget: {
            currentVersion: {
              status: "PENDIENTE_APROBACION",
              totalEstimated: 50000,
              laborLines: [
                { id: "l3", isApproved: false, lineTotal: 25000 },
              ],
              partLines: [
                { id: "p2", isApproved: false, lineTotal: 25000 },
              ],
            },
          },
        },
      ];

      // 4 bays: 2 occupied, 2 free
      const baysMock = [
        {
          id: "bay_1",
          code: "B1",
          ordinal: 1,
          status: "OCUPADA",
          isEnabled: true,
          assignments: [
            {
              workOrder: {
                id: "wo_act_2",
                status: "EN_REPARACION",
                vehicle: { licensePlate: "AF 999 ZZ", make: "Ford", model: "Ranger" },
              },
            },
          ],
        },
        {
          id: "bay_2",
          code: "B2",
          ordinal: 2,
          status: "LIBRE",
          isEnabled: true,
          assignments: [],
        },
        {
          id: "bay_3",
          code: "B3",
          ordinal: 3,
          status: "OCUPADA",
          isEnabled: true,
          assignments: [],
        },
        {
          id: "bay_4",
          code: "B4",
          ordinal: 4,
          status: "LIBRE",
          isEnabled: true,
          assignments: [],
        },
      ];

      const mockPrisma = {
        workOrder: {
          findMany: vi.fn().mockImplementation((args: { where: { status?: unknown } }) => {
            if (args.where.status === "ENTREGADO") {
              return Promise.resolve(deliveredOrdersMock);
            }
            if (args.where.status && typeof args.where.status === "object" && "notIn" in args.where.status) {
              return Promise.resolve(activeOrdersMock);
            }
            return Promise.resolve(ordersInPeriodMock);
          }),
        },
        bay: {
          findMany: vi.fn().mockResolvedValue(baysMock),
        },
      } as unknown as PrismaClient;

      const report = await getWorkshopTelemetry(mockPrisma, {
        workshopId: "ws_alpha",
        period: "month",
        now,
      });

      // Lead time: (47 + 24) / 2 = 35.5 hs -> 1.5 days
      expect(report.cycleTimes.avgLeadTimeHours).toBe(35.5);
      expect(report.cycleTimes.avgLeadTimeDays).toBe(1.5);
      // Repair time: (24 + 12) / 2 = 18 hs
      expect(report.cycleTimes.avgRepairTimeHours).toBe(18);
      // Diagnosis time: (4 + 2) / 2 = 3 hs
      expect(report.cycleTimes.avgDiagnosisTimeHours).toBe(3);
      expect(report.cycleTimes.deliveredOrdersCount).toBe(2);

      // Bay utilization: 2 of 4 = 50%
      expect(report.bays.totalBays).toBe(4);
      expect(report.bays.occupiedBays).toBe(2);
      expect(report.bays.freeBays).toBe(2);
      expect(report.bays.utilizationRate).toBe(50);

      // Budgets: 2 budgets, 1 approved -> 50%
      expect(report.budgets.totalBudgets).toBe(2);
      expect(report.budgets.approvedBudgets).toBe(1);
      expect(report.budgets.approvalRate).toBe(50);

      // Granular lines: 5 lines total, 3 approved -> 60%
      expect(report.budgets.laborLinesCount).toBe(3);
      expect(report.budgets.laborLinesApprovedCount).toBe(2);
      expect(report.budgets.partLinesCount).toBe(2);
      expect(report.budgets.partLinesApprovedCount).toBe(1);
      expect(report.budgets.lineApprovalRate).toBe(60);
      expect(report.budgets.totalApprovedAmount).toBe(120000);

      // Financials: delivered = 120000 + 80000 = 200000, WIP = 50000 + 150000 = 200000
      expect(report.financials.deliveredRevenue).toBe(200000);
      expect(report.financials.workInProgressEstimated).toBe(200000);
      expect(report.financials.totalRevenue).toBe(400000);
    });
  });
});
