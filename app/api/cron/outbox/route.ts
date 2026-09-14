import { NextRequest, NextResponse } from "next/server";
import { runWorkerOnce } from "@/server/jobs/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
