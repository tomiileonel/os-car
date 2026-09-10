import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { toErrorEnvelope } from "@/shared/errors";
import { getWorkshopTelemetry } from "@/server/services/telemetry.service";

function failResponse(error: unknown, request: NextRequest): NextResponse {
  const requestId = resolveCorrelationId(request);
  const { status, body } = toErrorEnvelope(error, {
    requestId,
    instance: request.nextUrl.pathname,
  });
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "x-correlation-id": requestId,
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId } = await requireActiveAdminApi({
      roles: [
        "OWNER",
        "TALLER_SUPERVISOR",
        "ADMIN",
        "SUPER_ADMIN",
        "ADMIN_TALLER",
      ],
    });

    const periodParam = request.nextUrl.searchParams.get("period");
    const telemetry = await getWorkshopTelemetry(prisma, {
      workshopId,
      period: periodParam,
    });

    return NextResponse.json(
      {
        success: true,
        data: telemetry,
        meta: {
          requestId,
          period: telemetry.period,
          timestamp: new Date().toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "x-correlation-id": requestId,
        },
      },
    );
  } catch (error) {
    return failResponse(error, request);
  }
}
