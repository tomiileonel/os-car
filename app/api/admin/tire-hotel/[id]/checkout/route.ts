/**
 * OS-CAR — POST /api/admin/tire-hotel/[id]/checkout
 * Entrega de un set de neumáticos al cliente.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  deliveredTo: z.string().trim().min(2, "Indicá quién retira los neumáticos").max(120),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, checkoutSchema);

    const set = await db.tireSet.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!set) {
      throw new HttpError(404, "TIRE_SET_NOT_FOUND", "El set de neumáticos no existe.");
    }
    if (set.status === "ENTREGADO") {
      throw new HttpError(409, "TIRE_SET_DELIVERED", "Este set de neumáticos ya fue entregado.");
    }

    const updated = await db.tireSet.update({
      where: { id: set.id },
      data: { status: "ENTREGADO", checkOutAt: new Date(), deliveredTo: body.deliveredTo },
    });

    return ok({ status: updated.status, checkOutAt: updated.checkOutAt?.toISOString() ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
