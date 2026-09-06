import { ZodError } from "zod";
import { DomainError, isDomainError } from "./DomainError";

export { DomainError, isDomainError } from "./DomainError";
export { ValidationException, type ValidationIssue } from "./ValidationException";
export { DomainConflictException, type DomainConflictOptions, type DomainConflictErrorCode } from "./DomainConflictException";
export { ProblemDetails, type ProblemDetailsResponse, type ProblemType, buildProblem } from "./ProblemDetails";

export class BadRequestException extends DomainError {
  constructor(
    code = "BAD_REQUEST",
    message = "La solicitud es inválida.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 400, details);
  }
}

export class UnauthorizedException extends DomainError {
  constructor(code = "UNAUTHENTICATED", message = "Se requiere sesión válida.") {
    super(code, message, 401);
  }
}

export class ForbiddenException extends DomainError {
  constructor(
    code = "FORBIDDEN",
    message = "La sesión no posee la capacidad requerida.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 403, details);
  }
}

export class NotFoundException extends DomainError {
  constructor(
    code = "RESOURCE_NOT_FOUND",
    message = "El recurso no existe dentro del tenant.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 404, details);
  }
}

export class RateLimitException extends DomainError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "Límite de solicitudes superado.") {
    super("RATE_LIMITED", message, 429, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: { requestId: string };
}

export function toErrorEnvelope(
  error: unknown,
  context: { requestId: string; instance?: string }
): { status: number; body: ApiErrorBody } {
  if (isDomainError(error)) {
    const errorBody: ApiErrorBody["error"] = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      errorBody.details = error.details;
    }
    return {
      status: error.statusCode,
      body: { success: false, error: errorBody, meta: { requestId: context.requestId } },
    };
  }

  if (error instanceof ZodError) {
    const issues = error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Payload inválido.",
          details: { issues },
        },
        meta: { requestId: context.requestId },
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      body: {
        success: false,
        error: { code: "INVALID_JSON_BODY", message: "El cuerpo de la solicitud no es JSON válido." },
        meta: { requestId: context.requestId },
      },
    };
  }

  if ((error as { code?: string })?.code === "P2002") {
    return {
      status: 409,
      body: {
        success: false,
        error: { code: "CONFLICT", message: "Conflicto de unicidad en la base de datos." },
        meta: { requestId: context.requestId },
      },
    };
  }

  console.error(
    `[oscar] requestId=${context.requestId}`,
    error instanceof Error ? error.message : "unknown-error"
  );
  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: `Ocurrió un error interno. Referencia: ${context.requestId}`,
      },
      meta: { requestId: context.requestId },
    },
  };
}
