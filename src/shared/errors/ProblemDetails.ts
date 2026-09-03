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

  constructor(params: {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance?: string;
    code?: string;
    errors?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
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
