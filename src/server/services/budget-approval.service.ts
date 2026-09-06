import { createHash } from "node:crypto";
import type { Prisma, AdminUser } from "@prisma/client";
import { DomainConflictException, NotFoundException, ValidationException, ForbiddenException } from "@/shared/errors";
import { withSerializableRetry } from "./order-calculation.service";
import { recalculateBlockersInTx } from "./order-blocker.service";
import type { BlockReasonName, BlockerServiceTx } from "./order-blocker.service";

export type BudgetDecision = "APROBADO" | "RECHAZADO";
export type ActorTypeBudget = "ADMIN" | "CLIENTE" | "SYSTEM";

export interface BudgetDecisionCommand {
  workshopId: string;
  workOrderId: string;
  budgetVersionId: string;
  decision: BudgetDecision;
  actorType: ActorTypeBudget;
  actorAdminId?: string;
  phoneHash?: string;
  ipHash?: string;
  userAgentHash?: string;
  rejectionReason?: string;
}

interface BudgetVersionRow {
  id: string;
  status: string;
  budgetId: string;
  versionNumber: number;
  budget: {
    workOrderId: string;
    currentVersionId?: string | null;
    workOrder: { workshopId: string };
  };
  laborLines: ReadonlyArray<{
    description: string;
    estimatedMinutes: number;
    hourlyRateCharged: string;
  }>;
  partLines: ReadonlyArray<{
    description: string;
    quantity: number;
    unitPriceCharged: string;
  }>;
}

