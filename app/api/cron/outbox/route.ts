import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultOutboxHandlers, runWorkerOnce } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  const authBuffer = Buffer.from(authHeader);
  const expectedBuffer = Buffer.from(expectedHeader);

  if (
    authBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(authBuffer, expectedBuffer)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    ensureDefaultOutboxHandlers();
    const summary = await runWorkerOnce({ batchSize: 25, leaseMs: 60_000 });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("[CRON_OUTBOX_ERROR]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error running outbox worker" },
      { status: 500 }
    );
  }
}
