/**
 * OS-CAR — POST /api/admin/orders/[id]/part-items
 * Agrega un repuesto a la orden; si viene inventoryItemId valida stock,
 * descuenta y genera movimiento RESERVA.
 */
import { z } from "zod";
import type { InventoryItem } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { recalcOrderTotals, formatOrderNumber } from "@/lib/server/domain";

export const runtime = "nodejs";

const partItemSchema = z.object({
  description: z.string().trim().min(3, "Descripción demasiado corta").max(500),
  quantity: z.coerce.number().int("La cantidad debe ser entera").min(1, "La cantidad debe ser mayor a 0").max(999),
  unitCost: z.coerce.number().min(0).optional(),
  unitPriceCharged: z.coerce.number().min(0, "El precio no puede ser negativo"),
  partNumber: z.string().trim().min(1).max(60).optional(),
  inventoryItemId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;
    const body = await parseBody(request, partItemSchema);

    const order = await db.workOrder.findFirst({ where: { id, workshopId: admin.workshopId } });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const result = await db.$transaction(async (tx) => {
      let inventory: InventoryItem | null = null;
      if (body.inventoryItemId) {
        inventory = await tx.inventoryItem.findFirst({
          where: { id: body.inventoryItemId, workshopId: admin.workshopId },
        });
        if (!inventory) {
          throw new HttpError(404, "INVENTORY_ITEM_NOT_FOUND", "El artículo de inventario no existe.");
        }
        if (inventory.stockQuantity < body.quantity) {
          throw new HttpError(
            409,
            "INSUFFICIENT_STOCK",
            `Stock insuficiente de ${inventory.sku} (disponible: ${inventory.stockQuantity}, solicitado: ${body.quantity}).`,
          );
        }
      }

      const item = await tx.partItem.create({
        data: {
          workshopId: order.workshopId,
          workOrderId: order.id,
          inventoryItemId: inventory?.id ?? null,
          partNumber: body.partNumber ?? inventory?.sku ?? null,
          description: body.description,
          quantity: body.quantity,
          unitCost: body.unitCost ?? inventory?.unitCost ?? null,
          unitPriceCharged: body.unitPriceCharged,
          status: "SOLICITADO",
          isAdditional: false,
        },
      });

      if (inventory) {
        await tx.inventoryItem.update({
          where: { id: inventory.id },
          data: { stockQuantity: Math.max(0, inventory.stockQuantity - body.quantity) },
        });
        await tx.inventoryMovement.create({
          data: {
            workshopId: order.workshopId,
            inventoryItemId: inventory.id,
            partItemId: item.id,
            workOrderId: order.id,
            actorAdminId: admin.id,
            movementType: "RESERVA",
            quantity: -body.quantity,
            note: `Reserva para orden ${formatOrderNumber(order.id)}`,
          },
        });
      }

      const totals = await recalcOrderTotals(tx, order.id);

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "REPUESTO_SOLICITADO",
          toStatus: order.status,
          publicDescription: `Repuesto solicitado: ${body.description}`,
        },
      });

      return { item, totals };
    });

    return ok({
      item: {
        id: result.item.id,
        description: result.item.description,
        quantity: result.item.quantity,
        unitCost: result.item.unitCost ? Number(result.item.unitCost) : null,
        unitPriceCharged: Number(result.item.unitPriceCharged),
        status: result.item.status,
        partNumber: result.item.partNumber,
        inventoryItemId: result.item.inventoryItemId,
      },
      totals: result.totals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
