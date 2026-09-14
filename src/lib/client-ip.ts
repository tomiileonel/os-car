import type { NextRequest } from "next/server";

/**
 * Determina la IP de origen usando la jerarquía F-01/F-02.
 *
 * Las cabeceras de infraestructura sólo son confiables cuando el tráfico al
 * origen está completamente detrás del proveedor que las sanitiza. Para
 * X-Forwarded-For se toma la última entrada agregada por el reverse proxy
 * confiable; si no se puede determinar una IP, se usa un bucket explícito.
 */
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^[0-9a-fA-F:]+$/;

function isValidIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const trimmed = ip.trim();
  if (trimmed.length < 7 || trimmed.length > 45) return false;
  return IPV4_REGEX.test(trimmed) || (trimmed.includes(":") && IPV6_REGEX.test(trimmed));
}

export function clientIp(request: NextRequest): string {
  // 1. Runtime IP directo (Vercel edge / serverless)
  const hostIp = Reflect.get(request, "ip");
  if (typeof hostIp === "string" && isValidIp(hostIp)) {
    return hostIp.trim();
  }

  // 2. Cabecera sanitizada por Vercel Edge (última entrada de la cadena)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp && vercelIp.length > 0) {
    const parts = vercelIp.split(",").map((p) => p.trim()).filter(Boolean);
    const candidate = parts[parts.length - 1];
    if (isValidIp(candidate)) return candidate;
  }

  // 3. Cloudflare connecting IP
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp && isValidIp(cloudflareIp)) {
    return cloudflareIp.trim();
  }

  // 4. X-Real-IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp)) {
    return realIp.trim();
  }

  // 5. X-Forwarded-For estándar (última entrada confiable de proxy)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      const candidate = parts[parts.length - 1];
      if (isValidIp(candidate)) return candidate;
    }
  }

  return "unresolved_ip";
}
