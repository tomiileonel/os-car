import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decideBudgetVersion } from "@/server/services/budget-approval.service";
import type { BudgetApprovalPrismaClient } from "@/server/services/budget-approval.service";
import { DomainConflictException } from "@/shared/errors";
import { createHash } from "node:crypto";

const NEON_TEST_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.G5_NEON_DATABASE_URL;

describe.skipIf(!NEON_TEST_URL)(
  "G5 Empirical Concurrency Suite — Real PostgreSQL / Neon",
  () => {
  let prisma: PrismaClient;
  let testWorkshopId: string;
  let testAdminUserId: string;
  let testCustomerId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: NEON_TEST_URL } },
    });
    await prisma.$connect();

    const workshop = await prisma.workshop.create({
      data: {
        name: `G5-Live-${Date.now()}`,
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
    testWorkshopId = workshop.id;

    const admin = await prisma.adminUser.create({
      data: {
        workshopId: testWorkshopId,
        authUserId: `admin-g5-${Date.now()}`,
        displayName: "Auditor Concurrencia",
        email: `admin-g5-${Date.now()}@test.com`,
        role: "ADMIN",
        active: true,
      },
    });
    testAdminUserId = admin.id;

    const customer = await prisma.customer.create({
      data: {
        workshopId: testWorkshopId,
        fullName: "Cliente Concurrencia G5",
        phoneE164: `+5411${Math.floor(10000000 + Math.random() * 90000000)}`,
        phoneNormalized: `5411${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `cliente-g5-${Date.now()}@test.com`,
      },
    });
    testCustomerId = customer.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma) {
      if (testWorkshopId) {
        try {
          await prisma.budget.updateMany({ where: { workOrder: { workshopId: testWorkshopId } }, data: { currentVersionId: null } });
          await prisma.budgetLaborLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: testWorkshopId } } } } });
          await prisma.budgetPartLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: testWorkshopId } } } } });
          await prisma.budgetApproval.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId: testWorkshopId } } } } });
          await prisma.budgetVersion.deleteMany({ where: { budget: { workOrder: { workshopId: testWorkshopId } } } });
          await prisma.budget.deleteMany({ where: { workOrder: { workshopId: testWorkshopId } } });
          await prisma.orderBlocker.deleteMany({ where: { workshopId: testWorkshopId } });
          await prisma.statusHistory.deleteMany({ where: { workOrder: { workshopId: testWorkshopId } } });
          await prisma.intakeRecord.deleteMany({ where: { workOrder: { workshopId: testWorkshopId } } });
          await prisma.workOrder.deleteMany({ where: { workshopId: testWorkshopId } });
          await prisma.vehicle.deleteMany({ where: { workshopId: testWorkshopId } });
          await prisma.customer.deleteMany({ where: { workshopId: testWorkshopId } });
          await prisma.adminUser.deleteMany({ where: { workshopId: testWorkshopId } });
          await prisma.workshop.delete({ where: { id: testWorkshopId } });
        } catch {
          // Ignore cleanup errors during test teardown
        }
      }
      await prisma.$disconnect();
    }
  });

  async function createFixtures(tag: string) {
    const vehicle = await prisma.vehicle.create({
      data: {
        workshopId: testWorkshopId,
        customerId: testCustomerId,
        licensePlate: `PL${Math.floor(10000 + Math.random() * 90000)}`,
        licensePlateNormalized: `PL${Math.floor(10000 + Math.random() * 90000)}`,
        make: "Toyota",
        model: "Corolla",
        modelYear: 2023,
      },
    });
    const workOrder = await prisma.workOrder.create({
      data: {
        workshopId: testWorkshopId,
        customerId: testCustomerId,
        vehicleId: vehicle.id,
        createdById: testAdminUserId,
        trackingCodeHash: createHash("sha256").update(`${tag}-${Date.now()}-${Math.random()}`).digest("hex"),
        status: "INGRESADO",
      },
    });
    await prisma.intakeRecord.create({
      data: {
        workOrderId: workOrder.id,
        odometerAtIntake: 45000,
        fuelLevel: "LLENO",
        customerComplaint: `Test Complaint ${tag}`,
      },
    });
    await prisma.orderBlocker.create({
      data: {
        workshopId: testWorkshopId,
        workOrderId: workOrder.id,
        type: "APROBACION_PRESUPUESTO",
        reason: "APROBACION_CLIENTE",
        isActive: true,
        blockedByUserId: testAdminUserId,
      },
    });
    const budget = await prisma.budget.create({
      data: { workOrderId: workOrder.id, currentVersionId: null },
    });
    const budgetVersion = await prisma.budgetVersion.create({
      data: {
        budgetId: budget.id,
        versionNumber: 1,
        status: "PENDIENTE_APROBACION",
        subtotalLabor: 20000,
        subtotalParts: 35000,
        totalEstimated: 55000,
        createdById: testAdminUserId,
        laborLines: {
          create: [{ description: "Servicio mayor", estimatedMinutes: 120, hourlyRateCharged: 20000, lineTotal: 20000 }],
        },
        partLines: {
          create: [{ description: "Kit distribución", quantity: 1, unitPriceCharged: 35000, lineTotal: 35000 }],
        },
      },
    });
    return { workOrder, budget, budgetVersion };
  }

  it(
    "Carrera Mixta Real: 20 workers simultáneos (10 Aprobaciones, 10 Rechazos) admitidos por el motor con Serializable y Full Jitter",
    async () => {
      const { workOrder, budgetVersion } = await createFixtures("MIXED-20");

      const promises = Array.from({ length: 20 }).map((_, idx) => {
        const isApproval = idx % 2 === 0;
        return decideBudgetVersion(prisma as unknown as BudgetApprovalPrismaClient, {
          workshopId: testWorkshopId,
          workOrderId: workOrder.id,
          budgetVersionId: budgetVersion.id,
          decision: isApproval ? "APROBADO" : "RECHAZADO",
          actorType: isApproval ? "ADMIN" : "CLIENTE",
          actorAdminId: isApproval ? testAdminUserId : undefined,
          rejectionReason: isApproval ? undefined : `Rechazo concurrente worker ${idx + 1}`,
        });
      });

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(19);

      for (const rej of rejected) {
        if (rej.status === "rejected") {
          expect(rej.reason).toBeInstanceOf(DomainConflictException);
          expect((rej.reason as DomainConflictException).code).toBe("BUDGET_NOT_DECIDABLE");
        }
      }

      const approvalCount = await prisma.budgetApproval.count({
        where: { budgetVersionId: budgetVersion.id },
      });
      expect(approvalCount).toBe(1);

      const statusCount = await prisma.statusHistory.count({
        where: { workOrderId: workOrder.id },
      });
      expect(statusCount).toBe(1);

      const activeBlockers = await prisma.orderBlocker.count({
        where: { workOrderId: workOrder.id, isActive: true },
      });
      expect(activeBlockers).toBe(0);
    },
    45_000
  );

  it(
    "Invariante I3 Real: Carrera de 20 Rechazos simultáneos en PostgreSQL jamás promueve la versión rechazada a currentVersionId",
    async () => {
      const { workOrder, budget, budgetVersion } = await createFixtures("REJECTIONS-20");

      const initialBudget = await prisma.budget.findUnique({ where: { id: budget.id } });
      expect(initialBudget?.currentVersionId).toBeNull();

      const promises = Array.from({ length: 20 }).map((_, idx) =>
        decideBudgetVersion(prisma as unknown as BudgetApprovalPrismaClient, {
          workshopId: testWorkshopId,
          workOrderId: workOrder.id,
          budgetVersionId: budgetVersion.id,
          decision: "RECHAZADO",
          actorType: "CLIENTE",
          rejectionReason: `Rechazo simultáneo puro worker ${idx + 1}`,
        })
      );

      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(19);

      const updatedBudget = await prisma.budget.findUnique({ where: { id: budget.id } });
      expect(updatedBudget?.currentVersionId).toBeNull();

      const updatedVersion = await prisma.budgetVersion.findUnique({ where: { id: budgetVersion.id } });
      expect(updatedVersion?.status).toBe("RECHAZADO");

      const approvalCount = await prisma.budgetApproval.count({
        where: { budgetVersionId: budgetVersion.id },
      });
      expect(approvalCount).toBe(1);

      const statusCount = await prisma.statusHistory.count({
        where: { workOrderId: workOrder.id },
      });
      expect(statusCount).toBe(1);
    },
    45_000
  );
});
