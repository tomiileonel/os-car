import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const handler = toNextJsHandler(auth);

export async function POST(req: NextRequest) {
  try {
    return await handler.POST(req);
  } catch (error) {
    console.error("[AUTH_API_POST_ERROR]", error);
    return NextResponse.json(
      {
        error: "Error interno del servicio de autenticación",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    return await handler.GET(req);
  } catch (error) {
    console.error("[AUTH_API_GET_ERROR]", error);
    return NextResponse.json(
      {
        error: "Error interno del servicio de autenticación",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

