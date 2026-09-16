/**
 * OS-CAR — POST /api/admin/orders/[id]/work-items
 * Agrega un trabajo (mano de obra) a la orden y recalcula totales.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { recalcOrderTotals } from "@/lib/server/domain";

export const runtime = "nodejs";

const workItemSchema = z.object({
  description: z.string().trim().min(3, "Descripción demasiado corta").max(500),
  estimatedMinutes: z.coerce.number().int("Los minutos deben ser enteros").min(1, "Los minutos deben ser mayores a 0").max(10080),
  hourlyRateCharged: z.coerce.number().min(0, "La tarifa no puede ser negativa"),
  assignedAdminId: z.string().trim().min(1).optional(),
  internalCostAmount: z.coerce.number().min(0, "El costo interno no puede ser negativo").optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, workItemSchema);

    const order = await db.workOrder.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    let assignee: { id: string; displayName: string } | null = null;
    if (body.assignedAdminId) {
      assignee = await db.adminUser.findFirst({
        where: { id: body.assignedAdminId, active: true },
        select: { id: true, displayName: true },
      });
      if (!assignee) {
        throw new HttpError(404, "ASSIGNED_ADMIN_NOT_FOUND", "El mecánico asignado no existe o está inactivo.");
      }
    }

    const result = await db.$transaction(async (tx) => {
      const item = await tx.workItem.create({
        data: {
          workshopId: order.workshopId,
          workOrderId: order.id,
          assignedAdminId: assignee?.id ?? null,
          description: body.description,
          estimatedMinutes: body.estimatedMinutes,
          hourlyRateCharged: body.hourlyRateCharged,
          internalCostAmount: body.internalCostAmount ?? null,
          status: "PENDIENTE",
          isAdditional: false,
        },
      });

      const totals = await recalcOrderTotals(tx, order.id);

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "TRABAJO_AGREGADO",
          toStatus: order.status,
          publicDescription: `Trabajo agregado: ${body.description}`,
        },
      });

      return { item, totals };
    });

    return ok({
      item: {
        id: result.item.id,
        description: result.item.description,
        estimatedMinutes: result.item.estimatedMinutes,
        actualMinutes: result.item.actualMinutes,
        hourlyRateCharged: Number(result.item.hourlyRateCharged),
        internalCostAmount: result.item.internalCostAmount ? Number(result.item.internalCostAmount) : null,
        status: result.item.status,
        isAdditional: result.item.isAdditional,
        assignedAdminId: result.item.assignedAdminId,
        assignedTo: assignee?.displayName ?? null,
      },
      totals: result.totals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
