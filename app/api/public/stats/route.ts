/**
 * OS-CAR — GET /api/public/stats
 * KPIs públicos para la landing del taller.
 */
import { db } from "@/lib/db";
import { ok, handleApiError } from "@/lib/server/http";
import { ORDER_IN_PROGRESS_STATUSES, round1 } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [baysTotal, baysOccupied, ordersInProgress, approvedVersions] = await Promise.all([
      db.bay.count({ where: { isEnabled: true } }),
      db.bayAssignment.count({ where: { releasedAt: null, bay: { isEnabled: true } } }),
      db.workOrder.count({ where: { status: { in: [...ORDER_IN_PROGRESS_STATUSES] } } }),
      db.budgetVersion.findMany({
        where: { status: "APROBADO", approvedAt: { not: null }, publishedAt: { not: null } },
        select: { publishedAt: true, approvedAt: true },
      }),
    ]);

    let avgApprovalHours: number | null = null;
    if (approvedVersions.length > 0) {
      const totalHours = approvedVersions.reduce((acc, version) => {
        const published = version.publishedAt as Date;
        const approved = version.approvedAt as Date;
        return acc + (approved.getTime() - published.getTime()) / 3_600_000;
      }, 0);
      avgApprovalHours = round1(totalHours / approvedVersions.length);
    }

    return ok({ baysTotal, baysOccupied, ordersInProgress, avgApprovalHours });
  } catch (error) {
    return handleApiError(error);
  }
}
