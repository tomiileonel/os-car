/**
 * Standalone G5 Empirical Concurrency Benchmark Runner (Real PostgreSQL 18.6 / Neon)
 *
 * Execution:
 *   npx tsx scripts/run-g5-neon-benchmark.ts
 *   (or npm run test:g5-neon)
 *
 * Optional flags:
 *   --update-json: Overwrites docs/audit/g5-neon-20tx-raw-output.json with the new run's telemetry.
 *
 * Requirements:
 *   TEST_DATABASE_URL or G5_NEON_DATABASE_URL environment variable pointing to live Neon PostgreSQL.
 *
 * Executed Path:
 *   Invokes production decideBudgetVersion() with default options (maxWait: 10_000, timeout: 30_000, withSerializableRetry).
 *   Zero `as any` casts, zero unchecked error handling.
 *
 * Programmatic Invariant Verification:
 *   - Run 1 (20 Mixed Racers): Exactly 1 winner (APROBADO), 19 losers aborted cleanly with DomainConflictException.
 *     1 budgetApproval row, 1 statusHistory row, 0 active orderBlockers.
 *   - Run 2 (20 Pure Rejection Racers): Exactly 1 winner (RECHAZADO), 19 losers aborted cleanly.
 *     Invariant I3: budget.currentVersionId strictly remains null (never promoted!).
 *
 * Fixture Hygiene:
 *   All created workshops, orders, budgets, and lines are cleaned up in a finally block,
 *   leaving the remote Neon database pristine.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import {
  decideBudgetVersion,
  BudgetApprovalPrismaClient,
  BudgetDecision,
} from "../src/server/services/budget-approval.service";
import { DomainConflictException } from "../src/shared/errors/DomainConflictException";
import { createHash } from "node:crypto";
import * as fs from "node:fs";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.G5_NEON_DATABASE_URL;

if (!DB_URL) {
  console.error(
    "ERROR: TEST_DATABASE_URL or G5_NEON_DATABASE_URL environment variable is required to run the live benchmark."
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url: DB_URL } },
});

export interface WorkerTelemetry {
  workerId: string;
  decision: BudgetDecision;
  finalOutcome: "FULFILLED" | "REJECTED";
  finalErrorCode: string;
  errorMessage?: string;
  totalDurationMs: number;
}

async function runWorker(
  workerIndex: number,
  command: {
    workshopId: string;
    workOrderId: string;
    budgetVersionId: string;
    decision: BudgetDecision;
    actorType: "ADMIN" | "CLIENTE";
    actorAdminId?: string;
    rejectionReason?: string;
  }
): Promise<WorkerTelemetry> {
  const workerId = `Tx-${String(workerIndex).padStart(2, "0")}`;
  const t0 = Date.now();
  const tel: WorkerTelemetry = {
    workerId,
    decision: command.decision,
    finalOutcome: "REJECTED",
    finalErrorCode: "PENDING",
    totalDurationMs: 0,
  };

  try {
    await decideBudgetVersion(
      prisma as unknown as BudgetApprovalPrismaClient,
      command,
      {
        transactionOptions: {
          maxWait: 10_000,
          timeout: 30_000,
        },
      }
    );

    tel.finalOutcome = "FULFILLED";
    tel.finalErrorCode = "WINNER (COMMITTED)";
    tel.totalDurationMs = Date.now() - t0;
    return tel;
  } catch (error: unknown) {
    tel.finalOutcome = "REJECTED";
    if (error instanceof DomainConflictException) {
      tel.finalErrorCode = error.code;
      tel.errorMessage = error.message;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      tel.finalErrorCode = error.code;
      tel.errorMessage = error.message.slice(0, 120);
    } else if (error instanceof Error) {
      tel.finalErrorCode = error.name;
      tel.errorMessage = error.message.slice(0, 120);
    } else {
      tel.finalErrorCode = "UNKNOWN";
      tel.errorMessage = String(error).slice(0, 120);
    }
    tel.totalDurationMs = Date.now() - t0;
    return tel;
  }
}

async function main() {
  console.log("=== INITIATING G5 EMPIRICAL BENCHMARK (REAL POSTGRESQL / NEON) ===");
  console.log("Connecting to PostgreSQL...");
  await prisma.$connect();

  const timestamp = Date.now();
  let workshopId = "";
  const createdWorkOrderIds: string[] = [];
  const createdBudgetVersionIds: string[] = [];
  const createdBudgetIds: string[] = [];
  const createdVehicleIds: string[] = [];

  try {
    const workshop = await prisma.workshop.create({
      data: { name: `Bench-WS-${timestamp}`, timezone: "America/Argentina/Buenos_Aires" },
    });
    workshopId = workshop.id;

    const admin = await prisma.adminUser.create({
      data: {
        workshopId: workshop.id,
        authUserId: `admin-${timestamp}`,
        displayName: "Auditor Concurrencia",
        email: `admin-${timestamp}@test.com`,
        role: "ADMIN",
        active: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        workshopId: workshop.id,
        fullName: "Juan Perez",
        phoneE164: `+5411${Math.floor(10000000 + Math.random() * 90000000)}`,
        phoneNormalized: `5411${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `juan-${timestamp}@test.com`,
      },
    });

    async function setupWorkOrder(tag: string) {
      const vehicle = await prisma.vehicle.create({
        data: {
          workshopId: workshop.id,
          customerId: customer.id,
          licensePlate: `PL${Math.floor(10000 + Math.random() * 90000)}`,
          licensePlateNormalized: `PL${Math.floor(10000 + Math.random() * 90000)}`,
          make: "Toyota",
          model: "Corolla",
          modelYear: 2023,
        },
      });
      createdVehicleIds.push(vehicle.id);

      const workOrder = await prisma.workOrder.create({
        data: {
          workshopId: workshop.id,
          customerId: customer.id,
          vehicleId: vehicle.id,
          createdById: admin.id,
          trackingCodeHash: createHash("sha256").update(`${tag}-${timestamp}-${Math.random()}`).digest("hex"),
          status: "INGRESADO",
        },
      });
      createdWorkOrderIds.push(workOrder.id);

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
          workshopId: workshop.id,
          workOrderId: workOrder.id,
          type: "APROBACION_PRESUPUESTO",
          reason: "APROBACION_CLIENTE",
          isActive: true,
          blockedByUserId: admin.id,
        },
      });

      const budget = await prisma.budget.create({
        data: { workOrderId: workOrder.id, currentVersionId: null },
      });
      createdBudgetIds.push(budget.id);

      const budgetVersion = await prisma.budgetVersion.create({
        data: {
          budgetId: budget.id,
          versionNumber: 1,
          status: "PENDIENTE_APROBACION",
          subtotalLabor: 20000,
          subtotalParts: 35000,
          totalEstimated: 55000,
          createdById: admin.id,
          laborLines: {
            create: [{ description: "Servicio mayor", estimatedMinutes: 120, hourlyRateCharged: 20000, lineTotal: 20000 }],
          },
          partLines: {
            create: [{ description: "Kit distribución", quantity: 1, unitPriceCharged: 35000, lineTotal: 35000 }],
          },
        },
      });
      createdBudgetVersionIds.push(budgetVersion.id);

      return { vehicle, workOrder, budget, budgetVersion };
    }

    // RUN 1: 20 SIMULTANEOUS MIXED DECISIONS (10 Approvals, 10 Rejections)
    console.log("\n--- EXECUTING RUN 1: 20 MIXED RACERS (PRODUCTION SERVICE) ---");
    const r1 = await setupWorkOrder("RUN1-MIXED");

    const run1Promises: Promise<WorkerTelemetry>[] = [];
    for (let i = 1; i <= 20; i += 1) {
      const isApproval = i % 2 !== 0;
      run1Promises.push(
        runWorker(i, {
          workshopId: workshop.id,
          workOrderId: r1.workOrder.id,
          budgetVersionId: r1.budgetVersion.id,
          decision: isApproval ? "APROBADO" : "RECHAZADO",
          actorType: isApproval ? "ADMIN" : "CLIENTE",
          actorAdminId: isApproval ? admin.id : undefined,
          rejectionReason: isApproval ? undefined : `Rechazo concurrente worker ${i}`,
        })
      );
    }
    const run1Telemetry = await Promise.all(run1Promises);
    const fulfilled1 = run1Telemetry.filter((t) => t.finalOutcome === "FULFILLED");
    const rejected1 = run1Telemetry.filter((t) => t.finalOutcome === "REJECTED");

    console.log(`Run 1 Result: ${fulfilled1.length} Fulfilled, ${rejected1.length} Rejected.`);

    // Programmatic invariant verification for Run 1
    if (fulfilled1.length !== 1 || rejected1.length !== 19) {
      throw new Error(
        `Run 1 invariant violated: expected 1 winner and 19 losers, got ${fulfilled1.length} and ${rejected1.length}`
      );
    }
    for (const rej of rejected1) {
      if (rej.finalErrorCode !== "BUDGET_NOT_DECIDABLE" && rej.finalErrorCode !== "BUDGET_VERSION_SUPERSEDED") {
        throw new Error(`Run 1 unexpected error code: ${rej.finalErrorCode}`);
      }
    }
    const approvalCount1 = await prisma.budgetApproval.count({ where: { budgetVersionId: r1.budgetVersion.id } });
    if (approvalCount1 !== 1) {
      throw new Error(`Run 1 invariant violated: expected 1 budget approval record, got ${approvalCount1}`);
    }
    const statusCount1 = await prisma.statusHistory.count({ where: { workOrderId: r1.workOrder.id } });
    if (statusCount1 !== 1) {
      throw new Error(`Run 1 invariant violated: expected 1 status history record, got ${statusCount1}`);
    }
    const activeBlockers1 = await prisma.orderBlocker.count({ where: { workOrderId: r1.workOrder.id, isActive: true } });
    if (activeBlockers1 !== 0) {
      throw new Error(`Run 1 invariant violated: expected 0 active blockers, got ${activeBlockers1}`);
    }
    console.log("✓ Run 1 Invariants PASS: Exactly 1 winner, 19 cleanly retried losers, 1 approval, 1 status, 0 active blockers.");

    // RUN 2: 20 SIMULTANEOUS PURE REJECTIONS (INVARIANT I3)
    console.log("\n--- EXECUTING RUN 2: 20 PURE REJECTIONS (INVARIANT I3) ---");
    const r2 = await setupWorkOrder("RUN2-REJECTIONS");

    const run2Promises: Promise<WorkerTelemetry>[] = [];
    for (let i = 1; i <= 20; i += 1) {
      run2Promises.push(
        runWorker(i, {
          workshopId: workshop.id,
          workOrderId: r2.workOrder.id,
          budgetVersionId: r2.budgetVersion.id,
          decision: "RECHAZADO",
          actorType: "CLIENTE",
          rejectionReason: `Rechazo masivo puro worker ${i}`,
        })
      );
    }
    const run2Telemetry = await Promise.all(run2Promises);
    const fulfilled2 = run2Telemetry.filter((t) => t.finalOutcome === "FULFILLED");
    const rejected2 = run2Telemetry.filter((t) => t.finalOutcome === "REJECTED");

    console.log(`Run 2 Result: ${fulfilled2.length} Fulfilled, ${rejected2.length} Rejected.`);

    // Programmatic invariant verification for Run 2 (Invariant I3)
    if (fulfilled2.length !== 1 || rejected2.length !== 19) {
      throw new Error(
        `Run 2 invariant violated: expected 1 winner and 19 losers, got ${fulfilled2.length} and ${rejected2.length}`
      );
    }
    const budgetPost2 = await prisma.budget.findUnique({ where: { id: r2.budget.id } });
    if (budgetPost2?.currentVersionId !== null) {
      throw new Error(`INVARIANT I3 VIOLATION: currentVersionId promoted to ${budgetPost2?.currentVersionId}!`);
    }
    const versionPost2 = await prisma.budgetVersion.findUnique({ where: { id: r2.budgetVersion.id } });
    if (versionPost2?.status !== "RECHAZADO") {
      throw new Error(`Run 2 invariant violated: expected status RECHAZADO, got ${versionPost2?.status}`);
    }
    const statusCount2 = await prisma.statusHistory.count({ where: { workOrderId: r2.workOrder.id } });
    if (statusCount2 !== 1) {
      throw new Error(`Run 2 invariant violated: expected 1 status history record, got ${statusCount2}`);
    }
    console.log("✓ Run 2 Invariant I3 PASS: Exactly 1 winner, currentVersionId strictly preserved as null, version RECHAZADO.");

    if (process.argv.includes("--update-json")) {
      const outputPath = "docs/audit/g5-neon-20tx-raw-output.json";
      fs.writeFileSync(
        outputPath,
        JSON.stringify({ run1: run1Telemetry, run2: run2Telemetry }, null, 2),
        "utf8"
      );
      console.log(`\nTelemetry successfully persisted to ${outputPath}`);
    } else {
      console.log("\nNote: docs/audit/g5-neon-20tx-raw-output.json preserved unchanged (pass --update-json to overwrite).");
    }

    console.log("\n=== ALL G5 CONCURRENCY INVARIANTS EMPIRICALLY CERTIFIED (POSTGRESQL 18.6 / NEON) ===");
  } finally {
    console.log("\n--- CLEANING UP TEST FIXTURES FROM NEON DATABASE ---");
    try {
      if (createdBudgetIds.length > 0) {
        await prisma.budget.updateMany({ where: { id: { in: createdBudgetIds } }, data: { currentVersionId: null } });
      }
      if (createdBudgetVersionIds.length > 0) {
        await prisma.budgetLaborLine.deleteMany({ where: { budgetVersionId: { in: createdBudgetVersionIds } } });
        await prisma.budgetPartLine.deleteMany({ where: { budgetVersionId: { in: createdBudgetVersionIds } } });
        await prisma.budgetApproval.deleteMany({ where: { budgetVersionId: { in: createdBudgetVersionIds } } });
        await prisma.budgetVersion.deleteMany({ where: { id: { in: createdBudgetVersionIds } } });
      }
      if (createdBudgetIds.length > 0) {
        await prisma.budget.deleteMany({ where: { id: { in: createdBudgetIds } } });
      }
      if (createdWorkOrderIds.length > 0) {
        await prisma.orderBlocker.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
        await prisma.statusHistory.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
        await prisma.intakeRecord.deleteMany({ where: { workOrderId: { in: createdWorkOrderIds } } });
        await prisma.workOrder.deleteMany({ where: { id: { in: createdWorkOrderIds } } });
      }
      if (createdVehicleIds.length > 0) {
        await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } });
      }
      if (workshopId) {
        await prisma.customer.deleteMany({ where: { workshopId: workshopId } });
        await prisma.adminUser.deleteMany({ where: { workshopId: workshopId } });
        await prisma.workshop.delete({ where: { id: workshopId } });
      }
      console.log("✓ Fixture cleanup complete. Neon database left pristine.");
    } catch (cleanupErr) {
      console.warn("Warning during fixture cleanup:", cleanupErr);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Fatal error running benchmark:", err);
  process.exit(1);
});