export type BudgetApprovalServiceTx = BlockerServiceTx & {
  adminUser: {
    findFirst(args: { where: Record<string, unknown>; select?: unknown }): Promise<AdminUser | null>;
  };
  budget: {
    findFirst(args: {
      where: Record<string, unknown>;
      select?: unknown;
    }): Promise<{ id?: string; currentVersion?: { status: string } | null } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  budgetVersion: {
    findFirst(args: { where: { id: string }; select: unknown }): Promise<BudgetVersionRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  budgetApproval: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  statusHistory: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
};

export interface BudgetApprovalPrismaClient {
  $transaction<T>(
    fn: (tx: BudgetApprovalServiceTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T>;
}

const BUDGET_VERSION_SELECT = {
  id: true,
  status: true,
  budgetId: true,
  versionNumber: true,
  budget: {
    select: {
      workOrderId: true,
      currentVersionId: true,
      workOrder: { select: { workshopId: true } },
    },
  },
  laborLines: { select: { description: true, estimatedMinutes: true, hourlyRateCharged: true } },
  partLines: { select: { description: true, quantity: true, unitPriceCharged: true } },
} as const;

export async function assertActiveWorkshopUser(
  tx: BudgetApprovalServiceTx,
  workshopId: string,
  adminId: string,
  roles?: string[]
): Promise<AdminUser> {
  const user = await tx.adminUser.findFirst({
    where: {
      id: adminId,
      workshopId: workshopId,
      active: true,
      deletedAt: null,
      ...(roles && roles.length > 0 ? { role: { in: roles } } : {}),
    },
  });
  if (!user) {
    throw new ForbiddenException("USER_NOT_ACTIVE_OR_UNAUTHORIZED", "El usuario no pertenece al taller o no está activo.");
  }
  return user;
}

function hashBudgetContent(version: BudgetVersionRow): string {
  const canonical = JSON.stringify({
    budgetVersionId: version.id,
    versionNumber: version.versionNumber,
    laborLines: [...version.laborLines].sort((a, b) => a.description.localeCompare(b.description)),
    partLines: [...version.partLines].sort((a, b) => a.description.localeCompare(b.description)),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function decideBudgetVersionInTx(
  tx: BudgetApprovalServiceTx,
  command: BudgetDecisionCommand
): Promise<{ budgetVersionId: string; decision: BudgetDecision; blockReason: BlockReasonName }> {
  const version = await tx.budgetVersion.findFirst({
    where: { id: command.budgetVersionId },
    select: BUDGET_VERSION_SELECT,
  });

  const scopedCorrectly =
    version !== null &&
    version.budget.workOrderId === command.workOrderId &&
    version.budget.workOrder.workshopId === command.workshopId;

  if (!version || !scopedCorrectly) {
    throw new NotFoundException(
      "BUDGET_VERSION_NOT_FOUND",
      "La versión de presupuesto no existe dentro del tenant.",
      { budgetVersionId: command.budgetVersionId }
    );
  }

  // Invariante BUDGET-01: Sólo se puede decidir sobre la versión vigente
  const currentVersionId = version.budget.currentVersionId;
  if (currentVersionId !== null && currentVersionId !== undefined && currentVersionId !== version.id) {
    throw new DomainConflictException(
      "BUDGET_VERSION_SUPERSEDED",
      "La versión del presupuesto ha sido superada por una nueva versión vigente.",
      {
        requestedVersionId: version.id,
        currentVersionId,
        workOrderId: command.workOrderId,
      }
    );
  }

  if (version.status !== "PENDIENTE_APROBACION") {
    throw new DomainConflictException(
      "BUDGET_NOT_DECIDABLE",
      `La versión de presupuesto no está pendiente de aprobación (estado actual: ${version.status}).`,
      { currentStatus: version.status }
    );
  }

  if (
    command.decision === "RECHAZADO" &&
    (command.rejectionReason === undefined || command.rejectionReason.trim().length < 5)
  ) {
    throw new ValidationException(
      "REJECTION_REASON_REQUIRED",
      "El rechazo de un presupuesto exige un motivo de al menos 5 caracteres."
    );
  }

  // S2: Validación de Tenant Activo para Staff
  if (command.actorType === "ADMIN" && command.actorAdminId) {
    await assertActiveWorkshopUser(tx, command.workshopId, command.actorAdminId, ["ADMIN"]);
  }

  const now = new Date();
  const contentHash = hashBudgetContent(version);

  await tx.budgetVersion.update({
    where: { id: version.id },
    data:
      command.decision === "APROBADO"
        ? { status: "APROBADO", approvedAt: now }
        : { status: "RECHAZADO", rejectedAt: now, rejectionReason: command.rejectionReason ?? null },
  });

  // B1: actorAdminId null para clientes/sistema, ID para ADMIN
  const actorAdminId = command.actorType === "ADMIN" && command.actorAdminId ? command.actorAdminId : null;

  await tx.budgetApproval.create({
    data: {
      budgetVersionId: version.id,
      actorType: command.actorType,
      actorAdminId,
      decision: command.decision,
      phoneHash: command.phoneHash ?? null,
      contentHash,
      ipHash: command.ipHash ?? null,
      userAgentHash: command.userAgentHash ?? null,
      reason: command.rejectionReason ?? null,
      decidedAt: now,
    },
  });

  if (command.decision === "APROBADO") {
    await tx.budgetVersion.updateMany({
      where: { budgetId: version.budgetId, status: "APROBADO", id: { not: version.id } },
      data: { status: "SUPERSEDED" },
    });
    // CAS atómico sobre budget.currentVersionId (F-06 / BUDGET-01)
    const budgetUpdate = await tx.budget.updateMany({
      where: {
        id: version.budgetId,
        currentVersionId: currentVersionId ?? null,
      },
      data: { currentVersionId: version.id },
    });
    if (budgetUpdate.count === 0) {
      throw new DomainConflictException(
        "BUDGET_VERSION_SUPERSEDED",
        "La versión del presupuesto ha sido superada concurrentemente en la base de datos.",
        {
          requestedVersionId: version.id,
          expectedCurrentVersionId: currentVersionId ?? null,
          workOrderId: command.workOrderId,
        }
      );
    }
  } else if (command.decision === "RECHAZADO") {
    if (!version.budget.currentVersionId) {
      // Si no existía currentVersionId y se rechaza la versión inicial, consolidar mediante CAS para cerrar el ciclo de la versión base
      const budgetUpdate = await tx.budget.updateMany({
        where: {
          id: version.budgetId,
          currentVersionId: null,
        },
        data: { currentVersionId: version.id },
      });
      if (budgetUpdate.count === 0) {
        throw new DomainConflictException(
          "BUDGET_VERSION_SUPERSEDED",
          "La versión inicial del presupuesto ha sido superada concurrentemente en la base de datos.",
          {
            requestedVersionId: version.id,
            expectedCurrentVersionId: null,
            workOrderId: command.workOrderId,
          }
        );
      }
    } else {
      // Si ya existía versión consolidada, verificar mediante guardia que currentVersionId siga coincidiendo
      const currentBudget = await tx.budget.findFirst({
        where: { id: version.budgetId, currentVersionId: version.id },
      });
      if (!currentBudget) {
        throw new DomainConflictException(
          "BUDGET_VERSION_SUPERSEDED",
          "La versión del presupuesto ha sido superada concurrentemente en la base de datos.",
          {
            requestedVersionId: version.id,
            expectedCurrentVersionId: version.id,
            workOrderId: command.workOrderId,
          }
        );
      }
    }
  }

  const blockReason = await recalculateBlockersInTx(tx, {
    workshopId: command.workshopId,
    workOrderId: command.workOrderId,
    actorAdminId: actorAdminId,
  });

  await tx.statusHistory.create({
    data: {
      workOrderId: command.workOrderId,
      actorType: command.actorType,
      actorAdminId: command.actorAdminId ?? null,
      eventType: command.decision === "APROBADO" ? "PRESUPUESTO_APROBADO" : "PRESUPUESTO_RECHAZADO",
      publicVisible: true,
      publicDescription:
        command.decision === "APROBADO" ? "El presupuesto fue aprobado." : "El presupuesto fue rechazado.",
      createdAt: now,
      metadata: { budgetVersionId: version.id, decision: command.decision, blockReason },
    },
  });

  return { budgetVersionId: version.id, decision: command.decision, blockReason };
}

export async function decideBudgetVersion(
  prismaClient: BudgetApprovalPrismaClient,
  command: BudgetDecisionCommand
): Promise<{ budgetVersionId: string; decision: BudgetDecision; blockReason: BlockReasonName }> {
  return withSerializableRetry(() =>
    prismaClient.$transaction((tx) => decideBudgetVersionInTx(tx, command), {
      isolationLevel: "Serializable",
    })
  );
}
