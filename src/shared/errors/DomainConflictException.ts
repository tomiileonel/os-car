import { DomainError } from "./DomainError";

export type DomainConflictErrorCode =
  | "DOMAIN_CONFLICT"
  | "BUDGET_VERSION_SUPERSEDED"
  | "BUDGET_NOT_DECIDABLE"
  | "BLOCKED_TRANSITION"
  | "NO_ADMIN_ACTOR_AVAILABLE"
  | "INVALID_STATE_TRANSITION"
  | "VERSION_CONFLICT"
  | "LICENSE_PLATE_EXISTS"
  | "UNAUTHENTICATED"
  | "ORDER_TERMINAL_STATE"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "CONCURRENT_MODIFICATION";

export class DomainConflictException extends DomainError {
  constructor(
    code: DomainConflictErrorCode = "DOMAIN_CONFLICT",
    message = "La operación entra en conflicto con el estado actual del recurso.",
    details?: Record<string, unknown>
  ) {
    super(code, message, 409, details);
  }
}
