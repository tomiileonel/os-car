import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdminApi, isAllowedAdminRole } from "@/server/auth/active-admin";
import { inviteAdmin } from "@/server/services/admin-invite.service";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { toErrorEnvelope, ForbiddenException } from "@/shared/errors";

function failResponse(error: unknown, request: NextRequest): NextResponse {
  const requestId = resolveCorrelationId(request);
  const { status, body } = toErrorEnvelope(error, {
    requestId,
    instance: request.nextUrl.pathname,
  });
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "x-correlation-id": requestId },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { adminUser, workshopId } = await requireActiveAdminApi({
      roles: ["OWNER", "TALLER_SUPERVISOR"],
    });

    if (!isAllowedAdminRole(adminUser.role)) {
      throw new ForbiddenException(
        "INVALID_ACTOR_ROLE",
        "El rol del actor no es un rol canónico habilitado para invitar."
      );
    }

    const payload = await request.json();

    const result = await inviteAdmin(
      { adminId: adminUser.id, workshopId, role: adminUser.role },
      { ...payload, workshopId }
    );

    return NextResponse.json(
      { success: true, data: result, meta: { requestId } },
      { status: 201, headers: { "Cache-Control": "no-store", "x-correlation-id": requestId } }
    );
  } catch (error) {
    return failResponse(error, request);
  }
}
