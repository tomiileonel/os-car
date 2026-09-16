/**
 * OS-CAR — GET /api/public/tracking/[code]
 * Snapshot de seguimiento por código: orden + timeline + presupuesto + bloqueos.
 */
import { ok, handleApiError } from "@/lib/server/http";
import { buildTrackingSnapshot } from "@/lib/server/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const snapshot = await buildTrackingSnapshot(decodeURIComponent(code));
    return ok(snapshot);
  } catch (error) {
    return handleApiError(error);
  }
}
