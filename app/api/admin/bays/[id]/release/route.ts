/**
 * OS-CAR — POST /api/admin/bays/[id]/release
 * Libera la bahía cerrando su asignación activa.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";

const releaseSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, releaseSchema);

    const bay = await db.bay.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!bay) {
      throw new HttpError(404, "BAY_NOT_FOUND", "La bahía indicada no existe.");
    }

    const now = new Date();

    await db.$transaction(async (tx) => {
      const active = await tx.bayAssignment.findFirst({
        where: { bayId: bay.id, releasedAt: null },
        include: { workOrder: { select: { id: true, status: true } } },
      });
      if (!active) {
        throw new HttpError(409, "BAY_FREE", `La bahía ${bay.code} no tiene ninguna asignación activa.`);
      }

      await tx.bayAssignment.update({
        where: { id: active.id },
        data: { releasedAt: now, releaseReason: body.reason ?? "Liberada por el operador" },
      });
      await tx.bay.update({ where: { id: bay.id }, data: { status: "LIBRE" } });

      await tx.statusHistory.create({
        data: {
          workOrderId: active.workOrderId,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "BAHIA_LIBERADA",
          fromStatus: active.workOrder.status,
          toStatus: active.workOrder.status,
          publicDescription: `Vehículo retirado de bahía ${bay.code}`,
        },
      });
    });

    return ok({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
