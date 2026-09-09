/**
 * api-client — typed fetch wrapper enforcing the canonical OS-CAR
 * response envelope and unconditional x-correlation-id propagation.
 *
 * Design decisions:
 * - ApiClientError carries both the HTTP status (for UI branching on
 *   400/403/409/etc.) and the envelope's business `code`/`details`
 *   (for message + telemetry). Collapsing to only one loses information
 *   the caller needs — a 409 with code VEHICLE_DUPLICATE_PLATE reads
 *   differently from a 409 idempotency-key conflict.
 * - Every request gets a fresh x-correlation-id via crypto.randomUUID()
 *   unless the caller explicitly supplies one (e.g. to correlate a
 *   retry with the original attempt). This is unconditional: it is set
 *   before any other headers merge, and callers cannot accidentally
 *   omit it.
 * - AbortSignal is a first-class parameter, not bolted on, so debounced
 *   search call sites can cancel stale requests without wrapping fetch
 *   themselves.
 * - No `any`: unknown JSON is narrowed through a runtime shape check
 *   before being treated as ApiSuccess<T> | ApiError.
 */

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: { requestId: string; page?: number; limit?: number; total?: number };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: { requestId: string };
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

/**
 * Thrown for both transport failures (network/abort) and envelope-level
 * business errors (success: false). `status` is 0 for transport-layer
 * failures where no HTTP response was received.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly cause?: unknown;

  constructor(params: {
    message: string;
    status: number;
    code: string;
    details?: unknown;
    requestId: string | null;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "ApiClientError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.cause = params.cause;
  }

  get isAbort(): boolean {
    return this.code === "REQUEST_ABORTED";
  }

  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR";
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
  correlationId?: string;
  headers?: Record<string, string>;
}

function createCorrelationId(): string {
  // crypto.randomUUID is available in browsers and Node 19+; both are
  // in scope for this app's supported runtimes (Node 20+ LTS per STACK.md).
  return crypto.randomUUID();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows an unknown parsed JSON body to ApiEnvelope<T> shape without
 * validating T's internal structure (callers own that contract via
 * the generic; this only checks the envelope discriminant + meta).
 */
function parseEnvelope<T>(json: unknown): ApiEnvelope<T> | null {
  if (!isPlainObject(json)) return null;
  if (typeof json.success !== "boolean") return null;

  if (json.success === true) {
    if (!isPlainObject(json.meta) || typeof json.meta.requestId !== "string") {
      return null;
    }
    if (!("data" in json)) return null;
    return json as unknown as ApiSuccessEnvelope<T>;
  }

  if (
    isPlainObject(json.error) &&
    typeof json.error.code === "string" &&
    typeof json.error.message === "string" &&
    isPlainObject(json.meta) &&
    typeof json.meta.requestId === "string"
  ) {
    return json as unknown as ApiErrorEnvelope;
  }

  return null;
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: ApiRequestOptions = {},
): Promise<T> {
  const correlationId = options.correlationId ?? createCorrelationId();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
    // Set last: x-correlation-id propagation is unconditional and must
    // not be overridable by a caller-supplied headers bag that happens
    // to also set it to something else.
    "x-correlation-id": correlationId,
  };

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      signal: options.signal ?? null,
    });
  } catch (cause) {
    const isAbort = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiClientError({
      message: isAbort ? "Request was aborted" : "Network request failed",
      status: 0,
      code: isAbort ? "REQUEST_ABORTED" : "NETWORK_ERROR",
      requestId: correlationId,
      cause,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new ApiClientError({
      message: "Response body was not valid JSON",
      status: response.status,
      code: "INVALID_RESPONSE_BODY",
      requestId: response.headers.get("x-correlation-id") ?? correlationId,
      cause,
    });
  }

  const envelope = parseEnvelope<T>(json);
  if (envelope === null) {
    throw new ApiClientError({
      message: "Response did not match the canonical API envelope",
      status: response.status,
      code: "MALFORMED_ENVELOPE",
      details: json,
      requestId: response.headers.get("x-correlation-id") ?? correlationId,
    });
  }

  if (envelope.success === false) {
    throw new ApiClientError({
      message: envelope.error.message,
      status: response.status,
      code: envelope.error.code,
      details: envelope.error.details,
      requestId: envelope.meta.requestId,
    });
  }

  return envelope.data;
}

// ---- Domain-scoped surface -------------------------------------------

export interface VehicleDto {
  id: string;
  licensePlateNormalized: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  customerId: string;
}

export interface CreateVehicleInput {
  customerName: string;
  phone: string;
  licensePlate: string;
  vin?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  customerComplaint: string;
  odometerAtIntake: number;
  fuelLevel: "VACIO" | "CUARTO" | "MITAD" | "TRES_CUARTOS" | "LLENO";
}

export interface ListVehiclesParams {
  search?: string;
}

export const vehiclesApi = {
  list(params: ListVehiclesParams = {}, options?: ApiRequestOptions): Promise<VehicleDto[]> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    return request<VehicleDto[]>(
      `/api/vehicles${qs ? `?${qs}` : ""}`,
      { method: "GET" },
      options,
    );
  },

  create(input: CreateVehicleInput, options?: ApiRequestOptions): Promise<VehicleDto> {
    return request<VehicleDto>(
      "/api/vehicles",
      { method: "POST", body: JSON.stringify(input) },
      options,
    );
  },
};

export const __internal = { parseEnvelope, createCorrelationId };
