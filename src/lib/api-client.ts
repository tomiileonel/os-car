/**
 * OS-CAR · Gate G6 — Cliente HTTP tipado con telemetría (OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * - Inyecta SIEMPRE el header 'x-correlation-id' (generado con la Web API
 *   crypto.randomUUID() vía src/shared/telemetry/correlation.ts, Edge-Safe).
 * - Manejo estricto del envelope uniforme de la Especificación §27:
 *     éxito: { success: true,  data, meta: { requestId } }
 *     error: { success: false, error: { code, message, details }, meta: { requestId } }
 * - Cero dependencias nativas (fetch + Web Crypto), cero `any`.
 * - Este módulo se usa SOLO en cliente/edge liviano; nunca lo importa middleware.ts.
 */

import { CORRELATION_HEADER, generateCorrelationId } from "@/shared/telemetry/correlation";

/* -------------------------------------------------------------------------- */
/* Envelope y errores de contrato                                             */
/* -------------------------------------------------------------------------- */

export interface ApiResult<TData> {
  data: TData;
  requestId: string | null;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiClientErrorInit {
  code: string;
  message: string;
  status: number;
  requestId: string | null;
  details?: unknown;
}

/** Error tipado del contrato API: transporta code, status HTTP, requestId y details. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(init: ApiClientErrorInit) {
    super(init.message);
    this.name = "ApiClientError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractRequestId(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const meta = json.meta;
  if (!isRecord(meta)) return null;
  return typeof meta.requestId === "string" ? meta.requestId : null;
}

function isSuccessEnvelope(json: unknown): json is { success: true; data: unknown } {
  return isRecord(json) && json.success === true && "data" in json;
}

function isErrorEnvelope(json: unknown): json is { success: false; error: ApiErrorPayload } {
  if (!isRecord(json) || json.success !== false) return false;
  const error = json.error;
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

/* -------------------------------------------------------------------------- */
/* Fetcher universal                                                          */
/* -------------------------------------------------------------------------- */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: HttpMethod | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
  /** Correlation id explícito; si se omite, se genera uno nuevo (UUIDv4). */
  correlationId?: string | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Fetcher universal con envelope estricto.
 * Lanza `ApiClientError` ante cualquier desviación de contrato o de red.
 */
export async function apiFetch<TData>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<TData>> {
  const method = options.method ?? "GET";
  const correlationId = options.correlationId ?? generateCorrelationId();

  const headers: Record<string, string> = {
    accept: "application/json",
    [CORRELATION_HEADER]: correlationId,
    ...options.headers,
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    try {
      body = JSON.stringify(options.body);
    } catch {
      throw new ApiClientError({
        code: "INVALID_BODY",
        message: "No se pudo serializar el cuerpo de la solicitud.",
        status: 0,
        requestId: correlationId,
      });
    }
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body,
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch {
    if (options.signal?.aborted) {
      throw new ApiClientError({
        code: "REQUEST_ABORTED",
        message: "La solicitud fue cancelada.",
        status: 0,
        requestId: correlationId,
      });
    }
    throw new ApiClientError({
      code: "NETWORK_ERROR",
      message: "No se pudo contactar al servidor.",
      status: 0,
      requestId: correlationId,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiClientError({
      code: "INVALID_RESPONSE",
      message: "El servidor devolvió una respuesta no JSON.",
      status: response.status,
      requestId: correlationId,
    });
  }

  if (isSuccessEnvelope(json)) {
    return { data: json.data as TData, requestId: extractRequestId(json) };
  }

  if (isErrorEnvelope(json)) {
    throw new ApiClientError({
      code: json.error.code,
      message: json.error.message,
      status: response.status,
      requestId: extractRequestId(json),
      details: json.error.details,
    });
  }

  throw new ApiClientError({
    code: response.ok ? "INVALID_ENVELOPE" : `HTTP_${response.status}`,
    message: "Respuesta fuera de contrato.",
    status: response.status,
    requestId: extractRequestId(json),
  });
}

/* -------------------------------------------------------------------------- */
/* DTOs tipados de /api/vehicles (Gate G5)                                    */
/* -------------------------------------------------------------------------- */

export interface VehicleCustomerDTO {
  fullName: string;
}

export interface VehicleDTO {
  id: string;
  workshopId: string;
  customerId: string;
  licensePlate: string;
  licensePlateNormalized: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  customer: VehicleCustomerDTO;
}

export interface VehicleListData {
  items: VehicleDTO[];
  page: number;
  pageSize: number;
  total: number;
}

export interface VehicleCreatedDTO {
  id: string;
  licensePlate: string;
  licensePlateNormalized: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  color: string | null;
  customerId: string;
  createdAt: string;
}

export interface VehicleCreatedData {
  vehicle: VehicleCreatedDTO;
}

export interface VehicleSearchParams {
  q?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CreateVehicleInput {
  customerId: string;
  licensePlate: string;
  vin?: string | undefined;
  make?: string | undefined;
  model?: string | undefined;
  modelYear?: number | undefined;
  color?: string | undefined;
}

export interface ApiCallOptions {
  correlationId?: string | undefined;
  signal?: AbortSignal | undefined;
}

export function buildVehiclesSearchQuery(params: VehicleSearchParams): string {
  const search = new URLSearchParams();
  if (params.q !== undefined && params.q.trim().length > 0) {
    search.set("q", params.q.trim());
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    search.set("pageSize", String(params.pageSize));
  }
  const rendered = search.toString();
  return rendered.length > 0 ? `?${rendered}` : "";
}

/** API tipada de vehículos (GET/POST /api/vehicles). */
export const vehiclesApi = {
  list(
    params: VehicleSearchParams = {},
    callOptions: ApiCallOptions = {},
  ): Promise<ApiResult<VehicleListData>> {
    return apiFetch<VehicleListData>(`/api/vehicles${buildVehiclesSearchQuery(params)}`, {
      method: "GET",
      correlationId: callOptions.correlationId,
      signal: callOptions.signal,
    });
  },
  create(
    input: CreateVehicleInput,
    callOptions: ApiCallOptions = {},
  ): Promise<ApiResult<VehicleCreatedData>> {
    return apiFetch<VehicleCreatedData>("/api/vehicles", {
      method: "POST",
      body: input,
      correlationId: callOptions.correlationId,
      signal: callOptions.signal,
    });
  },
};
