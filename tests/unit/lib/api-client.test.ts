import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError, vehiclesApi, __internal } from "@/lib/api-client";
import type { VehicleDto } from "@/lib/api-client";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/**
 * Typed accessor for a fetch mock's Nth call, guarding against
 * noUncheckedIndexedAccess ("possibly undefined") without resorting
 * to non-null assertions — a genuinely missing call is a real test
 * bug and should fail loudly here rather than surface as a cryptic
 * downstream TypeError.
 */
function nthCall(mock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  const call = mock.mock.calls[index] as [string, RequestInit] | undefined;
  if (!call) {
    throw new Error(`Expected fetch mock to have a call at index ${index}, but it does not.`);
  }
  return call;
}

const sampleVehicle: VehicleDto = {
  id: "veh_1",
  licensePlateNormalized: "AB123CD",
  vin: null,
  make: "Ford",
  model: "Fiesta",
  modelYear: 2018,
  customerId: "cus_1",
};

describe("api-client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("x-correlation-id propagation", () => {
    it("attaches a generated x-correlation-id header on every request unconditionally", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );

      await vehiclesApi.list();

      const [, init] = nthCall(fetchMock, 0);
      const headers = init.headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBeTruthy();
      expect(typeof headers["x-correlation-id"]).toBe("string");
    });

    it("generates a distinct correlation id per call when not supplied", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );

      await vehiclesApi.list();
      await vehiclesApi.list();

      const first = nthCall(fetchMock, 0)[1].headers as Record<string, string>;
      const second = nthCall(fetchMock, 1)[1].headers as Record<string, string>;
      expect(first["x-correlation-id"]).not.toBe(second["x-correlation-id"]);
    });

    it("uses the caller-supplied correlationId when provided, instead of generating one", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );

      await vehiclesApi.list({}, { correlationId: "fixed-correlation-id" });

      const headers = nthCall(fetchMock, 0)[1].headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBe("fixed-correlation-id");
    });

    it("cannot be overridden by a caller-supplied headers bag (propagation is unconditional)", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );

      await vehiclesApi.list(
        {},
        { correlationId: "the-real-id", headers: { "x-correlation-id": "attempted-override" } },
      );

      const headers = nthCall(fetchMock, 0)[1].headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBe("the-real-id");
    });

    it("createCorrelationId produces RFC-4122-shaped UUIDs", () => {
      const id = __internal.createCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe("canonical envelope handling", () => {
    it("resolves with unwrapped data on success envelope", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );

      const result = await vehiclesApi.list();
      expect(result).toEqual([sampleVehicle]);
    });

    it("throws ApiClientError carrying status/code/details/requestId on error envelope", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          {
            success: false,
            error: { code: "VEHICLE_DUPLICATE_PLATE", message: "Patente ya registrada", details: { licensePlate: "AB123CD" } },
            meta: { requestId: "req_err_1" },
          },
          { status: 409 },
        ),
      );

      await expect(vehiclesApi.create({} as never)).rejects.toMatchObject({
        name: "ApiClientError",
        status: 409,
        code: "VEHICLE_DUPLICATE_PLATE",
        message: "Patente ya registrada",
        requestId: "req_err_1",
        details: { licensePlate: "AB123CD" },
      });
    });

    it("throws with code MALFORMED_ENVELOPE when the JSON body doesn't match the contract", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: "shape" }, { status: 200 }));

      await expect(vehiclesApi.list()).rejects.toMatchObject({
        code: "MALFORMED_ENVELOPE",
      });
    });

    it("throws with code INVALID_RESPONSE_BODY when the body is not JSON at all", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("not json{{{", { status: 200, headers: { "content-type": "text/plain" } }),
      );

      await expect(vehiclesApi.list()).rejects.toMatchObject({
        code: "INVALID_RESPONSE_BODY",
      });
    });
  });

  describe("network and abort handling", () => {
    it("wraps a rejected fetch (network failure) as ApiClientError with code NETWORK_ERROR and status 0", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(vehiclesApi.list()).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        status: 0,
      });
    });

    it("wraps an AbortError as ApiClientError with code REQUEST_ABORTED, exposed via isAbort", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      fetchMock.mockRejectedValueOnce(abortError);

      const controller = new AbortController();
      try {
        await vehiclesApi.list({}, { signal: controller.signal });
        expect.unreachable("expected rejection");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        expect((err as ApiClientError).isAbort).toBe(true);
        expect((err as ApiClientError).isNetworkError).toBe(false);
      }
    });

    it("passes the AbortSignal through to fetch so real cancellation propagates", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [sampleVehicle], meta: { requestId: "req_1" } }),
      );
      const controller = new AbortController();

      await vehiclesApi.list({}, { signal: controller.signal });

      const [, init] = nthCall(fetchMock, 0);
      expect(init.signal).toBe(controller.signal);
    });
  });

  describe("vehiclesApi surface", () => {
    it("list() builds a query string only when search is provided", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [], meta: { requestId: "r" } }),
      );
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: [], meta: { requestId: "r" } }),
      );

      await vehiclesApi.list();
      expect(nthCall(fetchMock, 0)[0]).toBe("/api/vehicles");

      await vehiclesApi.list({ search: "AB123CD" });
      expect(nthCall(fetchMock, 1)[0]).toBe("/api/vehicles?search=AB123CD");
    });

    it("create() POSTs a JSON-serialized body to /api/vehicles", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: true, data: sampleVehicle, meta: { requestId: "r" } }, { status: 201 }),
      );

      const input = {
        customerName: "Juan Pérez",
        phone: "+5493764123456",
        licensePlate: "AB123CD",
        customerComplaint: "Ruido en frenos",
        odometerAtIntake: 50000,
        fuelLevel: "MITAD" as const,
      };

      const result = await vehiclesApi.create(input);

      const [url, init] = nthCall(fetchMock, 0);
      expect(url).toBe("/api/vehicles");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(input);
      expect(result).toEqual(sampleVehicle);
    });
  });
});
