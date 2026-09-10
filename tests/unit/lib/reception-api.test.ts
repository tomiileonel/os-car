import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { receptionApi, ApiClientError } from "@/lib/api-client";
import type {
  FastVehicleLookupDto,
  ReceptionCheckInInput,
  ReceptionSummaryDto,
} from "@/lib/api-client";

describe("receptionApi contract and telemetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("lookupPlate", () => {
    it("propaga patente en query param y envía x-correlation-id incondicionalmente", async () => {
      const mockResult: FastVehicleLookupDto = {
        found: true,
        vehicle: {
          id: "veh_1",
          licensePlate: "AF 123 CD",
          licensePlateNormalized: "AF123CD",
          vehicleType: "AUTO",
          make: "Peugeot",
          model: "208",
          modelYear: 2022,
          color: "Gris",
          vin: "8A123",
        },
        customer: {
          id: "cus_1",
          fullName: "Juan Pérez",
          phoneE164: "+5491155443322",
          email: "juan@example.com",
          document: "31428990",
        },
        history: {
          previousOrdersCount: 4,
          lastServiceDate: "2023-11-18T10:00:00.000Z",
          lastServiceComplaint: "Cambio de pastillas",
          lastOdometer: 84000,
        },
        activeOrder: null,
      };

      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResult,
            meta: { requestId: "req-rec-1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await receptionApi.lookupPlate("af 123 cd");

      expect(result).toEqual(mockResult);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/reception?plate=AF%20123%20CD");
      expect(init.method).toBe("GET");

      const headers = init.headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBeTruthy();
      expect(headers["x-correlation-id"].length).toBeGreaterThan(10);
    });

    it("desempaqueta respuesta negativa cuando el vehículo no está registrado", async () => {
      const emptyResult: FastVehicleLookupDto = {
        found: false,
        vehicle: null,
        customer: null,
        history: null,
        activeOrder: null,
      };

      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: emptyResult,
            meta: { requestId: "req-rec-2" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await receptionApi.lookupPlate("ZZ999ZZ");
      expect(result.found).toBe(false);
      expect(result.vehicle).toBeNull();
    });
  });

  describe("registerReception", () => {
    it("envía payload JSON completo, inyecta correlation id y desempaqueta canonical envelope", async () => {
      const inputPayload: ReceptionCheckInInput = {
        licensePlate: "AF123CD",
        customerName: "Juan Pérez",
        customerPhone: "+5491155443322",
        customerDocument: "31428990",
        customerEmail: "juan@example.com",
        vehicleType: "AUTO",
        make: "Peugeot",
        model: "208",
        modelYear: 2022,
        color: "Gris Grafito",
        vin: "8A1230048ZJ9",
        odometerIn: 84250,
        fuelLevel: "MITAD",
        customerComplaint: "Service oficial de 80.000 km",
        intakeNotes: "Dejó llave y cédula verde",
        declaredBelongings: true,
        damages: [
          {
            zone: "FRENTE",
            damageType: "RAYON",
            xPercent: 25,
            yPercent: 30,
            note: "Rayón óptico",
          },
        ],
      };

      const summaryResponse: ReceptionSummaryDto = {
        workOrderId: "wo_rec_1",
        workOrderNumber: "OT-REC001",
        trackingToken: "tk_abc123",
        trackingUrl: "/seguimiento?token=tk_abc123",
        status: "INGRESADO",
        vehicleId: "veh_1",
        customerId: "cus_1",
        customerName: "Juan Pérez",
        licensePlate: "AF123CD",
        odometerIn: 84250,
        fuelLevel: "MITAD",
        assignedBay: null,
        createdAt: "2026-09-09T21:00:00.000Z",
      };

      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: summaryResponse,
            meta: { requestId: "req-rec-post-1" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await receptionApi.registerReception(inputPayload);

      expect(result).toEqual(summaryResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/reception");
      expect(init.method).toBe("POST");

      const parsedBody = JSON.parse(init.body as string);
      expect(parsedBody.licensePlate).toBe("AF123CD");
      expect(parsedBody.customerName).toBe("Juan Pérez");
      expect(parsedBody.odometerIn).toBe(84250);
      expect(parsedBody.damages).toHaveLength(1);

      const headers = init.headers as Record<string, string>;
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-correlation-id"]).toBeTruthy();
    });

    it("lanza ApiClientError con código de conflicto si el vehículo ya tiene una orden activa", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "ACTIVE_ORDER_EXISTS_FOR_VEHICLE",
              message: "El vehículo ya tiene una orden de trabajo activa en el taller.",
              details: { vehicleId: "veh_1" },
            },
            meta: { requestId: "req-conflict-1" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      );

      const inputPayload: ReceptionCheckInInput = {
        licensePlate: "AF123CD",
        customerName: "Juan Pérez",
        customerPhone: "+5491155443322",
        odometerIn: 84250,
        fuelLevel: "MITAD",
        customerComplaint: "Service oficial",
      };

      await expect(receptionApi.registerReception(inputPayload)).rejects.toThrow(ApiClientError);
    });
  });
});
