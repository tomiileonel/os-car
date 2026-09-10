import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST as receptionPost } from "@/../app/api/reception/route";
import { PATCH as workOrderPatch } from "@/../app/api/work-orders/[id]/route";
import { POST as approvePost } from "@/../app/api/tracking/[token]/approve/route";

const TEST_WORKSHOP_ID = `ws-crit-${Date.now()}`;
const TEST_ADMIN_ID = `admin-crit-${Date.now()}`;

vi.mock("@/server/auth/active-admin", () => ({
  requireActiveAdminApi: vi.fn().mockImplementation(async () => ({
    workshopId: TEST_WORKSHOP_ID,
    adminUser: {
      id: TEST_ADMIN_ID,
      workshopId: TEST_WORKSHOP_ID,
      displayName: "Supervisor Pruebas Críticas",
      role: "ADMIN",
    },
  })),
}));

describe("G11 — Critical Flows E2E (Real DB)", () => {
  let bayId: string;

  beforeAll(async () => {
    // 1. Setup Workshop and Admin
    await prisma.workshop.create({
      data: {
        id: TEST_WORKSHOP_ID,
        name: "Taller Flujos Críticos",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });

    await prisma.adminUser.create({
      data: {
        id: TEST_ADMIN_ID,
        workshopId: TEST_WORKSHOP_ID,
        authUserId: `auth-crit-${Date.now()}`,
        displayName: "Supervisor Pruebas Críticas",
        role: "ADMIN",
        active: true,
      },
    });

    // Bahía para asignación
    const bay = await prisma.bay.create({
      data: {
        workshopId: TEST_WORKSHOP_ID,
        code: "B-CRIT-1",
        ordinal: 1,
        status: "LIBRE",
      },
    });
    bayId = bay.id;
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.statusHistory.deleteMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } } });
      await prisma.budget.updateMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } }, data: { currentVersionId: null } });
      await prisma.budgetApproval.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } } });
      await prisma.budgetLaborLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } } });
      await prisma.budgetPartLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } } });
      await prisma.budgetVersion.deleteMany({ where: { budget: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } });
      await prisma.budget.deleteMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } } });
      await prisma.damageMark.deleteMany({ where: { intakeRecord: { workOrder: { workshopId: TEST_WORKSHOP_ID } } } });
      await prisma.intakeRecord.deleteMany({ where: { workOrder: { workshopId: TEST_WORKSHOP_ID } } });
      await prisma.workOrder.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.vehicle.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.customer.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.bay.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.adminUser.deleteMany({ where: { workshopId: TEST_WORKSHOP_ID } });
      await prisma.workshop.delete({ where: { id: TEST_WORKSHOP_ID } });
    } catch {
      // Ignorar errores de teardown
    }
  });

  describe("Flow A — Reception Express → FSM Progression (INGRESADO -> DIAGNOSTICO -> ESPERANDO_REPARACION)", () => {
    it("creates intake via reception, assigns bay, and transitions FSM correctly", async () => {
      // 1. POST /api/reception
      const receptionReq = new NextRequest("http://localhost:3000/api/reception", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: "Juan Gómez",
          customerPhone: "+5491133221100",
          licensePlate: "AE 789 CD",
          make: "Toyota",
          model: "Corolla",
          modelYear: 2022,
          odometerIn: 45000,
          fuelLevel: "MEDIO",
          customerComplaint: "Ruido metálico en rueda delantera",
          bayId,
        }),
      });

      const receptionRes = await receptionPost(receptionReq);
      expect(receptionRes.status).toBe(201);
      const receptionBody = await receptionRes.json();

      expect(receptionBody.success).toBe(true);
      const { workOrderId, trackingToken, trackingUrl } = receptionBody.data;
      expect(workOrderId).toBeDefined();

      // N7: Verificar que retorna el rawToken seguro en base64url (>= 32 chars) y la URL canónica
      expect(trackingToken).toBeDefined();
      expect(trackingToken.length).toBeGreaterThanOrEqual(32);
      expect(trackingUrl).toBe(`/tracking/${encodeURIComponent(trackingToken)}`);

      // 2. Transición FSM INGRESADO -> DIAGNOSTICO
      const diagReq = new NextRequest(`http://localhost:3000/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition",
          expectedVersion: 1,
          targetStatus: "DIAGNOSTICO",
        }),
      });
      const diagRes = await workOrderPatch(diagReq, { params: Promise.resolve({ id: workOrderId }) });
      expect(diagRes.status).toBe(200);
      const diagBody = await diagRes.json();
      expect(diagBody.data.status).toBe("DIAGNOSTICO");
      expect(diagBody.data.version).toBe(2);

      // 3. Transición FSM DIAGNOSTICO -> ESPERANDO_REPARACION
      const waitReq = new NextRequest(`http://localhost:3000/api/work-orders/${workOrderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "transition",
          expectedVersion: 2,
          targetStatus: "ESPERANDO_REPARACION",
        }),
      });
      const waitRes = await workOrderPatch(waitReq, { params: Promise.resolve({ id: workOrderId }) });
      expect(waitRes.status).toBe(200);
      const waitBody = await waitRes.json();
      expect(waitBody.data.status).toBe("ESPERANDO_REPARACION");
      expect(waitBody.data.version).toBe(3);
    });
  });

  describe("Flow B — Budget Generation → Public Approval (N2, N4, N6)", () => {
    it("handles granular approval, updates isApproved per line, hashes client IP, and advances to EN_REPARACION", async () => {
      // 1. Crear vehículo y orden en ESPERANDO_REPARACION
      const customer = await prisma.customer.create({
        data: {
          workshopId: TEST_WORKSHOP_ID,
          fullName: "Cliente Presupuesto",
          phoneE164: "+5491144556677",
          phoneNormalized: "5491144556677",
        },
      });

      const vehicle = await prisma.vehicle.create({
        data: {
          workshopId: TEST_WORKSHOP_ID,
          customerId: customer.id,
          licensePlate: "BUD 111 AR",
          licensePlateNormalized: "BUD111AR",
          make: "Peugeot",
          model: "208",
          modelYear: 2023,
        },
      });

      const { createTrackingToken, hashTrackingToken } = await import("@/lib/tracking-token");
      const rawToken = createTrackingToken();
      const tokenHash = hashTrackingToken(rawToken);

      const order = await prisma.workOrder.create({
        data: {
          workshopId: TEST_WORKSHOP_ID,
          customerId: customer.id,
          vehicleId: vehicle.id,
          status: "ESPERANDO_REPARACION",
          version: 1,
          trackingCodeHash: tokenHash,
          trackingCodeIssuedAt: new Date(),
        },
      });

      // Crear Presupuesto con 1 línea de mano de obra y 1 línea de repuesto
      const budget = await prisma.budget.create({
        data: {
          workOrderId: order.id,
          versions: {
            create: {
              versionNumber: 1,
              status: "PENDIENTE_APROBACION",
              subtotalLabor: 30000,
              subtotalParts: 20000,
              totalEstimated: 50000,
              laborLines: {
                create: {
                  description: "Cambio pastillas freno",
                  estimatedMinutes: 60,
                  hourlyRateCharged: 30000,
                  lineTotal: 30000,
                  isApproved: true,
                },
              },
              partLines: {
                create: {
                  description: "Juego de pastillas Bosch",
                  quantity: 1,
                  unitPriceCharged: 20000,
                  lineTotal: 20000,
                  isApproved: true,
                },
              },
            },
          },
        },
        include: { versions: { include: { laborLines: true, partLines: true } } },
      });

      const version = budget.versions[0];
      const laborLineId = version.laborLines[0].id;
      const partLineId = version.partLines[0].id;

      // 2. Aprobación Granular desde el Portal Público (Aprobar labor, Rechazar repuesto)
      // N4: Cliente con IP específica para validar hashing
      const clientIp = "181.44.20.15";
      const approveReq = new NextRequest(`http://localhost:3000/api/tracking/${rawToken}/approve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify({
          decision: "APROBADO",
          approvedItemIds: [laborLineId],
          rejectedItemIds: [partLineId],
        }),
      });

      const approveRes = await approvePost(approveReq, { params: Promise.resolve({ token: rawToken }) });
      expect(approveRes.status).toBe(200);
      const approveBody = await approveRes.json();
      expect(approveBody.success).toBe(true);

      // N6: Verificar persistencia granular de isApproved
      const updatedLabor = await prisma.budgetLaborLine.findUnique({ where: { id: laborLineId } });
      const updatedPart = await prisma.budgetPartLine.findUnique({ where: { id: partLineId } });

      expect(updatedLabor?.isApproved).toBe(true);
      expect(updatedPart?.isApproved).toBe(false);

      // N2: Verificar transición FSM a EN_REPARACION
      const updatedOrder = await prisma.workOrder.findUnique({
        where: { id: order.id },
        select: { status: true, version: true },
      });
      expect(updatedOrder?.status).toBe("EN_REPARACION");

      // N4: Verificar que StatusHistory tiene actorType CLIENTE y el hash SHA-256 de la IP en metadata
      const history = await prisma.statusHistory.findMany({
        where: { workOrderId: order.id, actorType: "CLIENTE" },
        orderBy: { createdAt: "desc" },
      });
      expect(history.length).toBeGreaterThan(0);
      const { createHash } = await import("node:crypto");
      const expectedIpHash = createHash("sha256").update(clientIp).digest("hex");
      const metadata = history[0].metadata as { ipHash?: string } | null;
      expect(metadata?.ipHash).toBe(expectedIpHash);
      expect(metadata?.ipHash).toHaveLength(64);

      // Verificar persistencia de ipHash en BudgetApproval
      const approvals = await prisma.budgetApproval.findMany({
        where: { budgetVersionId: version.id },
      });
      expect(approvals.length).toBeGreaterThan(0);
      expect(approvals[0].ipHash).toBe(expectedIpHash);
    });
  });
});
