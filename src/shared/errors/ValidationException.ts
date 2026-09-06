import { DomainError } from "./DomainError";
import { type ProblemDetailsResponse } from "./ProblemDetails";

export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

export class ValidationException extends DomainError {
  public readonly issues?: readonly ValidationIssue[];

  constructor(
    codeOrIssues: string | ValidationIssue[] = "VALIDATION_FAILED",
    messageOrInstance = "La operación no cumple una regla de validación de dominio.",
    details?: Record<string, unknown>
  ) {
    if (Array.isArray(codeOrIssues)) {
      super("VALIDATION_ERROR", "El payload contiene uno o más campos inválidos.", 400, {
        issues: codeOrIssues,
        instance: messageOrInstance,
        ...details,
      });
      this.issues = codeOrIssues;
    } else {
      super(codeOrIssues, messageOrInstance, 422, details);
      if (details?.issues && Array.isArray(details.issues)) {
        this.issues = details.issues as ValidationIssue[];
      }
    }
  }

  get problem(): ProblemDetailsResponse & { issues?: readonly ValidationIssue[]; [key: string]: unknown } {
    return {
      type: "https://os-car.local/errors/VALIDATION_ERROR",
      title: "Validation Error",
      status: this.statusCode,
      detail: this.message,
      instance: typeof this.details?.instance === "string" ? this.details.instance : undefined,
      timestamp: new Date().toISOString(),
      issues: this.issues,
      ...this.details,
    };
  }
}
