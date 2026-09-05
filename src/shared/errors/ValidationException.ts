import { DomainError } from "./DomainError";

export class ValidationException extends DomainError {
  constructor(
    code = "VALIDATION_FAILED",
    message = "La operación no cumple una regla de validación de dominio.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 422, details);
  }
}
