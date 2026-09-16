/**
 * OS-CAR — POST /api/admin/bays/[id]/assign
 * Asigna una orden de trabajo a la bahía (reasignando si la orden ya ocupaba otra).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";

const assignSchema = z.object({
  workOrderId: z.string().trim().min(1, "Falta la orden de trabajo"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, assignSchema);

    const bay = await db.bay.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!bay) {
      throw new HttpError(404, "BAY_NOT_FOUND", "La bahía indicada no existe.");
    }
    if (!bay.isEnabled) {
      throw new HttpError(409, "BAY_DISABLED", "La bahía está deshabilitada.");
    }

    const activeOnBay = await db.bayAssignment.findFirst({
      where: { bayId: bay.id, releasedAt: null },
      select: { id: true },
    });
    if (activeOnBay) {
      throw new HttpError(409, "BAY_OCCUPIED", `La bahía ${bay.code} ya tiene un vehículo asignado.`);
    }

    const order = await db.workOrder.findFirst({ where: { id: body.workOrderId, workshopId: admin.workshopId } });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      // Si la orden ya estaba en otra bahía, se libera primero
      const previous = await tx.bayAssignment.findFirst({
        where: { workOrderId: order.id, releasedAt: null },
        include: { bay: true },
      });
      if (previous) {
        await tx.bayAssignment.update({
          where: { id: previous.id },
          data: { releasedAt: now, releaseReason: "Vehículo reasignado a otra bahía" },
        });
        await tx.bay.update({ where: { id: previous.bayId }, data: { status: "LIBRE" } });
        await tx.statusHistory.create({
          data: {
            workOrderId: order.id,
            actorType: "ADMIN",
            actorAdminId: admin.id,
            eventType: "BAHIA_REASIGNADA",
            fromStatus: order.status,
            toStatus: order.status,
            publicDescription: `Vehículo reasignado de bahía ${previous.bay.code} a bahía ${bay.code}`,
          },
        });
      }

      await tx.bayAssignment.create({
        data: { bayId: bay.id, workOrderId: order.id, assignedById: admin.id, assignedAt: now },
      });
      await tx.bay.update({ where: { id: bay.id }, data: { status: "OCUPADA" } });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "BAHIA_ASIGNADA",
          fromStatus: order.status,
          toStatus: order.status,
          publicDescription: `Vehículo asignado a bahía ${bay.code}`,
        },
      });
    });

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
