/**
 * OS-CAR — POST /api/admin/inventory/[id]/adjust
 * Ajuste de stock con movimiento AJUSTE (delta positivo o negativo, distinto de 0).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";

const adjustSchema = z.object({
  delta: z.coerce
    .number()
    .int("El ajuste debe ser un número entero")
    .refine((value) => value !== 0, "El ajuste debe ser distinto de cero"),
  note: z.string().trim().min(1).max(300).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, adjustSchema);

    const item = await db.inventoryItem.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!item) {
      throw new HttpError(404, "INVENTORY_ITEM_NOT_FOUND", "El artículo de inventario no existe.");
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { stockQuantity: Math.max(0, item.stockQuantity + body.delta) },
      });

      await tx.inventoryMovement.create({
        data: {
          workshopId: admin.workshopId,
          inventoryItemId: item.id,
          actorAdminId: admin.id,
          movementType: "AJUSTE",
          quantity: body.delta,
          note: body.note ?? "Ajuste manual de inventario",
        },
      });

      return next;
    });

    return ok({
      item: {
        id: updated.id,
        sku: updated.sku,
        description: updated.description,
        category: updated.category,
        location: updated.location,
        unitCost: Number(updated.unitCost),
        stockQuantity: updated.stockQuantity,
        reorderPoint: updated.reorderPoint,
        critical: updated.stockQuantity <= updated.reorderPoint,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
