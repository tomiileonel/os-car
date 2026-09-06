import { NextRequest, NextResponse } from "next/server";
import { toErrorEnvelope } from "@/shared/errors";
import { publicIntakeSchema } from "@/shared/schemas";
import { registerPublicIntake } from "@/server/services/public-intake.service";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const input = publicIntakeSchema.parse(await request.json());
    const data = await registerPublicIntake(input);

    return NextResponse.json(
      { success: true, data, meta: { requestId } },
      { status: 201, headers: { "Cache-Control": "no-store" } }
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
