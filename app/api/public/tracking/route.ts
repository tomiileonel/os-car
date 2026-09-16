/**
 * OS-CAR — POST /api/public/tracking
 * Snapshot de seguimiento por código (mismo shape que GET /api/public/tracking/[code]).
 */
import { z } from "zod";
import { ok, handleApiError, parseBody } from "@/lib/server/http";
import { buildTrackingSnapshot } from "@/lib/server/tracking";

export const runtime = "nodejs";

const trackingSchema = z.object({
  code: z.string().trim().min(8, "Código de seguimiento inválido").max(64),
});

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, trackingSchema);
    const snapshot = await buildTrackingSnapshot(body.code);
    return ok(snapshot);
  } catch (error) {
    return handleApiError(error);
  }
}
