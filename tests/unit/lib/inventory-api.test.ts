import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inventoryApi, tireHotelApi } from "@/lib/api-client";

describe("inventoryApi and tireHotelApi contracts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inventoryApi.list propaga filtros y desempaqueta canonical envelope", async () => {
    const mockItems = [
      {
        id: "inv-1",
        sku: "ACE-1",
        description: "Aceite",
        stockQuantity: 5,
        reorderPoint: 2,
        category: "Aceites",
        unitCost: 100,
        unitPrice: 100,
        active: true,
        status: "NORMAL" as const,
      },
    ];

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: mockItems,
          meta: { requestId: "req-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const res = await inventoryApi.list({ critical: true, search: "ACE" });
    expect(res).toEqual(mockItems);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/inventory?search=ACE&critical=true"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-correlation-id": expect.any(String),
        }),
      }),
    );
  });

  it("tireHotelApi.checkIn envía datos tipados y recibe TireSetDto", async () => {
    const mockCreated = {
      id: "set-1",
      vehicleId: "veh-1",
      customerId: "cus-1",
      vehiclePlate: "AA000BB",
      vehicleLabel: "Toyota Corolla",
      customerName: "Pedro",
      customerPhone: "+54 11 2233-4455",
      brand: "Pirelli",
      size: "195/65 R15",
      dot: "DOT 1024",
      season: "VERANO" as const,
      status: "EN_CUSTODIA" as const,
      rack: "A",
      level: "1",
      position: "01",
      notes: null,
      checkInAt: "2026-09-02T10:00:00.000Z",
      checkOutAt: null,
      deliveredTo: null,
      minTreadDepthMm: 6.0,
      suggestReplacement: false,
      tires: [],
    };

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: mockCreated,
          meta: { requestId: "req-2" },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await tireHotelApi.checkIn({
      vehiclePlate: "AA000BB",
      customerName: "Pedro",
      brand: "Pirelli",
      size: "195/65 R15",
      rack: "A",
      level: "1",
      position: "01",
      tires: [],
    });

    expect(result.vehiclePlate).toBe("AA000BB");
  });
});

