/**
 * OS-CAR — GET /api/admin/mechanics
 * Mecánicos y supervisores activos (para asignar trabajos).
 */
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { admin } = await requireAdmin();

    const mechanics = await db.adminUser.findMany({
      where: { workshopId: admin.workshopId, active: true, role: { in: ["MECANICO", "TALLER_SUPERVISOR"] } },
      select: { id: true, displayName: true, role: true },
      orderBy: { displayName: "asc" },
    });

    return ok({ mechanics });
  } catch (error) {
    return handleApiError(error);
  }
}
