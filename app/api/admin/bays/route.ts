/**
 * OS-CAR — GET /api/admin/bays
 * Estado del piso del taller: bahías habilitadas con su ocupación actual.
 */
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { vehicleLabel, formatOrderNumber } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin } = await requireAdmin();

    const bays = await db.bay.findMany({
      where: { workshopId: admin.workshopId, isEnabled: true },
      orderBy: { ordinal: "asc" },
      include: {
        assignments: {
          where: { releasedAt: null },
          include: {
            assignedBy: { select: { displayName: true } },
            workOrder: {
              include: {
                vehicle: true,
                workItems: { where: { status: { not: "CANCELADO" } }, select: { estimatedMinutes: true } },
              },
            },
          },
          orderBy: { assignedAt: "desc" },
          take: 1,
        },
      },
    });

    const now = Date.now();

    const items = bays.map((bay) => {
      const assignment = bay.assignments[0] ?? null;
      const order = assignment?.workOrder ?? null;
      return {
        id: bay.id,
        code: bay.code,
        ordinal: bay.ordinal,
        status: bay.status,
        current:
          assignment && order
            ? {
                orderId: order.id,
                orderNumber: formatOrderNumber(order.id),
                plate: order.vehicle.licensePlate,
                vehicle: vehicleLabel(order.vehicle),
                mechanic: assignment.assignedBy?.displayName ?? null,
                status: order.status,
                assignedAt: assignment.assignedAt.toISOString(),
                estimatedMinutes: order.workItems.reduce((acc, item) => acc + item.estimatedMinutes, 0),
                elapsedMinutes: Math.max(0, Math.floor((now - assignment.assignedAt.getTime()) / 60_000)),
              }
            : null,
      };
    });

    return ok({ bays: items });
  } catch (error) {
    return handleApiError(error);
  }
}
