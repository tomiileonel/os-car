import { DomainError } from "./DomainError";

export class DomainConflictException extends DomainError {
  constructor(
    code = "DOMAIN_CONFLICT",
    message = "La operación entra en conflicto con el estado actual del recurso.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 409, details);
  }
}
