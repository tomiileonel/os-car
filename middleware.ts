import { NextRequest, NextResponse } from "next/server";
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

/**
 * Determinación jerárquica y segura de la dirección IP de origen (F-01 / F-02).
 *
 * JERARQUÍA DE CONFIANZA DE PROXY:
 * 1. Cabeceras gestionadas por CDN / Edge Hosting de primer orden (Vercel / Cloudflare / Nginx real-ip):
 *    - Inyectadas/sanitizadas por el proveedor perimetral, inmunes a spoofing de cliente directo.
 * 2. Socket directo de runtime (request.ip) provisto por el host.
 * 3. X-Forwarded-For:
 *    - En topologías con reverse proxy de borde configurado, se extrae la última IP no manipulable
 *      añadida por el reverse proxy confiable.
 * 4. Fallback 'unresolved_ip':
 *    - Cuando no es posible determinar la IP con certeza, se aísla en un bucket común dedicado ('unresolved_ip')
 *      para evitar agotar la cuota de clientes legítimos identificables.
 */
function clientIp(request: NextRequest): string {
  // 1. Cabeceras de infraestructura gestionadas (Vercel, Cloudflare, Nginx real-ip)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp && vercelIp.length > 0) return vercelIp.split(",")[0]?.trim() ?? "unresolved_ip";

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.length > 0) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.length > 0) return realIp.trim();

  // 2. IP de socket de Next.js (Edge/Node si está expuesta por el host)
  const hostIp = (request as unknown as { ip?: string }).ip;
  if (hostIp && hostIp.length > 0) return hostIp;

  // 3. X-Forwarded-For: en topología de proxy reverso confiable se preserva la IP agregada
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1] ?? "unresolved_ip";
    }
  }

  // 4. Política explícita para solicitudes sin IP determinable
  return "unresolved_ip";
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
    "/api/v1/public/:path*",
    "/api/vehicles",
  ],
};
