export interface ProblemDetailsResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  timestamp: string;
  code?: string;
  errors?: Record<string, string[]>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ProblemType =
  | "VALIDATION_ERROR"
  | "DOMAIN_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "ENTITY_NOT_FOUND"
  | "OPTIMISTIC_LOCK_CONFLICT";

const ERROR_BASE_URL = "https://os-car.local/errors";

export function buildProblem(
  type: ProblemType,
  title: string,
  status: number,
  detail: string,
  instance?: string,
  extra?: Record<string, unknown>
): ProblemDetailsResponse {
  return {
    type: `${ERROR_BASE_URL}/${type}`,
    title,
    status,
    detail,
    timestamp: new Date().toISOString(),
    ...(instance ? { instance } : {}),
    ...extra,
  };
}

export class ProblemDetails extends Error {
  public readonly type: string;
  public readonly title: string;
  public readonly status: number;
  public readonly detail: string;
  public readonly instance?: string;
  public readonly timestamp: string;
  public readonly code?: string;
  public readonly errors?: Record<string, string[]>;
  public readonly metadata?: Record<string, unknown>;
  [key: string]: unknown;

  constructor(params: {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    code?: string;
    errors?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }) {
    super(params.detail);
    this.name = 'ProblemDetails';
    this.type = params.type;
    this.title = params.title;
    this.status = params.status;
    this.detail = params.detail;
    this.instance = params.instance;
    this.timestamp = new Date().toISOString();
    this.code = params.code;
    this.errors = params.errors;
    this.metadata = params.metadata;

    for (const [key, value] of Object.entries(params)) {
      if (!(key in this)) {
        this[key] = value;
      }
    }
  }

  toJSON(): ProblemDetailsResponse {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      timestamp: this.timestamp,
      code: this.code,
      errors: this.errors,
      metadata: this.metadata,
    };
  }
}
