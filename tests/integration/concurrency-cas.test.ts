import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PATCH } from "@/../app/api/work-orders/[id]/route";

const TEST_WORKSHOP_ID = `ws-cas-${Date.now()}`;
const TEST_ADMIN_ID = `admin-cas-${Date.now()}`;

vi.mock("@/server/auth/active-admin", () => ({
  requireActiveAdminApi: vi.fn().mockImplementation(async () => ({
    workshopId: TEST_WORKSHOP_ID,
    adminUser: {
      id: TEST_ADMIN_ID,
      workshopId: TEST_WORKSHOP_ID,
      displayName: "Auditor CAS Concurrencia",
      role: "ADMIN",
    },
  })),
}));

describe("G11 — Concurrency CAS on PATCH /api/work-orders/[id]", () => {
  let orderId: string;
  let customerId: string;
  let vehicleId: string;

  beforeAll(async () => {
    // 1. Crear fixtures en Neon PostgreSQL
    await prisma.workshop.create({
      data: {
        id: TEST_WORKSHOP_ID,
        name: "Taller CAS Concurrencia",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });

    await prisma.adminUser.create({
      data: {
        id: TEST_ADMIN_ID,
        workshopId: TEST_WORKSHOP_ID,
        authUserId: `auth-cas-${Date.now()}`,
        displayName: "Auditor CAS Concurrencia",
        role: "ADMIN",
        active: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        fullName: "Cliente CAS Stress",
        phoneE164: "+5491188776655",
        phoneNormalized: "5491188776655",
      },
    });
    customerId = customer.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "CAS 999 AR",
        licensePlateNormalized: "CAS999AR",
        make: "Toyota",
        model: "Corolla",
        modelYear: 2022,
      },
    });
    vehicleId = vehicle.id;

    const order = await prisma.workOrder.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle.id,
        status: "INGRESADO",
        version: 1,
        trackingCodeHash: `hash_cas_stress_${Date.now()}`,
      },
    });
    orderId = order.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.statusHistory.deleteMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } } });
      await prisma.workOrder.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.adminUser.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.workshop.delete({ where: { id: TEST_WORKSHOP_ID } });
    } catch {
      // Ignorar errores de cleanup en teardown
    }
  });

  it("exactly 1 of 50 concurrent CAS requests succeeds, 49 receive 409 CONCURRENT_MODIFICATION", async () => {
    const CONCURRENT_REQUESTS = 50;

    const settled = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, async (_, i) => {
        const req = new NextRequest(`http://localhost:3000/api/work-orders/${orderId}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": `cas-burst-${i}`,
          },
          body: JSON.stringify({
            action: "transition",
            expectedVersion: 1,
            targetStatus: "DIAGNOSTICO",
          }),
        });
        const res = await PATCH(req, { params: Promise.resolve({ id: orderId }) });
        const body = (await res.json()) as { success: boolean; error?: { code: string; title?: string } };
        return { status: res.status, body };
      }),
    );

    const fulfilled = settled.filter(
      (s): s is PromiseFulfilledResult<{ status: number; body: { success: boolean; error?: { code: string; title?: string } } }> =>
        s.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(CONCURRENT_REQUESTS);

    const results = fulfilled.map((f) => f.value);
    const successes = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter((r) => r.status !== 200 && r.status !== 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(CONCURRENT_REQUESTS - 1);
    expect(others).toHaveLength(0);

    for (const c of conflicts) {
      expect(c.body.success).toBe(false);
      expect(c.body.error?.code).toBe("CONCURRENT_MODIFICATION");
    }

    const finalOrder = await prisma.workOrder.findUnique({
      where: { id: orderId },
      select: { version: true, status: true },
    });
    expect(finalOrder?.version).toBe(2);
    expect(finalOrder?.status).toBe("DIAGNOSTICO");
  }, 60_000);
});
