import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackingApi, ApiClientError } from "@/lib/api-client";
import type {
  PublicTrackingDto,
  BudgetDecisionInput,
  BudgetDecisionResultDto,
} from "@/lib/api-client";

describe("trackingApi contract and telemetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getPublicStatus", () => {
    it("obtiene el estado de tracking con x-correlation-id y desempaqueta el envelope", async () => {
      const mockTracking: PublicTrackingDto = {
        workOrderId: "wo_123",
        workOrderNumber: "OT-2026-0001",
        status: "DIAGNOSTICO",
        openedAt: "2026-09-10T10:00:00.000Z",
        vehicle: {
          make: "Toyota",
          model: "Corolla",
          modelYear: 2021,
          color: "Blanco",
          licensePlateMasked: "AE ••• CD",
        },
        workshop: {
          name: "OS-CAR Taller Mecánico",
          address: "Flor de Ceibo 11275, Barrio Itaembé Guazú",
          phone: "+54 9 376 435-3566",
          whatsapp: "5493764353566",
        },
        reception: {
          odometer: 45000,
          fuelLevel: "MEDIO",
          customerComplaint: "Ruido en tren delantero",
          declaredBelongings: false,
          damages: [],
        },
        timeline: [
          {
            status: "INGRESADO",
            title: "Recepción en Taller",
            description: "Vehículo recibido.",
            date: "2026-09-10T10:00:00.000Z",
            completed: true,
            current: false,
          },
        ],
        budget: null,
      };

      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: mockTracking,
            meta: { requestId: "req-track-1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await trackingApi.getPublicStatus("track-token-abc");

      expect(result).toEqual(mockTracking);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/tracking/track-token-abc");
      expect(init.method).toBe("GET");

      const headers = init.headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBeTruthy();
      expect(headers["x-correlation-id"].length).toBeGreaterThan(10);
    });

    it("escapa tokens con caracteres especiales", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {} as PublicTrackingDto,
            meta: { requestId: "req-track-2" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      await trackingApi.getPublicStatus("token con espacios/y#signos");
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/tracking/token%20con%20espacios%2Fy%23signos");
    });

    it("lanza ApiClientError ante un error 404 NOT_FOUND", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Orden de trabajo o token no encontrado.",
            },
            meta: { requestId: "req-track-404" },
          }),
          { status: 404, headers: { "content-type": "application/json" } },
        ),
      );

      await expect(trackingApi.getPublicStatus("token-invalido")).rejects.toMatchObject({
        name: "ApiClientError",
        status: 404,
        code: "NOT_FOUND",
        message: "Orden de trabajo o token no encontrado.",
      });
    });
  });

  describe("submitBudgetDecision", () => {
    it("envía decisión de presupuesto en POST con x-correlation-id", async () => {
      const input: BudgetDecisionInput = {
        decision: "APROBADO",
        approvedItemIds: ["labor_1", "part_1"],
        rejectedItemIds: ["part_2"],
        notes: "Proceder con la reparación urgente.",
      };

      const mockResponse: BudgetDecisionResultDto = {
        workOrderId: "wo_123",
        budgetVersionId: "bgt_1",
        decision: "APROBADO",
        newStatus: "EN_REPARACION",
        totalApprovedAmount: 85000,
        approvedItemsCount: 2,
        rejectedItemsCount: 1,
        decidedAt: "2026-09-10T12:00:00.000Z",
        message: "Decisión registrada exitosamente.",
      };

      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResponse,
            meta: { requestId: "req-app-1" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const result = await trackingApi.submitBudgetDecision("track-token-abc", input);

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/tracking/track-token-abc/approve");
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(input));

      const headers = init.headers as Record<string, string>;
      expect(headers["x-correlation-id"]).toBeTruthy();
    });

    it("maneja error 409 cuando el presupuesto ya no puede ser modificado", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "BUDGET_NOT_DECIDABLE",
              message: "El presupuesto ya ha sido decidido previamente.",
            },
            meta: { requestId: "req-app-409" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      );

      await expect(
        trackingApi.submitBudgetDecision("tok-1", { decision: "APROBADO" }),
      ).rejects.toMatchObject({
        name: "ApiClientError",
        status: 409,
        code: "BUDGET_NOT_DECIDABLE",
      });
    });
  });
});
