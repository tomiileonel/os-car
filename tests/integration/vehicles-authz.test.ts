import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    vehicle: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
  },
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("~/lib/auth", () => ({
  auth: mocks.auth,
}));

import { GET, POST } from "~/app/api/vehicles/route";

const adminSession = {
  user: {
    id: "au_1",
    workshopId: "ws_1",
    name: "Ada Admin",
  },
};

const testCustomerId = "clh0000000000000000000000";

const vehicleRow = {
  id: "veh_1",
  workshopId: "ws_1",
  customerId: testCustomerId,
  licensePlate: "AB123CD",
  licensePlateNormalized: "AB123CD",
  vin: null,
  make: "Toyota",
  model: "Corolla",
  modelYear: 2020,
  color: "Gris",
  createdAt: new Date("2026-09-03T10:00:00Z"),
  updatedAt: new Date("2026-09-03T10:00:00Z"),
};

function buildRequest(method: "GET" | "POST", path: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/vehicles — segregación de contexto (G4/G7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.api.getSession.mockResolvedValue(null);
  });

  it("GET sin sesión responde 409 (DomainConflict fallback a error envelope)", async () => {
    const response = await GET(buildRequest("GET", "/api/vehicles"));
    expect(response.status).toBe(409);
  });

  it("GET filtra por workshopId de sesión e ignora parámetros no autorizados", async () => {
    mocks.auth.api.getSession.mockResolvedValue(adminSession);
    mocks.prisma.vehicle.findMany.mockResolvedValue([]);
    mocks.prisma.vehicle.count.mockResolvedValue(0);

    const response = await GET(buildRequest("GET", "/api/vehicles?workshopId=ws_evil&page=1"));

    expect(response.status).toBe(200);
    expect(mocks.prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workshopId: "ws_1", deletedAt: null }),
      })
    );
    const body: unknown = await response.json();
    expect(body).toMatchObject({ success: true, data: { items: [], total: 0 } });
    expect(body).toMatchObject({ meta: { requestId: expect.any(String) } });
  });

  it("POST con payload inválido responde 400 VALIDATION_FAILED", async () => {
    mocks.auth.api.getSession.mockResolvedValue(adminSession);
    const response = await POST(buildRequest("POST", "/api/vehicles", { licensePlate: "!!" }));
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_FAILED" } });
  });

  it("POST administrativo fuerza creación estándar sin source/approvalStatus", async () => {
    mocks.auth.api.getSession.mockResolvedValue(adminSession);
    mocks.prisma.customer.findFirst.mockResolvedValue({ id: testCustomerId });
    mocks.prisma.vehicle.findFirst.mockResolvedValue(null);
    mocks.prisma.vehicle.create.mockResolvedValue(vehicleRow);

    const response = await POST(
      buildRequest("POST", "/api/vehicles", { customerId: testCustomerId, licensePlate: "AB123CD" })
    );

    expect(response.status).toBe(201);
    expect(mocks.prisma.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ 
          workshopId: "ws_1",
          licensePlateNormalized: "AB123CD"
        }),
      })
    );
    const createArgs = mocks.prisma.vehicle.create.mock.calls[0][0];
    expect(createArgs.data).not.toHaveProperty("source");
    expect(createArgs.data).not.toHaveProperty("approvalStatus");
  });

  it("POST con patente duplicada responde 409 LICENSE_PLATE_EXISTS", async () => {
    mocks.auth.api.getSession.mockResolvedValue(adminSession);
    mocks.prisma.customer.findFirst.mockResolvedValue({ id: testCustomerId, workshopId: "ws_1" });
    mocks.prisma.vehicle.findFirst.mockResolvedValue({ id: "veh_9" });

    const response = await POST(
      buildRequest("POST", "/api/vehicles", { customerId: testCustomerId, licensePlate: "AB123CD" })
    );

    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: "LICENSE_PLATE_EXISTS" } });
    expect(mocks.prisma.vehicle.create).not.toHaveBeenCalled();
  });
});
