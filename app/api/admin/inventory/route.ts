/**
 * OS-CAR — GET /api/admin/inventory
 * Stock del taller con filtro q (sku/descripción) y categoría; críticos primero.
 */
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const category = (url.searchParams.get("category") ?? "").trim();

    const items = await db.inventoryItem.findMany({
      where: {
        workshopId: admin.workshopId,
        active: true,
        ...(category !== "" ? { category } : {}),
        ...(q !== ""
          ? { OR: [{ sku: { contains: q } }, { description: { contains: q } }] }
          : {}),
      },
      orderBy: { description: "asc" },
    });

    const mapped = items
      .map((item) => ({
        id: item.id,
        sku: item.sku,
        description: item.description,
        category: item.category,
        location: item.location,
        unitCost: Number(item.unitCost),
        stockQuantity: item.stockQuantity,
        reorderPoint: item.reorderPoint,
        critical: item.stockQuantity <= item.reorderPoint,
      }))
      .sort((a, b) => {
        if (a.critical !== b.critical) return a.critical ? -1 : 1;
        return a.description.localeCompare(b.description, "es");
      });

    return ok({ items: mapped });
  } catch (error) {
    return handleApiError(error);
  }
}
