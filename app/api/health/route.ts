import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
