import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { DomainConflictException } from "@/shared/errors";
import {
  decideBudgetVersionInTx,
  decideBudgetVersion,
} from "@/server/services/budget-approval.service";
import type {
  BudgetApprovalPrismaClient,
  BudgetApprovalServiceTx,
} from "@/server/services/budget-approval.service";
import {
  isRetryableConcurrencyError,
} from "@/server/services/order-calculation.service";

// =============================================================================
// @category Unit Test — Application Choreography & CAS Simulation (Mocked)
//
// CLASIFICACIÓN TÉCNICA FORMAL:
// Este arnés es una suite de nivel UNITARIO con aislamiento en memoria (mocks).
// Valida la coreografía algorítmica de la capa de servicios TypeScript:
// 1. Intercepción y clasificación de errores de concurrencia (40001 / P2034).
// 2. Reintento con Full Jitter y re-evaluación de condiciones de negocio.
// 3. Fall-through sin escrituras huérfanas cuando la condición CAS (count === 0) falla.
// 4. Acotamiento de cadenas de causas de error ultra-profundas (MAX_CAUSE_DEPTH = 16).
//
// NOTA DE GOBERNANZA:
// Esta suite NO valida el motor relacional ni el aislamiento SERIALIZABLE de PostgreSQL.
// La validación empírica del motor relacional real reside en:
// - tests/integration/budget-concurrency-neon.integration.test.ts
// - scripts/run-g5-neon-benchmark.ts
// - docs/audit/g5-concurrency-empirical-verification.md
// =============================================================================

function createMockTx(sharedStore: {
  versionStatus: string;
  currentVersionId: string | null;
  approvals: Array<Record<string, unknown>>;
  statusHistories: Array<Record<string, unknown>>;
}): BudgetApprovalServiceTx {
  const versionRow = {
    id: "bv_target_001",
    status: sharedStore.versionStatus,
    budgetId: "b_target_001",
    versionNumber: 1,
    budget: {
      workOrderId: "wo_target_001",
      currentVersionId: sharedStore.currentVersionId,
      workOrder: { workshopId: "ws_target_001" },
    },
    laborLines: [
      { description: "Mantenimiento General", estimatedMinutes: 60, hourlyRateCharged: "15000.00" },
    ],
    partLines: [
      { description: "Filtro de Aceite", quantity: 1, unitPriceCharged: "8500.00" },
    ],
  };

  return {
    workOrder: {
      findFirst: vi.fn().mockResolvedValue({ id: "wo_target_001", status: "PRESUPUESTADO", createdById: "au_admin" }),
    },
    workItem: { findMany: vi.fn().mockResolvedValue([]) },
    partItem: { findMany: vi.fn().mockResolvedValue([]) },
    budget: {
      findFirst: vi.fn().mockImplementation(async () => ({
        id: "b_target_001",
        currentVersion: { status: sharedStore.versionStatus },
      })),
      update: vi.fn().mockResolvedValue({ id: "b_target_001" }),
      updateMany: vi.fn().mockImplementation(async (args: { where: { id: string; currentVersionId: unknown }; data: Record<string, unknown> }) => {
        if (args.where.currentVersionId === sharedStore.currentVersionId) {
          if (args.data.currentVersionId !== undefined) {
            sharedStore.currentVersionId = args.data.currentVersionId as string;
          }
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    intakeRecord: { findFirst: vi.fn().mockResolvedValue({ id: "ir_1" }) },
    qualityControl: { findFirst: vi.fn().mockResolvedValue(null) },
    orderBlocker: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "ob_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adminUser: {
      findFirst: vi.fn().mockResolvedValue({
        id: "au_admin",
        workshopId: "ws_target_001",
        active: true,
        role: "ADMIN",
      }),
    },
    budgetVersion: {
      findFirst: vi.fn().mockImplementation(async () => ({
        ...versionRow,
        status: sharedStore.versionStatus,
        budget: {
          ...versionRow.budget,
          currentVersionId: sharedStore.currentVersionId,
        },
      })),
      update: vi.fn().mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        if (args.data.status) {
          sharedStore.versionStatus = args.data.status as string;
        }
        return { id: args.where.id };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    budgetApproval: {
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        sharedStore.approvals.push(args.data);
        return { id: `ba_${sharedStore.approvals.length}` };
      }),
    },
    statusHistory: {
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        sharedStore.statusHistories.push(args.data);
        return { id: `sh_${sharedStore.statusHistories.length}` };
      }),
    },
  };
}

