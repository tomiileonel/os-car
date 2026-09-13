import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbConfigured = !!process.env.DATABASE_URL;
  const authSecretConfigured = !!process.env.BETTER_AUTH_SECRET;
  let dbConnected = false;
  let adminCount = -1;
  let errorMsg = null;

  try {
    const count = await prisma.adminUser.count();
    dbConnected = true;
    adminCount = count;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    status: "ok",
    env: {
      dbConfigured,
      authSecretConfigured,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    },
    db: {
      connected: dbConnected,
      adminCount,
      error: errorMsg,
    },
  });
}
