import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "@/../app/api/tracking/[token]/route";
import { createTrackingToken, hashTrackingToken } from "@/lib/tracking-token";

const TEST_WORKSHOP_ID = `ws-track-san-${Date.now()}`;
const FORBIDDEN_PATTERNS = [
  "trackingCodeHash",
  "ipHash",
  "unitCost",
  "hourlyRateCost",
  "cancellationReason",
  "deletedAt",
];

describe("G11 — Public Tracking Payload Sanitization & Anti-Oracle (Zero Leakage)", () => {
  let validToken: string;
  let expiredToken: string;
  let deliveredToken: string;
  let validOrderId: string;
  let expiredOrderId: string;
  let deliveredOrderId: string;

  beforeAll(async () => {
    // 1. Setup Workshop, Customer, Vehicle
    await prisma.workshop.create({
      data: {
        id: TEST_WORKSHOP_ID,
        name: "Taller Sanitización Test",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });

    const customer = await prisma.customer.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        fullName: "Cliente Público",
        phoneE164: "+5491199887766",
        phoneNormalized: "5491199887766",
      },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "SAN 123 AR",
        licensePlateNormalized: "SAN123AR",
        make: "Chevrolet",
        model: "Cruze",
        modelYear: 2023,
      },
    });

    const vehicle2 = await prisma.vehicle.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "EXP 456 AR",
        licensePlateNormalized: "EXP456AR",
        make: "Peugeot",
        model: "208",
        modelYear: 2022,
      },
    });

    const vehicle3 = await prisma.vehicle.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "DEL 789 AR",
        licensePlateNormalized: "DEL789AR",
        make: "Renault",
        model: "Sandero",
        modelYear: 2021,
      },
    });

    // 2. Orden Activa Válida con Presupuesto
    validToken = createTrackingToken();
    const validOrder = await prisma.workOrder.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle.id,
        status: "EN_REPARACION",
        version: 1,
        trackingCodeHash: hashTrackingToken(validToken),
        trackingCodeIssuedAt: new Date(),
        budget: {
          create: {
            versions: {
              create: {
                versionNumber: 1,
                status: "PENDIENTE_APROBACION",
                subtotalLabor: 25000,
                subtotalParts: 15000,
                totalEstimated: 40000,
                laborLines: {
                  create: {
                    description: "Mano de obra frenos",
                    estimatedMinutes: 60,
                    hourlyRateCharged: 25000,
                    lineTotal: 25000,
                    isApproved: true,
                  },
                },
                partLines: {
                  create: {
                    description: "Pastillas de freno",
                    quantity: 1,
                    unitPriceCharged: 15000,
                    lineTotal: 15000,
                    isApproved: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    validOrderId = validOrder.id;

    // 3. Orden Expirada (emitida hace 32 días)
    expiredToken = createTrackingToken();
    const expiredDate = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    const expOrder = await prisma.workOrder.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle2.id,
        status: "EN_REPARACION",
        version: 1,
        trackingCodeHash: hashTrackingToken(expiredToken),
        trackingCodeIssuedAt: expiredDate,
      },
    });
    expiredOrderId = expOrder.id;

    // 4. Orden Cerrada (ENTREGADO)
    deliveredToken = createTrackingToken();
    const delOrder = await prisma.workOrder.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle3.id,
        status: "ENTREGADO",
        version: 2,
        trackingCodeHash: hashTrackingToken(deliveredToken),
        trackingCodeIssuedAt: new Date(),
      },
    });
    deliveredOrderId = delOrder.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.budgetLaborLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } } });
      await prisma.budgetPartLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } } });
      await prisma.budgetVersion.deleteMany({ where: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } });
      await prisma.budget.deleteMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } } });
      await prisma.workOrder.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.vehicle.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.customer.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.workshop.delete({ where: { id: TEST_WORKSHOP_ID } });
    } catch {
      // Teardown cleanup
    }
  });

  it("GET /api/tracking/[token] succeeds and never exposes internal forbidden fields", async () => {
    const req = new NextRequest(`http://localhost:3000/api/tracking/${validToken}`);
    const res = await GET(req, { params: Promise.resolve({ token: validToken }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.workOrderId).toBe(validOrderId);
    expect(body.data.status).toBe("EN_REPARACION");

    const serializedPayload = JSON.stringify(body);

    for (const forbidden of FORBIDDEN_PATTERNS) {
      expect(serializedPayload).not.toContain(`"${forbidden}"`);
    }

    // La patente debe estar enmascarada para privacidad
    expect(body.data.vehicle.licensePlateMasked).toBeDefined();
    expect(body.data.vehicle.licensePlateMasked).not.toBe("SAN 123 AR");
  });

  it("GET with expired token (> 30 days) returns 404 fail-closed without leaking details", async () => {
    const req = new NextRequest(`http://localhost:3000/api/tracking/${expiredToken}`);
    const res = await GET(req, { params: Promise.resolve({ token: expiredToken }) });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TRACKING_NOT_FOUND");
  });

  it("GET for ENTREGADO order returns 404 fail-closed (prevents state enumeration)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/tracking/${deliveredToken}`);
    const res = await GET(req, { params: Promise.resolve({ token: deliveredToken }) });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("TRACKING_NOT_FOUND");
  });
});
