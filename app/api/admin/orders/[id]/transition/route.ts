/**
 * OS-CAR — POST /api/admin/orders/[id]/transition
 * Cambio de estado del workflow con validación de transiciones y liberación de bahía.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { ORDER_STATUSES, ORDER_TRANSITIONS, TRANSITION_EVENTS, type OrderStatusValue } from "@/lib/server/domain";

export const runtime = "nodejs";

const transitionSchema = z.object({
  targetStatus: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

const PUBLIC_DESCRIPTIONS: Record<string, string> = {
  DIAGNOSTICO: "Diagnóstico iniciado",
  ESPERANDO_REPARACION: "Diagnóstico completado. Esperando reparación.",
  EN_REPARACION: "Reparación iniciada",
  CONTROL: "Control de calidad en curso",
  LISTO: "Vehículo listo para entrega",
  ENTREGADO: "Vehículo entregado al cliente",
  CANCELADA: "Orden cancelada",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, transitionSchema);

    const order = await db.workOrder.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const currentStatus = order.status as OrderStatusValue;
    const target = body.targetStatus;
    const allowed = ORDER_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(target)) {
      throw new HttpError(
        409,
        "INVALID_TRANSITION",
        `No se puede pasar de ${currentStatus} a ${target}. Transiciones válidas: ${allowed.length > 0 ? allowed.join(", ") : "ninguna"}.`,
      );
    }

    const now = new Date();
    const data: Prisma.WorkOrderUpdateInput = { status: target };

    if ((target === "DIAGNOSTICO" || target === "ESPERANDO_REPARACION") && !order.diagnosedAt) data.diagnosedAt = now;
    if (target === "EN_REPARACION" && !order.repairStartedAt) data.repairStartedAt = now;
    if (target === "CONTROL" && !order.qualityControlAt) data.qualityControlAt = now;
    if (target === "LISTO") {
      if (!order.readyAt) data.readyAt = now;
      if (Number(order.totalFinal) === 0) data.totalFinal = order.totalEstimated;
    }
    if (target === "ENTREGADO") {
      if (!order.deliveredAt) data.deliveredAt = now;
      if (Number(order.totalFinal) === 0) data.totalFinal = order.totalEstimated;
    }
    if (target === "CANCELADA") {
      if (!order.cancelledAt) data.cancelledAt = now;
      data.cancellationReason = body.reason ?? order.cancellationReason ?? "Sin especificar";
    }

    const eventType = TRANSITION_EVENTS[target];
    if (!eventType) {
      throw new HttpError(500, "INTERNAL_ERROR", "Evento de timeline no definido para el estado destino.");
    }

    const publicDescription =
      target === "CANCELADA" ? (body.reason ?? PUBLIC_DESCRIPTIONS.CANCELADA) : (PUBLIC_DESCRIPTIONS[target] ?? target);

    await db.$transaction(async (tx) => {
      await tx.workOrder.update({ where: { id: order.id }, data });

      // Liberar bahía al cerrar la orden
      if (target === "LISTO" || target === "ENTREGADO" || target === "CANCELADA") {
        const active = await tx.bayAssignment.findFirst({
          where: { workOrderId: order.id, releasedAt: null },
        });
        if (active) {
          await tx.bayAssignment.update({
            where: { id: active.id },
            data: {
              releasedAt: now,
              releaseReason:
                target === "CANCELADA" ? "Orden cancelada" : target === "LISTO" ? "Vehículo listo para entrega" : "Vehículo entregado",
            },
          });
          await tx.bay.update({ where: { id: active.bayId }, data: { status: "LIBRE" } });
        }
      }

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType,
          fromStatus: order.status,
          toStatus: target,
          publicDescription,
          internalDescription: body.reason ?? null,
        },
      });
    });

    return ok({ status: target });
  } catch (error) {
    return handleApiError(error);
  }
}
