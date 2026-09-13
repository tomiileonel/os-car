import { NextRequest, NextResponse } from "next/server";
import { registerAdmin } from "@/server/services/admin-register.service";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { toErrorEnvelope } from "@/shared/errors";

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
    const payload = await request.json();
    const result = await registerAdmin(payload);

    return NextResponse.json(
      { success: true, data: result, meta: { requestId } },
      { status: 201, headers: { "Cache-Control": "no-store", "x-correlation-id": requestId } }
    );
  } catch (error) {
    return failResponse(error, request);
  }
}

