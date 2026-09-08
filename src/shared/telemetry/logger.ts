/**
 * OS-CAR · Gate G5 — Logger estructurado Edge-Safe (OT-G5-JOBS-TELEMETRY-001)
 * --------------------------------------------------------------------------
 * Emite líneas JSON por stdout (debug/info) y stderr (warn/error).
 * Compatible con Vercel Edge Runtime y Node.js: SIN dependencias
 * nativas (node:*) ni de terceros.
 *
 * Esquema de línea:
 * { timestamp, level, service: 'os-car', correlationId?, workshopId?,
 *   actorId?, message, metadata?, error? }
 */

import { getCorrelationId, type HeadersLike, type RequestLike } from "./correlation";

export const SERVICE_NAME = "os-car" as const;

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Claves sensibles canónicas (task G5): 'password', 'token', 'secret',
 * 'authorization', 'cookie', 'apiKey', 'creditCard'. La comparación es
 * case-insensitive y tolera separadores ('access_token', 'SessionCookie'…).
 */
const SENSITIVE_KEY_TOKENS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "creditcard",
] as const;

const REDACTED = "[REDACTED]" as const;
const CIRCULAR = "[Circular]" as const;
const MAX_DEPTH = "[MaxDepth]" as const;
const MASK_DEPTH_LIMIT = 12;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_TOKENS.some((token) => normalized.includes(token));
}

/**
 * Enmascara recursivamente claves sensibles con '[REDACTED]'.
 * - NO muta el original (devuelve una copia segura para loguear).
 * - Tolera circulares, Date, BigInt, arrays, funciones y undefined.
 */
export function maskSensitiveData<T>(value: T): T {
  return maskInternal(value, 0, new WeakSet<object>()) as T;
}

function maskInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return value;
  if (type === "bigint") return (value as bigint).toString();
  if (type === "function") return "[Function]";
  if (value instanceof Date) return value.toISOString();

  if (depth >= MASK_DEPTH_LIMIT) return MAX_DEPTH;

  if (typeof value === "object") {
    const objectValue = value as object;
    if (seen.has(objectValue)) return CIRCULAR;
    seen.add(objectValue);

    if (Array.isArray(value)) {
      return value.map((item) => maskInternal(item, depth + 1, seen));
    }

    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : maskInternal(entry, depth + 1, seen);
    }
    return output;
  }

  return String(value);
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: unknown;
}

/** Convierte cualquier valor thrown a un objeto serializable estable. */
export function serializeError(error: unknown): SerializedError | undefined {
  if (error === undefined || error === null) return undefined;

  if (error instanceof Error) {
    const extended = error as Error & { code?: unknown; cause?: unknown };
    const serialized: SerializedError = {
      name: error.name,
      message: error.message,
    };
    if (typeof error.stack === "string") serialized.stack = error.stack;
    if (extended.code !== undefined) {
      serialized.code = typeof extended.code === "string" ? extended.code : String(extended.code);
    }
    if (extended.cause !== undefined) {
      serialized.cause = serializeError(extended.cause) ?? String(extended.cause);
    }
    return serialized;
  }

  const stringified = safeStringify(error);
  return {
    name: "NonErrorValue",
    message: stringified ?? String(error),
  };
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export interface LoggerContext {
  correlationId?: string;
  workshopId?: string;
  actorId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface LogExtras extends LoggerContext {
  metadata?: Record<string, unknown>;
  error?: unknown;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  service: string;
  correlationId?: string;
  workshopId?: string;
  actorId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: SerializedError;
}

export interface Logger {
  debug(message: string, extras?: LogExtras): void;
  info(message: string, extras?: LogExtras): void;
  warn(message: string, extras?: LogExtras): void;
  error(message: string, extras?: LogExtras): void;
  child(context: LoggerContext): Logger;
}

function currentLevel(): LogLevel {
  try {
    const raw = typeof process !== "undefined" ? process.env?.LOG_LEVEL : undefined;
    if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
      return raw;
    }
  } catch {
    // Runtime sin `process` accesible: usar default.
  }
  return "info";
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) output[key] = entry;
  }
  return output;
}

/**
 * Crea un logger estructurado con contexto base (p. ej. workshopId/actorId).
 * Nunca lanza: un fallo de serialización degrada a un registro mínimo.
 */
export function createLogger(context: LoggerContext = {}): Logger {
  function write(level: LogLevel, message: string, extras?: LogExtras): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentLevel()]) return;

    const merged: LogExtras = {
      ...context,
      ...(extras ? stripUndefined(extras as Record<string, unknown>) : {}),
    };
    const { correlationId, workshopId, actorId, service, metadata, error, ...rest } = merged;

    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      service: typeof service === "string" && service.length > 0 ? service : SERVICE_NAME,
      message,
    };

    if (correlationId !== undefined) record.correlationId = String(correlationId);
    if (workshopId !== undefined) record.workshopId = String(workshopId);
    if (actorId !== undefined) record.actorId = String(actorId);

    const mergedMetadata: Record<string, unknown> = { ...rest };
    if (metadata && typeof metadata === "object") {
      Object.assign(mergedMetadata, metadata);
    }
    if (Object.keys(mergedMetadata).length > 0) {
      record.metadata = maskSensitiveData(mergedMetadata);
    }

    if (error !== undefined) {
      // Primero serializar (Error -> objeto plano), luego enmascarar.
      const serialized = serializeError(error);
      if (serialized) record.error = maskSensitiveData(serialized);
    }

    const line =
      safeStringify(record) ??
      safeStringify({
        timestamp: record.timestamp,
        level,
        service: SERVICE_NAME,
        message: "UNSERIALIZABLE_LOG_RECORD",
      }) ??
      "";

    if (level === "warn" || level === "error") {
      console.error(line); // stderr
    } else {
      console.log(line); // stdout
    }
  }

  return {
    debug: (message, extras) => write("debug", message, extras),
    info: (message, extras) => write("info", message, extras),
    warn: (message, extras) => write("warn", message, extras),
    error: (message, extras) => write("error", message, extras),
    child: (childContext) => createLogger({ ...context, ...childContext }),
  };
}

/** Logger por defecto sin contexto. */
export const logger: Logger = createLogger();

/**
 * Logger con correlation id extraído de un Request/Headers.
 * Si el header es inválido o ausente, simplemente no se propaga.
 */
export function loggerFromRequest(source: HeadersLike | RequestLike, context: LoggerContext = {}): Logger {
  const correlationId = getCorrelationId(source);
  return createLogger({
    ...context,
    ...(correlationId ? { correlationId } : {}),
  });
}
