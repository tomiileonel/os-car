import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET } from "@/../app/api/admin/telemetry/route";
import { UnauthorizedException } from "@/shared/errors";

const WORKSHOP_ALPHA = `ws-alpha-telem-${Date.now()}`;
const WORKSHOP_BETA = `ws-beta-telem-${Date.now()}`;

let activeWorkshopId = WORKSHOP_ALPHA;
let authShouldFail = false;

vi.mock("@/server/auth/active-admin", () => ({
  requireActiveAdminApi: vi.fn().mockImplementation(async () => {
    if (authShouldFail) {
      throw new UnauthorizedException("ADMIN_UNAUTHENTICATED", "Sesión requerida");
    }
    return {
      workshopId: activeWorkshopId,
      adminUser: {
        id: `admin-${activeWorkshopId}`,
        workshopId: activeWorkshopId,
        displayName: "Supervisor Telemetría",
        role: "TALLER_SUPERVISOR",
      },
    };
  }),
}));

describe("G11 — Suite de Telemetría Industrial API & Multi-Tenant Isolation", () => {
  let alphaOrderId: string;
  let betaOrderId: string;
  let alphaBayId: string;
  let betaBayId: string;

  beforeAll(async () => {
    // 1. Crear talleres Alpha y Beta
    await prisma.workshop.createMany({
      data: [
        { id: WORKSHOP_ALPHA, name: "Taller Alpha Telemetry", timezone: "America/Argentina/Buenos_Aires" },
        { id: WORKSHOP_BETA, name: "Taller Beta Telemetry", timezone: "America/Argentina/Buenos_Aires" },
      ],
    });

    // 2. Crear Clientes y Vehículos en Alpha y Beta
    const customerAlpha = await prisma.customer.create({
      data: {
        workshopId: WORKSHOP_ALPHA,
        fullName: "Cliente Alpha",
        phoneE164: "+5491111111111",
        phoneNormalized: "5491111111111",
      },
    });

    const vehicleAlpha = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_ALPHA,
        customerId: customerAlpha.id,
        licensePlate: "ALP 111 AR",
        licensePlateNormalized: "ALP111AR",
      },
    });

    const customerBeta = await prisma.customer.create({
      data: {
        workshopId: WORKSHOP_BETA,
        fullName: "Cliente Beta",
        phoneE164: "+5491122222222",
        phoneNormalized: "5491122222222",
      },
    });

    const vehicleBeta = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_BETA,
        customerId: customerBeta.id,
        licensePlate: "BET 222 AR",
        licensePlateNormalized: "BET222AR",
      },
    });

    // 3. Crear Órdenes de Trabajo en Alpha y Beta
    const orderAlpha = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_ALPHA,
        customerId: customerAlpha.id,
        vehicleId: vehicleAlpha.id,
        status: "EN_REPARACION",
        repairStartedAt: new Date(),
        trackingCodeHash: `hash_alpha_telem_${Date.now()}`,
        totalEstimated: 150000,
      },
    });
    alphaOrderId = orderAlpha.id;

    const orderBeta = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_BETA,
        customerId: customerBeta.id,
        vehicleId: vehicleBeta.id,
        status: "ENTREGADO",
        deliveredAt: new Date(),
        trackingCodeHash: `hash_beta_telem_${Date.now()}`,
        totalEstimated: 999999,
        totalFinal: 999999,
      },
    });
    betaOrderId = orderBeta.id;

    // 4. Crear Bahías en Alpha y Beta
    const bayAlpha = await prisma.bay.create({
      data: {
        workshopId: WORKSHOP_ALPHA,
        code: "BA-ALPHA-1",
        ordinal: 1,
        status: "OCUPADA",
        isEnabled: true,
      },
    });
    alphaBayId = bayAlpha.id;

    const bayBeta = await prisma.bay.create({
      data: {
        workshopId: WORKSHOP_BETA,
        code: "BA-BETA-1",
        ordinal: 1,
        status: "LIBRE",
        isEnabled: true,
      },
    });
    betaBayId = bayBeta.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.workOrder.deleteMany({ where: { id: { in: [alphaOrderId, betaOrderId] } } });
      await prisma.bay.deleteMany({ where: { id: { in: [alphaBayId, betaBayId] } } });
      await prisma.vehicle.deleteMany({ where: { workshopId: { in: [WORKSHOP_ALPHA, WORKSHOP_BETA] } } });
      await prisma.customer.deleteMany({ where: { workshopId: { in: [WORKSHOP_ALPHA, WORKSHOP_BETA] } } });
      await prisma.workshop.deleteMany({ where: { id: { in: [WORKSHOP_ALPHA, WORKSHOP_BETA] } } });
    } catch {
      // Ignorar errores de cleanup
    }
  });

  it("retorna 401 fail-closed cuando el request no está autenticado", async () => {
    authShouldFail = true;
    try {
      const req = new NextRequest("http://localhost:3000/api/admin/telemetry");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ADMIN_UNAUTHENTICATED");
    } finally {
      authShouldFail = false;
    }
  });

  it("garantiza aislamiento multi-tenant estricto: Alpha no ve órdenes ni bahías de Beta", async () => {
    activeWorkshopId = WORKSHOP_ALPHA;
    const req = new NextRequest("http://localhost:3000/api/admin/telemetry?period=month");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const envelope = (await res.json()) as {
      success: boolean;
      data: {
        workshopId: string;
        bays: { totalBays: number; bays: Array<{ code: string }> };
        fsmDistribution: { EN_REPARACION: number; ENTREGADO: number };
        financials: { deliveredRevenue: number; workInProgressEstimated: number };
      };
      meta: { period: string; requestId: string };
    };

    expect(envelope.success).toBe(true);
    expect(envelope.data.workshopId).toBe(WORKSHOP_ALPHA);
    expect(envelope.meta.period).toBe("month");
    expect(envelope.meta.requestId).toBeDefined();

    // Bahías: sólo la de Alpha, nunca la de Beta
    const bayCodes = envelope.data.bays.bays.map((b) => b.code);
    expect(bayCodes).toContain("BA-ALPHA-1");
    expect(bayCodes).not.toContain("BA-BETA-1");

    // Órdenes FSM: Alpha tiene 1 en EN_REPARACION, y 0 en ENTREGADO (la de ENTREGADO era de Beta)
    expect(envelope.data.fsmDistribution.EN_REPARACION).toBe(1);
    expect(envelope.data.fsmDistribution.ENTREGADO).toBe(0);

    // Financiero: no debe contener los $999.999 de Beta
    expect(envelope.data.financials.deliveredRevenue).toBe(0);
    expect(envelope.data.financials.workInProgressEstimated).toBe(150000);
  });

  it("admite selector de períodos (today, week, month, quarter) y fallback seguro", async () => {
    activeWorkshopId = WORKSHOP_ALPHA;

    for (const p of ["today", "week", "month", "quarter"]) {
      const req = new NextRequest(`http://localhost:3000/api/admin/telemetry?period=${p}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { meta: { period: string } };
      expect(json.meta.period).toBe(p);
    }

    // Fallback a month ante parámetro inválido
    const fallbackReq = new NextRequest("http://localhost:3000/api/admin/telemetry?period=año");
    const fallbackRes = await GET(fallbackReq);
    expect(fallbackRes.status).toBe(200);
    const fallbackJson = (await fallbackRes.json()) as { meta: { period: string } };
    expect(fallbackJson.meta.period).toBe("month");
  });
});
