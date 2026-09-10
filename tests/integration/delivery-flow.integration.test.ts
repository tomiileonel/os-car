import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PATCH, GET } from "@/../app/api/work-orders/[id]/route";

const WORKSHOP_ID = `ws-deliv-${Date.now()}`;
const ADMIN_ID = `admin-deliv-${Date.now()}`;

vi.mock("@/server/auth/active-admin", () => ({
  requireActiveAdminApi: vi.fn().mockImplementation(async () => ({
    workshopId: WORKSHOP_ID,
    adminUser: {
      id: ADMIN_ID,
      workshopId: WORKSHOP_ID,
      displayName: "Supervisor Entrega",
      role: "TALLER_SUPERVISOR",
    },
  })),
}));

describe("G12 — Flujo de Entrega Definitiva, Liberación de Bahías y Transactional Outbox", () => {
  let customerId: string;
  let vehicleId: string;
  let orderListoId: string;
  let orderControlId: string;
  let bayId: string;

  beforeAll(async () => {
    // 1. Crear Workshop y Admin
    await prisma.workshop.create({
      data: {
        id: WORKSHOP_ID,
        name: "Taller Delivery Checkout",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });

    await prisma.adminUser.create({
      data: {
        id: ADMIN_ID,
        workshopId: WORKSHOP_ID,
        authUserId: `auth-${ADMIN_ID}`,
        displayName: "Supervisor Entrega",
        role: "TALLER_SUPERVISOR",
      },
    });

    // 2. Crear Cliente y Vehículo
    const customer = await prisma.customer.create({
      data: {
        workshopId: WORKSHOP_ID,
        fullName: "Mariano López",
        phoneE164: "+5491144556677",
        phoneNormalized: "5491144556677",
      },
    });
    customerId = customer.id;

    const vehicle = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "AE 555 CD",
        licensePlateNormalized: "AE555CD",
        make: "Toyota",
        model: "Corolla",
        modelYear: 2022,
      },
    });
    vehicleId = vehicle.id;

    const vehicle2 = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId: customer.id,
        licensePlate: "AF 666 EF",
        licensePlateNormalized: "AF666EF",
        make: "Ford",
        model: "Focus",
        modelYear: 2021,
      },
    });

    // 3. Crear Bahía ocupada
    const bay = await prisma.bay.create({
      data: {
        workshopId: WORKSHOP_ID,
        code: "BAHIA-ELEVADOR-DELIV",
        ordinal: 99,
        status: "OCUPADA",
        isEnabled: true,
      },
    });
    bayId = bay.id;

    // 4. Crear Orden en LISTO con asignación de bahía e intakeRecord
    const orderListo = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle.id,
        status: "LISTO",
        version: 2,
        trackingCodeHash: `hash_ready_${Date.now()}`,
        openedAt: new Date(Date.now() - 48 * 3600 * 1000),
        readyAt: new Date(Date.now() - 2 * 3600 * 1000),
        totalEstimated: 120000,
        totalFinal: 120000,
        intakeRecord: {
          create: {
            odometerAtIntake: 60000,
            fuelLevel: "LLENO",
            customerComplaint: "Service preventivo 60.000 km",
          },
        },
        bayAssignments: {
          create: {
            bayId: bay.id,
            assignedById: ADMIN_ID,
          },
        },
      },
    });
    orderListoId = orderListo.id;

    // 5. Crear Orden en CONTROL para probar transición a LISTO con Outbox
    const orderControl = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId: customer.id,
        vehicleId: vehicle2.id,
        status: "CONTROL",
        version: 1,
        trackingCodeHash: `hash_control_${Date.now()}`,
        openedAt: new Date(Date.now() - 24 * 3600 * 1000),
        repairStartedAt: new Date(Date.now() - 12 * 3600 * 1000),
        totalEstimated: 85000,
        intakeRecord: {
          create: {
            odometerAtIntake: 45000,
            fuelLevel: "MITAD",
            customerComplaint: "Revisión frenos",
          },
        },
      },
    });
    orderControlId = orderControl.id;
  }, 35_000);

  afterAll(async () => {
    try {
      await prisma.outboxMessage.deleteMany({ where: { workshopId: WORKSHOP_ID } });
      await prisma.statusHistory.deleteMany({ where: { workOrder: { workshopId: WORKSHOP_ID } } });
      await prisma.deliveryRecord.deleteMany({ where: { workOrder: { workshopId: WORKSHOP_ID } } });
      await prisma.bayAssignment.deleteMany({ where: { bayId } });
      await prisma.bay.deleteMany({ where: { id: bayId } });
      await prisma.intakeRecord.deleteMany({ where: { workOrder: { workshopId: WORKSHOP_ID } } });
      await prisma.workOrder.deleteMany({ where: { workshopId: WORKSHOP_ID } });
      await prisma.vehicle.deleteMany({ where: { workshopId: WORKSHOP_ID } });
      await prisma.customer.deleteMany({ where: { workshopId: WORKSHOP_ID } });
      await prisma.adminUser.deleteMany({ where: { id: ADMIN_ID } });
      await prisma.workshop.deleteMany({ where: { id: WORKSHOP_ID } });
    } catch {
      // Ignorar errores de cleanup
    }
  });

  it("ciclo completo: entrega exitosa, liberación de bahía y emisión a Outbox", async () => {
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${orderListoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deliver",
        odometerAtDelivery: 60120,
        deliveredToName: "Mariano López",
        paymentMethod: "TRANSFERENCIA",
        notes: "Retiro conforme, service 60k completado",
        expectedVersion: 2,
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: orderListoId }) });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; data: { status: string; version: number } };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ENTREGADO");
    expect(body.data.version).toBe(3);

    // 1. Verificar persistencia de WorkOrder en DB
    const updatedOrder = await prisma.workOrder.findUnique({
      where: { id: orderListoId },
      include: { deliveryRecord: true },
    });
    expect(updatedOrder?.status).toBe("ENTREGADO");
    expect(updatedOrder?.version).toBe(3);
    expect(updatedOrder?.deliveredAt).not.toBeNull();
    expect(updatedOrder?.trackingCodeRevokedAt).not.toBeNull();

    // 2. Verificar DeliveryRecord
    expect(updatedOrder?.deliveryRecord).not.toBeNull();
    expect(updatedOrder?.deliveryRecord?.recipientName).toBe("Mariano López");
    expect(updatedOrder?.deliveryRecord?.odometerAtDelivery).toBe(60120);

    // 3. Verificar liberación atómica de bahía
    const bayInDb = await prisma.bay.findUnique({ where: { id: bayId } });
    expect(bayInDb?.status).toBe("LIBRE");

    const assignmentInDb = await prisma.bayAssignment.findFirst({
      where: { workOrderId: orderListoId },
    });
    expect(assignmentInDb?.releasedAt).not.toBeNull();
    expect(assignmentInDb?.releaseReason).toBe("ENTREGA");

    // 4. Verificar StatusHistory
    const statusHistoryEvents = await prisma.statusHistory.findMany({
      where: { workOrderId: orderListoId, eventType: "ENTREGA_REALIZADA" },
    });
    expect(statusHistoryEvents.length).toBeGreaterThan(0);
    expect(statusHistoryEvents[0].toStatus).toBe("ENTREGADO");

    // 5. Verificar mensaje transaccional en OutboxMessage
    const outboxMessages = await prisma.outboxMessage.findMany({
      where: { workshopId: WORKSHOP_ID, eventType: "WHATSAPP_DELIVERY_RECEIPT" },
    });
    expect(outboxMessages.length).toBeGreaterThan(0);
    expect(outboxMessages[0].status).toBe("PENDING");
  });

  it("rechaza re-entrega o modificación concurrente con 409 Conflict vía CAS", async () => {
    // Intentar entregar nuevamente con versión 2 (desactualizada) o estado ya ENTREGADO
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${orderListoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deliver",
        odometerAtDelivery: 60130,
        deliveredToName: "Mariano López",
        expectedVersion: 2,
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: orderListoId }) });
    expect(res.status).toBe(409);

    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(["INVALID_STATE_TRANSITION", "CONCURRENT_MODIFICATION", "VERSION_CONFLICT"]).toContain(
      body.error.code
    );
  });

  it("rechaza regresión de odómetro sin override (invariante A4 / chk_odometer)", async () => {
    const regVehicle = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId,
        licensePlate: `REG ${Date.now().toString().slice(-4)} AR`,
        licensePlateNormalized: `REG${Date.now().toString().slice(-4)}AR`,
      },
    });

    // Crear una orden temporal en LISTO para validar regresión
    const regOrder = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId,
        vehicleId: regVehicle.id,
        status: "LISTO",
        version: 1,
        trackingCodeHash: `hash_reg_${Date.now()}`,
        intakeRecord: {
          create: {
            odometerAtIntake: 75000,
            fuelLevel: "CUARTO",
            customerComplaint: "Chequeo general",
          },
        },
      },
    });

    try {
      const req = new NextRequest(`http://localhost:3000/api/work-orders/${regOrder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "deliver",
          odometerAtDelivery: 74500, // menor a 75000
          deliveredToName: "Cliente Regresión",
          expectedVersion: 1,
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: regOrder.id }) });
      expect([400, 409, 422]).toContain(res.status);

      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("ODOMETER_REGRESSION");
    } finally {
      await prisma.intakeRecord.deleteMany({ where: { workOrderId: regOrder.id } });
      await prisma.workOrder.deleteMany({ where: { id: regOrder.id } });
      await prisma.vehicle.deleteMany({ where: { id: regVehicle.id } });
    }
  });

  it("permite entrega con override de supervisor ante regresión justificada", async () => {
    const overrideVehicle = await prisma.vehicle.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId,
        licensePlate: `OVR ${Date.now().toString().slice(-4)} AR`,
        licensePlateNormalized: `OVR${Date.now().toString().slice(-4)}AR`,
      },
    });

    const overrideOrder = await prisma.workOrder.create({
      data: {
        workshopId: WORKSHOP_ID,
        customerId,
        vehicleId: overrideVehicle.id,
        status: "LISTO",
        version: 1,
        trackingCodeHash: `hash_ovr_${Date.now()}`,
        intakeRecord: {
          create: {
            odometerAtIntake: 85000,
            fuelLevel: "MITAD",
            customerComplaint: "Reemplazo de tablero",
          },
        },
      },
    });

    try {
      const req = new NextRequest(`http://localhost:3000/api/work-orders/${overrideOrder.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "deliver",
          odometerAtDelivery: 84200, // Menor a 85000, pero con override
          deliveredToName: "Cliente con Override",
          expectedVersion: 1,
          supervisorOverrideId: ADMIN_ID,
          supervisorNotes: "Sustitución de tablero de instrumentos por falla eléctrica documentada",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: overrideOrder.id }) });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { success: boolean; data: { status: string; version: number } };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ENTREGADO");
      expect(body.data.version).toBe(2);

      const orderInDb = await prisma.workOrder.findUnique({
        where: { id: overrideOrder.id },
        include: { deliveryRecord: true },
      });
      expect(orderInDb?.status).toBe("ENTREGADO");
      expect(orderInDb?.deliveryRecord?.supervisorOverrideId).toBe(ADMIN_ID);
      expect(orderInDb?.deliveryRecord?.supervisorNotes).toContain("Sustitución de tablero");

      const history = await prisma.statusHistory.findFirst({
        where: { workOrderId: overrideOrder.id, eventType: "ENTREGA_REALIZADA" },
      });
      expect(history).not.toBeNull();
      const meta = history?.metadata as Record<string, unknown>;
      expect(meta?.odometerRegression).toBe(true);
      expect(meta?.odometerOverrideApplied).toBe(true);
    } finally {
      await prisma.statusHistory.deleteMany({ where: { workOrderId: overrideOrder.id } });
      await prisma.deliveryRecord.deleteMany({ where: { workOrderId: overrideOrder.id } });
      await prisma.intakeRecord.deleteMany({ where: { workOrderId: overrideOrder.id } });
      await prisma.workOrder.deleteMany({ where: { id: overrideOrder.id } });
      await prisma.vehicle.deleteMany({ where: { id: overrideVehicle.id } });
    }
  });

  it("rechaza entrega con 404 si la orden no existe en el taller (fail-closed)", async () => {
    const fakeId = `wo-inexistente-${Date.now()}`;
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${fakeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deliver",
        odometerAtDelivery: 50000,
        deliveredToName: "Desconocido",
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: fakeId }) });
    expect(res.status).toBe(404);

    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("WORK_ORDER_NOT_FOUND");
  });

  it("transición a LISTO emite mensaje WHATSAPP_READY_FOR_PICKUP en OutboxMessage", async () => {
    const req = new NextRequest(`http://localhost:3000/api/work-orders/${orderControlId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "transition",
        targetStatus: "LISTO",
        expectedVersion: 1,
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: orderControlId }) });
    expect(res.status).toBe(200);

    const outboxReady = await prisma.outboxMessage.findFirst({
      where: {
        workshopId: WORKSHOP_ID,
        eventType: "WHATSAPP_READY_FOR_PICKUP",
      },
    });
    expect(outboxReady).not.toBeNull();
    expect(outboxReady?.status).toBe("PENDING");
  });
});
