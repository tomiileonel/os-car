/**
 * OS-CAR · Gate G6 — api-client: inyección de correlationId, envelope de
 * éxito/error, fallos de red/abort y API tipada de vehículos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  apiFetch,
  buildVehiclesSearchQuery,
  vehiclesApi,
} from "@/lib/api-client";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SeenRequest {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api-client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function getSeenRequests(): SeenRequest[] {
    return fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      init: (init ?? {}) as RequestInit,
    }));
  }

  const seenRequests = {
    at(index: number) {
      return getSeenRequests().at(index);
    },
    get length() {
      return getSeenRequests().length;
    },
  };

  beforeEach(() => {
    fetchMock = vi.fn(async () => {
      return jsonResponse({ success: true, data: {}, meta: { requestId: "req-default" } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastHeaders(): Record<string, string> {
    const last = seenRequests.at(-1);
    expect(last).toBeDefined();
    return (last?.init.headers ?? {}) as Record<string, string>;
  }

  it("inyecta x-correlation-id generado (UUIDv4) y devuelve data + requestId", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { ok: 1 }, meta: { requestId: "req-1" } }),
    );

    const result = await apiFetch<{ ok: number }>("/api/vehicles");

    expect(result.data.ok).toBe(1);
    expect(result.requestId).toBe("req-1");
    expect(seenRequests.at(0)?.url).toBe("/api/vehicles");
    expect(lastHeaders()["x-correlation-id"]).toMatch(UUID_V4_PATTERN);
  });

  it("propaga un correlationId explícito sin generar uno nuevo", async () => {
    await apiFetch("/api/vehicles", { correlationId: "corr-manual-1" });
    expect(lastHeaders()["x-correlation-id"]).toBe("corr-manual-1");
  });

  it("GET no envía body ni content-type", async () => {
    await apiFetch("/api/vehicles");
    expect(lastHeaders()["content-type"]).toBeUndefined();
    expect(seenRequests.at(0)?.init.body).toBeUndefined();
  });

  it("POST serializa el cuerpo y agrega content-type", async () => {
    await apiFetch("/api/vehicles", { method: "POST", body: { a: 1 } });
    const request = seenRequests.at(0);
    expect(request?.init.method).toBe("POST");
    expect(request?.init.body).toBe(JSON.stringify({ a: 1 }));
    expect(lastHeaders()["content-type"]).toBe("application/json");
  });

  it("deserializa el envelope de error y lanza ApiClientError tipado (409)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: {
            code: "VEHICLE_DUPLICATE_PLATE",
            message: "La patente ya está registrada en este taller.",
            details: { fieldErrors: { licensePlate: ["duplicada"] } },
          },
          meta: { requestId: "req-9" },
        },
        409,
      ),
    );

    const promise = apiFetch("/api/vehicles", { method: "POST", body: {} });

    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    await expect(promise).rejects.toMatchObject({
      code: "VEHICLE_DUPLICATE_PLATE",
      status: 409,
      requestId: "req-9",
      message: "La patente ya está registrada en este taller.",
    });
  });

  it("respuesta no-2xx fuera de contrato => HTTP_<status>", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }, 500));
    await expect(apiFetch("/api/vehicles")).rejects.toMatchObject({
      code: "HTTP_500",
      status: 500,
    });
  });

  it("respuesta 2xx fuera de contrato => INVALID_ENVELOPE", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }, 200));
    await expect(apiFetch("/api/vehicles")).rejects.toMatchObject({
      code: "INVALID_ENVELOPE",
    });
  });

  it("cuerpo no JSON => INVALID_RESPONSE", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no-json", { status: 200 }));
    await expect(apiFetch("/api/vehicles")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("fallo de red => NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(apiFetch("/api/vehicles")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });

  it("solicitud abortada => REQUEST_ABORTED", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new Error("aborted"));

    await expect(apiFetch("/api/vehicles", { signal: controller.signal })).rejects.toMatchObject(
      { code: "REQUEST_ABORTED" },
    );
  });

  it("buildVehiclesSearchQuery compone y omite parámetros correctamente", () => {
    expect(buildVehiclesSearchQuery({})).toBe("");
    expect(buildVehiclesSearchQuery({ q: "   " })).toBe("");

    const query = buildVehiclesSearchQuery({ q: "abc 123", page: 2, pageSize: 10 });
    const params = new URLSearchParams(query.slice(1));
    expect(params.get("q")).toBe("abc 123");
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("10");
  });

  it("vehiclesApi.list construye la URL y propaga correlación", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { items: [], page: 1, pageSize: 8, total: 0 },
        meta: { requestId: "req-list" },
      }),
    );

    const result = await vehiclesApi.list(
      { q: "abc", page: 1, pageSize: 8 },
      { correlationId: "corr-list-1" },
    );

    expect(result.data.total).toBe(0);
    expect(result.requestId).toBe("req-list");
    expect(seenRequests.at(0)?.url).toBe("/api/vehicles?q=abc&page=1&pageSize=8");
    expect(lastHeaders()["x-correlation-id"]).toBe("corr-list-1");
  });

  it("vehiclesApi.create usa POST y serializa el input", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          success: true,
          data: {
            vehicle: {
              id: "veh_1",
              licensePlate: "ABC123",
              licensePlateNormalized: "ABC123",
              vin: null,
              make: null,
              model: null,
              modelYear: null,
              color: null,
              customerId: "cust_1",
              createdAt: "2026-09-03T12:00:00.000Z",
            },
          },
          meta: { requestId: "req-create" },
        },
        201,
      ),
    );

    const result = await vehiclesApi.create({ customerId: "cust_1", licensePlate: "ABC123" });

    expect(result.data.vehicle.id).toBe("veh_1");
    const request = seenRequests.at(0);
    expect(request?.url).toBe("/api/vehicles");
    expect(request?.init.method).toBe("POST");
    expect(request?.init.body).toBe(
      JSON.stringify({ customerId: "cust_1", licensePlate: "ABC123" }),
    );
    expect(lastHeaders()["content-type"]).toBe("application/json");
    expect(lastHeaders()["x-correlation-id"]).toMatch(UUID_V4_PATTERN);
  });
});
