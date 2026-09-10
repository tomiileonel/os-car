import type { PrismaClient, BayStatus, OrderStatus } from "@prisma/client";

export type TelemetryPeriod = "today" | "week" | "month" | "quarter";

export interface FsmCycleTimeMetrics {
  avgLeadTimeHours: number;
  avgLeadTimeDays: number;
  avgRepairTimeHours: number;
  avgDiagnosisTimeHours: number;
  deliveredOrdersCount: number;
}

export interface BaySummaryItem {
  id: string;
  code: string;
  ordinal: number;
  status: BayStatus;
  isEnabled: boolean;
  activeWorkOrder?: {
    id: string;
    licensePlate: string;
    vehicleModel: string;
    status: OrderStatus;
  };
}

export interface BayUtilizationMetrics {
  totalBays: number;
  enabledBays: number;
  occupiedBays: number;
  freeBays: number;
  utilizationRate: number; // 0 - 100 percentage
  bays: BaySummaryItem[];
}

export interface BudgetTelemetryMetrics {
  totalBudgets: number;
  approvedBudgets: number;
  rejectedBudgets: number;
  pendingBudgets: number;
  approvalRate: number; // 0 - 100 percentage
  laborLinesCount: number;
  laborLinesApprovedCount: number;
  partLinesCount: number;
  partLinesApprovedCount: number;
  lineApprovalRate: number; // 0 - 100 percentage
  totalEstimatedAmount: number;
  totalApprovedAmount: number;
}

export interface FsmDistributionMetrics {
  INGRESADO: number;
  DIAGNOSTICO: number;
  ESPERANDO_REPARACION: number;
  EN_REPARACION: number;
  CONTROL: number;
  LISTO: number;
  ENTREGADO: number;
  CANCELADA: number;
  totalActive: number;
  totalInPeriod: number;
}

export interface FinancialThroughputMetrics {
  deliveredRevenue: number;
  workInProgressEstimated: number;
  totalRevenue: number;
}

export interface BottleneckItem {
  status: OrderStatus;
  count: number;
  oldestPendingHours: number;
}

export interface WorkshopTelemetryReport {
  workshopId: string;
  period: TelemetryPeriod;
  startDate: string;
  endDate: string;
  cycleTimes: FsmCycleTimeMetrics;
  bays: BayUtilizationMetrics;
  budgets: BudgetTelemetryMetrics;
  fsmDistribution: FsmDistributionMetrics;
  financials: FinancialThroughputMetrics;
  bottlenecks: BottleneckItem[];
}

export function parseTelemetryPeriod(raw?: string | null): TelemetryPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "quarter") {
    return raw;
  }
  return "month";
}

export function resolvePeriodDates(
  period: TelemetryPeriod,
  now: Date = new Date(),
): { startDate: Date; endDate: Date } {
  const endDate = new Date(now.getTime());
  let startDate: Date;

  switch (period) {
    case "today": {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      break;
    }
    case "week": {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    }
    case "month": {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    }
    case "quarter": {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    }
  }

  return { startDate, endDate };
}

function roundToOneDecimal(val: number): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return 0;
  return Math.round(val * 10) / 10;
}

