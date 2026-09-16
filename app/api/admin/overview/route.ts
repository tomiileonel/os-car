/**
 * OS-CAR — GET /api/admin/overview
 * KPIs del panel: órdenes por estado, ingresos del día, bahías, stock, aprobaciones, ciclo, facturación.
 */
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { ORDER_STATUSES, startOfMonth, startOfToday, round1 } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin } = await requireAdmin();
    const workshopId = admin.workshopId;

    const [groups, todayIntakes, baysTotal, baysOccupied, inventory, pendingApprovals, finishedOrders, revenue] =
      await Promise.all([
        db.workOrder.groupBy({ by: ["status"], _count: { _all: true }, where: { workshopId } }),
        db.workOrder.count({ where: { workshopId, openedAt: { gte: startOfToday() } } }),
        db.bay.count({ where: { workshopId, isEnabled: true } }),
        db.bayAssignment.count({ where: { releasedAt: null, bay: { workshopId, isEnabled: true } } }),
        db.inventoryItem.findMany({
          where: { workshopId, active: true },
          select: { stockQuantity: true, reorderPoint: true },
        }),
        db.budgetVersion.count({ where: { status: "PENDIENTE_APROBACION", budget: { workOrder: { workshopId } } } }),
        db.workOrder.findMany({
          where: { workshopId, readyAt: { not: null } },
          select: { openedAt: true, readyAt: true },
        }),
        db.workOrder.aggregate({
          where: { workshopId, status: "ENTREGADO", deliveredAt: { gte: startOfMonth() } },
          _sum: { totalFinal: true },
        }),
      ]);

    const lowStockCount = inventory.filter((item) => item.stockQuantity <= item.reorderPoint).length;

    const ordersByStatus: Record<string, number> = {};
    for (const status of ORDER_STATUSES) ordersByStatus[status] = 0;
    for (const group of groups) ordersByStatus[group.status] = group._count._all;

    const avgCycleHours =
      finishedOrders.length > 0
        ? round1(
            finishedOrders.reduce((acc, order) => acc + ((order.readyAt as Date).getTime() - order.openedAt.getTime()) / 3_600_000, 0) /
              finishedOrders.length,
          )
        : null;

    return ok({
      ordersByStatus,
      todayIntakes,
      bayOccupancy: { total: baysTotal, occupied: baysOccupied },
      lowStockCount,
      pendingApprovals,
      avgCycleHours,
      revenueMTD: revenue._sum.totalFinal ?? 0,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
