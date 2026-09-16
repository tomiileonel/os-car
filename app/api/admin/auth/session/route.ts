/**
 * OS-CAR — GET /api/admin/auth/session
 * Sesión actual: { admin } o { admin: null } (null NO es error).
 */
import { ok, handleApiError } from "@/lib/server/http";
import { getSessionAdmin } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await getSessionAdmin();
    return ok({ admin: admin ? { id: admin.id, displayName: admin.displayName, role: admin.role } : null });
  } catch (error) {
    return handleApiError(error);
  }
}
