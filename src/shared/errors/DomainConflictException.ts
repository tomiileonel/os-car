import { DomainError } from "./DomainError";
import { type ProblemDetailsResponse, type ProblemType } from "./ProblemDetails";

export type DomainConflictErrorCode =
  | "DOMAIN_CONFLICT"
  | "BUDGET_VERSION_SUPERSEDED"
  | "BUDGET_NOT_DECIDABLE"
  | "BLOCKED_TRANSITION"
  | "NO_ADMIN_ACTOR_AVAILABLE"
  | "INVALID_STATE_TRANSITION"
  | "VERSION_CONFLICT"
  | "LICENSE_PLATE_EXISTS"
  | "ACTIVE_ORDER_EXISTS_FOR_VEHICLE"
  | "UNAUTHENTICATED"
  | "ORDER_TERMINAL_STATE"
  | "OPTIMISTIC_LOCK_CONFLICT"
  | "CONCURRENT_MODIFICATION";

export interface DomainConflictOptions {
  type: ProblemType;
  title: string;
  detail: string;
  instance?: string;
  extra?: Record<string, unknown>;
}

export class DomainConflictException extends DomainError {
  public readonly httpStatus: number;

  constructor(
    codeOrOptions: DomainConflictErrorCode | DomainConflictOptions = "DOMAIN_CONFLICT",
    messageOrHttpStatus?: string | number,
    detailsOrHttpStatus?: Record<string, unknown> | number,
    extraDetails?: Record<string, unknown>
  ) {
    if (typeof codeOrOptions === "object") {
      const status =
        typeof messageOrHttpStatus === "number"
          ? messageOrHttpStatus
          : typeof detailsOrHttpStatus === "number"
          ? detailsOrHttpStatus
          : 422;
      super(codeOrOptions.type, codeOrOptions.detail, status, {
        title: codeOrOptions.title,
        instance: codeOrOptions.instance,
        ...codeOrOptions.extra,
      });
      this.httpStatus = status;
    } else {
      const message =
        typeof messageOrHttpStatus === "string"
          ? messageOrHttpStatus
          : "La operación entra en conflicto con el estado actual del recurso.";
      const status = typeof detailsOrHttpStatus === "number" ? detailsOrHttpStatus : 409;
      const details = typeof detailsOrHttpStatus === "object" ? detailsOrHttpStatus : extraDetails;
      super(codeOrOptions, message, status, details);
      this.httpStatus = status;
    }
  }

  get problem(): ProblemDetailsResponse & { fromStatus?: string; toStatus?: string; [key: string]: unknown } {
    return {
      type: `https://os-car.local/errors/${this.code}`,
      title: typeof this.details?.title === "string" ? this.details.title : "Domain Conflict",
      status: this.httpStatus,
      detail: this.message,
      instance: typeof this.details?.instance === "string" ? this.details.instance : undefined,
      fromStatus: typeof this.details?.fromStatus === "string" ? this.details.fromStatus : undefined,
      toStatus: typeof this.details?.toStatus === "string" ? this.details.toStatus : undefined,
      timestamp: new Date().toISOString(),
      code: this.code,
      ...this.details,
    };
  }

  static invalidTransition(
    fromStatus: string,
    toStatus: string,
    detail: string,
    instance?: string
  ): DomainConflictException {
    const err = new DomainConflictException(
      {
        type: "INVALID_STATE_TRANSITION",
        title: "Invalid State Transition",
        detail,
        instance,
        extra: { fromStatus, toStatus },
      },
      422
    );
    return err;
  }
}