function safePercentage(numerator: number, denominator: number): number {
  if (denominator <= 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

export async function getWorkshopTelemetry(
  db: PrismaClient,
  options: {
    workshopId: string;
    period?: string | null;
    now?: Date;
  },
): Promise<WorkshopTelemetryReport> {
  const { workshopId, now = new Date() } = options;
  const period = parseTelemetryPeriod(options.period);
  const { startDate, endDate } = resolvePeriodDates(period, now);

  // 1. Work orders opened within period
  const ordersInPeriod = await db.workOrder.findMany({
    where: {
      workshopId,
      deletedAt: null,
      openedAt: { gte: startDate, lte: endDate },
    },
    include: {
      vehicle: true,
      budget: {
        include: {
          currentVersion: {
            include: {
              laborLines: true,
              partLines: true,
            },
          },
        },
      },
    },
  });

  // 2. Work orders delivered (either delivered in period OR opened in period & delivered)
  const deliveredOrders = await db.workOrder.findMany({
    where: {
      workshopId,
      deletedAt: null,
      status: "ENTREGADO",
      OR: [
        { deliveredAt: { gte: startDate, lte: endDate } },
        { openedAt: { gte: startDate, lte: endDate } },
      ],
    },
  });

  // 3. Active work orders (floor load)
  const activeOrders = await db.workOrder.findMany({
    where: {
      workshopId,
      deletedAt: null,
      status: { notIn: ["ENTREGADO", "CANCELADA"] },
    },
    include: {
      vehicle: true,
    },
    orderBy: { openedAt: "asc" },
  });

  // 4. Cycle Times calculation
  let totalLeadTimeHours = 0;
  let leadTimeCount = 0;

  let totalRepairTimeHours = 0;
  let repairTimeCount = 0;

  let totalDiagTimeHours = 0;
  let diagTimeCount = 0;

  for (const o of deliveredOrders) {
    if (o.deliveredAt && o.openedAt) {
      const diffMs = o.deliveredAt.getTime() - o.openedAt.getTime();
      if (diffMs >= 0) {
        totalLeadTimeHours += diffMs / (1000 * 60 * 60);
        leadTimeCount++;
      }
    }
    if (o.readyAt && o.repairStartedAt) {
      const diffMs = o.readyAt.getTime() - o.repairStartedAt.getTime();
      if (diffMs >= 0) {
        totalRepairTimeHours += diffMs / (1000 * 60 * 60);
        repairTimeCount++;
      }
    }
    if (o.diagnosedAt && o.openedAt) {
      const diffMs = o.diagnosedAt.getTime() - o.openedAt.getTime();
      if (diffMs >= 0) {
        totalDiagTimeHours += diffMs / (1000 * 60 * 60);
        diagTimeCount++;
      }
    }
  }

  const avgLeadTimeHours = leadTimeCount > 0 ? roundToOneDecimal(totalLeadTimeHours / leadTimeCount) : 0;
  const avgLeadTimeDays = roundToOneDecimal(avgLeadTimeHours / 24);
  const avgRepairTimeHours = repairTimeCount > 0 ? roundToOneDecimal(totalRepairTimeHours / repairTimeCount) : 0;
  const avgDiagnosisTimeHours = diagTimeCount > 0 ? roundToOneDecimal(totalDiagTimeHours / diagTimeCount) : 0;

  // 5. Bays query & utilization
  const rawBays = await db.bay.findMany({
    where: { workshopId, deletedAt: null },
    orderBy: { ordinal: "asc" },
    include: {
      assignments: {
        where: { releasedAt: null },
        take: 1,
        orderBy: { assignedAt: "desc" },
        include: {
          workOrder: {
            include: {
              vehicle: true,
            },
          },
        },
      },
    },
  });

  const totalBays = rawBays.length;
  const enabledBays = rawBays.filter((b) => b.isEnabled).length;
  const bayItems: BaySummaryItem[] = rawBays.map((bay) => {
    const activeAssign = bay.assignments[0];
    const wo = activeAssign?.workOrder;
    const isOccupied = bay.status === "OCUPADA" || Boolean(wo);

    return {
      id: bay.id,
      code: bay.code,
      ordinal: bay.ordinal,
      status: (isOccupied ? "OCUPADA" : "LIBRE") as BayStatus,
      isEnabled: bay.isEnabled,
      activeWorkOrder: wo
        ? {
            id: wo.id,
            licensePlate: wo.vehicle?.licensePlate ?? "S/D",
            vehicleModel: [wo.vehicle?.make, wo.vehicle?.model].filter(Boolean).join(" ") || "S/D",
            status: wo.status,
          }
        : undefined,
    };
  });

  const occupiedBays = bayItems.filter((b) => b.status === "OCUPADA").length;
  const freeBays = Math.max(0, totalBays - occupiedBays);
  const utilizationRate = safePercentage(occupiedBays, totalBays);

  // 6. Budgets in period
  let totalBudgets = 0;
  let approvedBudgets = 0;
  let rejectedBudgets = 0;
  let pendingBudgets = 0;
  let laborLinesCount = 0;
  let laborLinesApprovedCount = 0;
  let partLinesCount = 0;
  let partLinesApprovedCount = 0;
  let totalEstimatedAmount = 0;
  let totalApprovedAmount = 0;

  for (const order of ordersInPeriod) {
    const currentVersion = order.budget?.currentVersion;
    if (!currentVersion) continue;

    totalBudgets++;
    const versionEstimated = Number(currentVersion.totalEstimated?.toString() ?? "0");
    totalEstimatedAmount += versionEstimated;

    if (currentVersion.status === "APROBADO") {
      approvedBudgets++;
    } else if (currentVersion.status === "RECHAZADO") {
      rejectedBudgets++;
    } else {
      pendingBudgets++;
    }

    // Granular lines
    for (const line of currentVersion.laborLines) {
      laborLinesCount++;
      const lineVal = Number(line.lineTotal?.toString() ?? "0");
      if (line.isApproved) {
        laborLinesApprovedCount++;
        totalApprovedAmount += lineVal;
      }
    }

    for (const line of currentVersion.partLines) {
      partLinesCount++;
      const lineVal = Number(line.lineTotal?.toString() ?? "0");
      if (line.isApproved) {
        partLinesApprovedCount++;
        totalApprovedAmount += lineVal;
      }
    }
  }

  const approvalRate = safePercentage(approvedBudgets, totalBudgets);
  const totalGranularLines = laborLinesCount + partLinesCount;
  const approvedGranularLines = laborLinesApprovedCount + partLinesApprovedCount;
  const lineApprovalRate = safePercentage(approvedGranularLines, totalGranularLines);

  // 7. FSM distribution
  const fsmDistribution: FsmDistributionMetrics = {
    INGRESADO: 0,
    DIAGNOSTICO: 0,
    ESPERANDO_REPARACION: 0,
    EN_REPARACION: 0,
    CONTROL: 0,
    LISTO: 0,
    ENTREGADO: 0,
    CANCELADA: 0,
    totalActive: activeOrders.length,
    totalInPeriod: ordersInPeriod.length,
  };

  for (const order of ordersInPeriod) {
    if (fsmDistribution[order.status] !== undefined) {
      fsmDistribution[order.status]++;
    }
  }

  // 8. Financials
  let deliveredRevenue = 0;
  for (const d of deliveredOrders) {
    const finalVal = Number(d.totalFinal?.toString() ?? "0");
    const estVal = Number(d.totalEstimated?.toString() ?? "0");
    deliveredRevenue += finalVal > 0 ? finalVal : estVal;
  }

  let workInProgressEstimated = 0;
  for (const a of activeOrders) {
    workInProgressEstimated += Number(a.totalEstimated?.toString() ?? "0");
  }

  const totalRevenue = deliveredRevenue + workInProgressEstimated;

  // 9. Bottlenecks (from active orders)
  const nonTerminalStatuses: OrderStatus[] = [
    "INGRESADO",
    "DIAGNOSTICO",
    "ESPERANDO_REPARACION",
    "EN_REPARACION",
    "CONTROL",
    "LISTO",
  ];

  const bottlenecks: BottleneckItem[] = nonTerminalStatuses.map((status) => {
    const matched = activeOrders.filter((o) => o.status === status);
    const count = matched.length;
    let oldestPendingHours = 0;
    if (matched.length > 0) {
      const oldestOrder = matched[0];
      const ageMs = now.getTime() - oldestOrder.openedAt.getTime();
      oldestPendingHours = Math.max(0, Math.round(ageMs / (1000 * 60 * 60)));
    }
    return { status, count, oldestPendingHours };
  }).sort((a, b) => b.count - a.count);

  return {
    workshopId,
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    cycleTimes: {
      avgLeadTimeHours,
      avgLeadTimeDays,
      avgRepairTimeHours,
      avgDiagnosisTimeHours,
      deliveredOrdersCount: deliveredOrders.length,
    },
    bays: {
      totalBays,
      enabledBays,
      occupiedBays,
      freeBays,
      utilizationRate,
      bays: bayItems,
    },
    budgets: {
      totalBudgets,
      approvedBudgets,
      rejectedBudgets,
      pendingBudgets,
      approvalRate,
      laborLinesCount,
      laborLinesApprovedCount,
      partLinesCount,
      partLinesApprovedCount,
      lineApprovalRate,
      totalEstimatedAmount: roundToOneDecimal(totalEstimatedAmount),
      totalApprovedAmount: roundToOneDecimal(totalApprovedAmount),
    },
    fsmDistribution,
    financials: {
      deliveredRevenue: roundToOneDecimal(deliveredRevenue),
      workInProgressEstimated: roundToOneDecimal(workInProgressEstimated),
      totalRevenue: roundToOneDecimal(totalRevenue),
    },
    bottlenecks,
  };
}
