import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TRACKING_TOKEN_BYTES = 32;
const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

function getTrackingSecret(): string {
  const secret =
    process.env.TRACKING_HMAC_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "test") {
      return "test-tracking-hmac-secret-at-least-32-chars-long";
    }
    throw new Error(
      "TRACKING_HMAC_SECRET environment variable is required but not set"
    );
  }
  return secret;
}

/**
 * Codifica un string o buffer en Base64URL (RFC 4648 §5)
 */
function toBase64URL(input: string | Buffer): string {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decodifica un string Base64URL a Buffer
 */
function fromBase64URL(input: string): Buffer {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4;
  const padded = padding ? base64 + "=".repeat(4 - padding) : base64;
  return Buffer.from(padded, "base64");
}

export interface TokenPayload {
  id: string;
  exp: number;
}

export interface VerifyResult {
  valid: boolean;
  workOrderId?: string;
  error?: string;
}

/**
 * Genera un token aleatorio seguro para intake público.
 */
export function createTrackingToken(): string {
  return randomBytes(TRACKING_TOKEN_BYTES).toString("base64url");
}

/**
 * Calcula el hash SHA256 del token para indexación / persistencia.
 */
export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Genera un token de tracking opaco con firma HMAC-SHA256.
 *
 * Estructura: payload.signature
 * - payload: Base64URL({ id, exp })
 * - signature: Base64URL(HMAC-SHA256(payload, TRACKING_HMAC_SECRET))
 *
 * El token tiene un TTL determinista de 30 días desde la fecha de creación.
 * No expone customerId ni información sensible.
 */
export function generateTrackingToken(
  workOrderId: string,
  createdAt: Date
): string {
  const secret = getTrackingSecret();
  const payload: TokenPayload = {
    id: workOrderId,
    exp: createdAt.getTime() + TTL_MS,
  };

  const payloadString = toBase64URL(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(payloadString)
    .digest();
  const signatureString = toBase64URL(signature);

  return `${payloadString}.${signatureString}`;
}

/**
 * Verifica la integridad y validez de un token de tracking.
 *
 * Fail-closed: rechaza sin consultar DB si:
 * - Token malformado (no contiene exactamente un ".")
 * - Firma HMAC inválida (timing attack resistant con timingSafeEqual)
 * - Token expirado (exp < Date.now())
 * - Payload no parseable como JSON válido
 */
export function verifyTrackingToken(token: string): VerifyResult {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, error: "INVALID_TOKEN_FORMAT" };
    }

    const parts = token.split(".");
    if (parts.length !== 2) {
      return { valid: false, error: "INVALID_TOKEN_FORMAT" };
    }

    const [payloadString, signatureString] = parts;

    let payload: TokenPayload;
    try {
      const payloadBuffer = fromBase64URL(payloadString);
      payload = JSON.parse(payloadBuffer.toString("utf-8"));
    } catch {
      return { valid: false, error: "INVALID_PAYLOAD_FORMAT" };
    }

    if (typeof payload.id !== "string" || typeof payload.exp !== "number") {
      return { valid: false, error: "INVALID_PAYLOAD_FIELDS" };
    }

    const secret = getTrackingSecret();
    const expectedSignature = createHmac("sha256", secret)
      .update(payloadString)
      .digest();
    const actualSignature = fromBase64URL(signatureString);

    if (expectedSignature.length !== actualSignature.length) {
      return { valid: false, error: "INVALID_SIGNATURE" };
    }

    if (!timingSafeEqual(expectedSignature, actualSignature)) {
      return { valid: false, error: "INVALID_SIGNATURE" };
    }

    const now = Date.now();
    if (payload.exp <= now) {
      return { valid: false, error: "TOKEN_EXPIRED" };
    }

    return { valid: true, workOrderId: payload.id };
  } catch {
    return { valid: false, error: "VERIFICATION_ERROR" };
  }
}
