import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "./src/lib/client-ip";
import { slidingWindowRateLimit } from "./src/lib/rate-limit";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface RateLimitRule {
  matcher: (path: string) => boolean;
  bucket: string;
  limit: number;
  windowMs: number;
}

const RULES: readonly RateLimitRule[] = [
  { matcher: (path) => path.startsWith("/api/auth/"), bucket: "auth", limit: 10, windowMs: FIFTEEN_MINUTES_MS },
  { matcher: (path) => path.startsWith("/api/public/"), bucket: "public", limit: 20, windowMs: FIFTEEN_MINUTES_MS },
  { matcher: (path) => path.startsWith("/api/v1/public/"), bucket: "public", limit: 20, windowMs: FIFTEEN_MINUTES_MS },
  { matcher: (path) => path === "/api/vehicles", bucket: "vehicles", limit: 30, windowMs: FIFTEEN_MINUTES_MS },
];

async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const rule = RULES.find((candidate) => candidate.matcher(path));

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (!rule) {
    return response;
  }

  const ip = clientIp(request);
  const hash = await sha256Hex(`${ip}|${process.env.NODE_ENV ?? "dev"}`);
  const key = `oscar:rl:${rule.bucket}:${hash}`;

  const decision = await slidingWindowRateLimit(key, rule.limit, rule.windowMs);
  
  response.headers.set("X-RateLimit-Limit", String(rule.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, decision.remaining)));

  if (!decision.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    response.headers.set("Retry-After", String(retryAfterSeconds));
    
    return NextResponse.json(
      {
        type: "https://oscar.tallerpro.dev/problems/rate-limited",
        title: "Too Many Requests",
        status: 429,
        detail: "Se superó el límite de solicitudes permitidas.",
        code: "RATE_LIMITED",
        instance: path,
        retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(rule.limit),
          "X-RateLimit-Remaining": "0",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }

  return response;
}

export default middleware;

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/api/public/:path*",
    "/api/v1/public/:path*",
    "/api/vehicles",
  ],
};
