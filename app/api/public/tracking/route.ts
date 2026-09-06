import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { memoryLimiter } from "@/lib/rate-limit";
import { RateLimitException, toErrorEnvelope } from "@/shared/errors";
import { publicTrackingSchema } from "@/shared/schemas";
import { getPublicTrackingOrder } from "@/server/services/public-tracking.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const rateLimit = memoryLimiter.record(
    `public-tracking:${clientIp(request)}`,
    10,
    10 * 60 * 1000,
    Date.now()
  );

  if (!rateLimit.allowed) {
    const error = new RateLimitException(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)));
    const result = toErrorEnvelope(error, {
      requestId,
      instance: request.nextUrl.pathname,
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
      },
    });
  }

  try {
    const input = publicTrackingSchema.parse(await request.json());
    const data = await getPublicTrackingOrder(input.trackingToken);

    return NextResponse.json(
      { success: true, data, meta: { requestId } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const result = toErrorEnvelope(error, {
      requestId,
      instance: request.nextUrl.pathname,
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
