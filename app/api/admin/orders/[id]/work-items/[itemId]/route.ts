/**
 * OS-CAR — PATCH /api/admin/orders/[id]/work-items/[itemId]
 * Actualiza el estado de un trabajo de la orden.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { WORK_ITEM_STATUSES } from "@/lib/server/domain";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(WORK_ITEM_STATUSES),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id, itemId } = await params;
    const body = await parseBody(request, patchSchema);

    const order = await db.workOrder.findFirst({ where: { id, workshopId: admin.workshopId }, select: { id: true } });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const item = await db.workItem.findFirst({
      where: { id: itemId, workOrderId: order.id },
      include: { assignedAdmin: { select: { displayName: true } } },
    });
    if (!item) {
      throw new HttpError(404, "WORK_ITEM_NOT_FOUND", "El trabajo no existe en esta orden.");
    }

    const data: Prisma.WorkItemUpdateInput = { status: body.status };
    if (body.status === "COMPLETADO" && item.actualMinutes === 0) {
      data.actualMinutes = item.estimatedMinutes;
    }

    const updated = await db.workItem.update({ where: { id: item.id }, data });

    return ok({
      item: {
        id: updated.id,
        description: updated.description,
        estimatedMinutes: updated.estimatedMinutes,
        actualMinutes: updated.actualMinutes,
        hourlyRateCharged: updated.hourlyRateCharged,
        internalCostAmount: updated.internalCostAmount,
        status: updated.status,
        isAdditional: updated.isAdditional,
        assignedAdminId: updated.assignedAdminId,
        assignedTo: item.assignedAdmin?.displayName ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