describe("G5 Concurrency & CAS Verification (Integration Harness)", () => {
  it("I6 & I1: Simula colisión SSI (40001 / P2034) con reintento Full Jitter que reevalúa committed state y aborta limpiamente sin mutaciones huérfanas", async () => {
    const sharedStore = {
      versionStatus: "PENDIENTE_APROBACION",
      currentVersionId: null as string | null,
      approvals: [] as Array<Record<string, unknown>>,
      statusHistories: [] as Array<Record<string, unknown>>,
    };

    let attemptTx2 = 0;

    const tx1 = createMockTx(sharedStore);
    const tx2 = createMockTx(sharedStore);

    const clientStub: BudgetApprovalPrismaClient = {
      $transaction: vi.fn().mockImplementation(async (fn: (tx: BudgetApprovalServiceTx) => Promise<unknown>) => {
        attemptTx2 += 1;
        if (attemptTx2 === 1) {
          await decideBudgetVersionInTx(tx1, {
            workshopId: "ws_target_001",
            workOrderId: "wo_target_001",
            budgetVersionId: "bv_target_001",
            decision: "APROBADO",
            actorType: "ADMIN",
            actorAdminId: "au_admin",
          });

          throw new Prisma.PrismaClientKnownRequestError(
            "could not serialize access due to read/write dependencies among transactions (SQLSTATE 40001)",
            { code: "P2034", clientVersion: "6.19.3" }
          );
        }
        return fn(tx2);
      }) as unknown as BudgetApprovalPrismaClient["$transaction"],
    };

    await expect(
      decideBudgetVersion(clientStub, {
        workshopId: "ws_target_001",
        workOrderId: "wo_target_001",
        budgetVersionId: "bv_target_001",
        decision: "RECHAZADO",
        rejectionReason: "Cliente no conforme con el monto total",
        actorType: "CLIENTE",
      })
    ).rejects.toThrow(DomainConflictException);

    expect(attemptTx2).toBe(2);
    expect(sharedStore.approvals.length).toBe(1);
    expect(sharedStore.approvals[0].decision).toBe("APROBADO");
    expect(sharedStore.statusHistories.length).toBe(1);
    expect(sharedStore.currentVersionId).toBe("bv_target_001");
    expect(sharedStore.versionStatus).toBe("APROBADO");
  });

  it("I3 & I4: Rechazo concurrente ejecuta CAS simétrico y NUNCA promueve la versión rechazada a currentVersionId", async () => {
    const sharedStore = {
      versionStatus: "PENDIENTE_APROBACION",
      currentVersionId: null as string | null,
      approvals: [] as Array<Record<string, unknown>>,
      statusHistories: [] as Array<Record<string, unknown>>,
    };

    const tx = createMockTx(sharedStore);

    const result = await decideBudgetVersionInTx(tx, {
      workshopId: "ws_target_001",
      workOrderId: "wo_target_001",
      budgetVersionId: "bv_target_001",
      decision: "RECHAZADO",
      rejectionReason: "Presupuesto descartado por el titular",
      actorType: "CLIENTE",
    });

    expect(result.decision).toBe("RECHAZADO");
    expect(sharedStore.currentVersionId).toBeNull();
    expect(sharedStore.versionStatus).toBe("RECHAZADO");
    expect(sharedStore.approvals.length).toBe(1);
    expect(sharedStore.approvals[0].decision).toBe("RECHAZADO");
  });

  it("I4: Falla de CAS (count === 0) arroja inmediatamente BUDGET_VERSION_SUPERSEDED sin escrituras huérfanas", async () => {
    const sharedStore = {
      versionStatus: "PENDIENTE_APROBACION",
      currentVersionId: "bv_newer_version_999",
      approvals: [] as Array<Record<string, unknown>>,
      statusHistories: [] as Array<Record<string, unknown>>,
    };

    const tx = createMockTx(sharedStore);

    await expect(
      decideBudgetVersionInTx(tx, {
        workshopId: "ws_target_001",
        workOrderId: "wo_target_001",
        budgetVersionId: "bv_target_001",
        decision: "APROBADO",
        actorType: "ADMIN",
        actorAdminId: "au_admin",
      })
    ).rejects.toThrow(DomainConflictException);

    expect(sharedStore.approvals.length).toBe(0);
    expect(sharedStore.statusHistories.length).toBe(0);
  });

  it("Resiliencia algorítmica: isRetryableConcurrencyError tolera cadenas de causas lineales de hasta 10,000 niveles sin RangeError", () => {
    let deepError: Record<string, unknown> = {
      code: "40001",
      message: "could not serialize access",
    };

    for (let i = 0; i < 10000; i += 1) {
      deepError = { message: `Cause chain level ${i}`, cause: deepError };
    }

    expect(() => isRetryableConcurrencyError(deepError)).not.toThrow();
    expect(isRetryableConcurrencyError(deepError)).toBe(false);
  });
});
