import type { NextRequest } from "next/server";

/**
 * Determina la IP de origen usando la jerarquía F-01/F-02.
 *
 * Las cabeceras de infraestructura sólo son confiables cuando el tráfico al
 * origen está completamente detrás del proveedor que las sanitiza. Para
 * X-Forwarded-For se toma la última entrada agregada por el reverse proxy
 * confiable; si no se puede determinar una IP, se usa un bucket explícito.
 */
export function clientIp(request: NextRequest): string {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp && vercelIp.length > 0) {
    return vercelIp.split(",")[0]?.trim() ?? "unresolved_ip";
  }

  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp && cloudflareIp.length > 0) {
    return cloudflareIp.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.length > 0) {
    return realIp.trim();
  }

  const hostIp = Reflect.get(request, "ip");
  if (typeof hostIp === "string" && hostIp.length > 0) {
    return hostIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1] ?? "unresolved_ip";
    }
  }

  return "unresolved_ip";
}
