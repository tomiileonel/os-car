/**
 * OS-CAR — Helpers HTTP del backend.
 * Envelope canónico: { success: true, data, meta: { requestId } }
 *                   | { success: false, error: { code, message, details? }, meta: { requestId } }
 */
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Respuesta exitosa con envelope y requestId único. */
export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data, meta: { requestId: randomUUID(), ...meta } });
}

/** Respuesta de error con envelope y requestId único. */
export function fail(status: number, code: string, message: string, details?: unknown): NextResponse {
  const error: Record<string, unknown> = { code, message };
  if (details !== undefined) error.details = details;
  return NextResponse.json({ success: false, error, meta: { requestId: randomUUID() } }, { status });
}

function zodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(raíz)",
    message: issue.message,
  }));
}

/** Lee y valida el body JSON de un request contra un schema zod. */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "El cuerpo de la petición no es un JSON válido.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, "VALIDATION_ERROR", "Revisá los datos enviados.", zodIssues(parsed.error));
  }
  return parsed.data;
}

/** Mapea cualquier error lanzado al envelope (HttpError, zod, Prisma, catch-all). */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return fail(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return fail(400, "VALIDATION_ERROR", "Revisá los datos enviados.", zodIssues(error));
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail(409, "CONFLICT", "Ya existe un registro con esos datos únicos. Verificá e intentá de nuevo.");
    }
    if (error.code === "P2025") {
      return fail(404, "NOT_FOUND", "El registro solicitado no existe o fue eliminado.");
    }
    if (error.code === "P2003") {
      return fail(409, "CONFLICT", "No se puede completar la operación porque hay referencias asociadas.");
    }
  }
  console.error("[oscar-api] Error no controlado:", error);
  return fail(500, "INTERNAL_ERROR", "Error interno del servidor. Intentá de nuevo en unos minutos.");
}
