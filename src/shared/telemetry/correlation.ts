/**
 * OS-CAR · Gate G5 — Correlación Edge-Safe (OT-G5-JOBS-TELEMETRY-001)
 * --------------------------------------------------------------------------
 * Módulo compartido por Edge Middleware, Edge routes y runtime Node.
 *
 * RESTRICCIÓN CRÍTICA de compuerta: este archivo NUNCA debe importar
 * 'node:crypto', 'node:fs' ni dependencias de terceros. Solo Web APIs.
 * El bundle de Edge Middleware tiene un límite estricto de <= 35.1 kB.
 */

/** Header canónico de correlación de punta a punta. */
export const CORRELATION_HEADER = "x-correlation-id" as const;

/**
 * Patrón de sanidad para correlation ids recibidos desde el exterior.
 * Evita inyectar caracteres de control, saltos de línea o tamaños
 * abusivos en logs y base de datos.
 */
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Interfaz mínima de `Headers` (Web API, disponible en Edge y Node 18+). */
export type HeadersLike = {
  get(name: string): string | null;
};

/** Interfaz mínima de `Request` (Web API). */
export type RequestLike = {
  headers: HeadersLike;
};

function isRequestLike(source: unknown): source is RequestLike {
  const headers = (source as RequestLike | null)?.headers;
  return typeof headers?.get === "function";
}

/**
 * Extrae el correlation id desde unos `Headers` o un `Request`.
 * Devuelve `null` si está ausente, vacío o contiene caracteres inválidos.
 */
export function getCorrelationId(source: HeadersLike | RequestLike): string | null {
  try {
    const headers: HeadersLike = isRequestLike(source) ? source.headers : source;
    const raw = headers.get(CORRELATION_HEADER);
    if (!raw) return null;
    const candidate = raw.trim();
    if (!CORRELATION_ID_PATTERN.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Genera un correlation id nuevo usando la Web API estándar
 * `crypto.randomUUID()` (Vercel Edge Runtime y Node.js >= 19),
 * sin módulos nativos. Un correlation id NO es un secreto: no
 * requiere CSPRNG, por lo que el fallback defensivo es aceptable.
 */
export function generateCorrelationId(): string {
  const webCrypto: Crypto | undefined = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const timePart = Date.now().toString(16);
  const randomPart = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `corr-${timePart}-${randomPart}`;
}

/**
 * Resuelve el correlation id de la petición entrante o genera uno nuevo.
 * Útil en middleware/helpers para garantizar trazabilidad sin romper
 * un id externo válido.
 */
export function resolveCorrelationId(source?: HeadersLike | RequestLike | null): string {
  if (source) {
    const existing = getCorrelationId(source);
    if (existing) return existing;
  }
  return generateCorrelationId();
}
