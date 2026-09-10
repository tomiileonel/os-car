import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "@/../app/api/work-orders/[id]/route";

const WORKSHOP_ALPHA = `ws-alpha-${Date.now()}`;
const WORKSHOP_BETA = `ws-beta-${Date.now()}`;

// Mockeamos la sesión para que actúe en nombre de WORKSHOP_ALPHA
vi.mock("@/server/auth/active-admin", () => ({
  requireActiveAdminApi: vi.fn().mockImplementation(async () => ({
    workshopId: WORKSHOP_ALPHA,
    adminUser: {
      id: `admin-alpha-${Date.now()}`,
      workshopId: WORKSHOP_ALPHA,
      displayName: "Operador Alpha",
      role: "ADMIN",
    },
  })),
}));

describe("G11 — Multi-Tenant Strict Isolation (Fail-Closed)", () => {
  let betaOrderId: string;
  let betaCustomerId: string;
  let betaVehicleId: string;

  beforeAll(async () => {
    // 1. Crear Workshop Alpha y Workshop Beta
    await prisma.workshop.createMany({
      data: [
        { id: WORKSHOP_ALPHA, name: "Taller Alpha", timezone: "America/Argentina/Buenos_Aires" },
        { id: WORKSHOP_BETA, name: "Taller Beta", timezone: "America/Argentina/Buenos_Aires" },
      ],
    });

    // 2. Crear recurso en Workshop Beta
    const betaCustomer = await prisma.customer.create({
      data: {
        workshopId: WORKSHOP_BETA,
        fullName: "Cliente Beta Exclusivo",
        phoneE164: "+5491133445566",
        phoneNormalized: "5491133445566",
      },
    });
    betaCustomerId = betaCustomer.id;

    const betaVehicle = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_BETA,
        customerId: betaCustomer.id,
        licensePlate: "BET 777 AR",
        licensePlateNormalized: "BET777AR",
        make: "Ford",
        model: "Focus",
        modelYear: 2021,
      },
    });
    betaVehicleId = betaVehicle.id;

    const betaOrder = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_BETA,
        customerId: betaCustomer.id,
        vehicleId: betaVehicle.id,
        status: "INGRESADO",
        version: 1,
        trackingCodeHash: `hash_beta_isolation_${Date.now()}`,
      },
    });
    betaOrderId = betaOrder.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.workOrder.deleteMany({ where: { workshopId: WORKSHOP_BETA } });
      await prisma.vehicle.deleteMany({ where: { id: betaVehicleId } });
      await prisma.customer.deleteMany({ where: { id: betaCustomerId } });
      await prisma.workshop.deleteMany({ where: { id: { in: [WORKSHOP_ALPHA, WORKSHOP_BETA] } } });
    } catch {
      // Ignorar errores de cleanup
    }
  });

  it("Alpha cannot READ Beta's work order (404 fail-closed, zero existence leak)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${betaOrderId}`);
    const res = await GET(req, { params: Promise.resolve({ id: betaOrderId }) });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("WORK_ORDER_NOT_FOUND");
    // No debe contener referencias al workshop_beta ni a datos del cliente beta
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(WORKSHOP_BETA);
    expect(serialized).not.toContain("Cliente Beta Exclusivo");
  });

  it("Alpha cannot MUTATE Beta's work order via transition (404 fail-closed)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${betaOrderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "transition",
        expectedVersion: 1,
        targetStatus: "DIAGNOSTICO",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: betaOrderId }) });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("WORK_ORDER_NOT_FOUND");

    // Verificar en DB que la orden de Beta no fue mutada
    const unchanged = await prisma.workOrder.findUnique({
      where: { id: betaOrderId },
      select: { status: true, version: true },
    });
    expect(unchanged?.status).toBe("INGRESADO");
    expect(unchanged?.version).toBe(1);
  });

  it("Alpha cannot ROTATE token of Beta's work order (404 fail-closed)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${betaOrderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "rotate-tracking-token",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: betaOrderId }) });

    expect(res.status).toBe(404);
  });
});
