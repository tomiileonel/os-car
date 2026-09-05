import type { Prisma, BlockerType } from "@prisma/client";
import { DomainConflictException, NotFoundException } from "@/shared/errors";

export type BlockReasonName =
  | "NINGUNO"
  | "APROBACION_CLIENTE"
  | "REPUESTO_PENDIENTE"
  | "CAPACIDAD_TALLER"
  | "DATOS_INCOMPLETOS"
  | "CONTROL_OBSERVADO"
  | "OTRO";

export const BLOCK_REASON_PRIORITY: readonly BlockReasonName[] = [
  "APROBACION_CLIENTE",
  "REPUESTO_PENDIENTE",
  "CONTROL_OBSERVADO",
  "DATOS_INCOMPLETOS",
  "CAPACIDAD_TALLER",
  "OTRO",
];

export const BLOCK_REASON_TO_TYPE: Record<BlockReasonName, BlockerType> = {
  APROBACION_CLIENTE: "APROBACION_PRESUPUESTO",
  REPUESTO_PENDIENTE: "REPUESTO_PENDIENTE",
  CONTROL_OBSERVADO: "CONTROL_CALIDAD_RECHAZADO",
  DATOS_INCOMPLETOS: "DOCUMENTACION_VEHICULO",
  CAPACIDAD_TALLER: "CAPACIDAD_TALLER",
  OTRO: "OTRO",
  NINGUNO: "OTRO",
};

export interface BlockerSnapshotInput {
  orderStatus: string;
  createdById?: string | null;
  intakeRecord: { id: string } | null;
  partItems: ReadonlyArray<{ status: string; requiresApproval: boolean }>;
  workItems: ReadonlyArray<{ isAdditional: boolean; requiresApproval: boolean }>;
  budgetVersionStatus: string | null;
  qualityControlPassed: boolean | null;
  capacityBlocked?: boolean;
}

export interface BlockerServiceTx {
  workOrder: {
    findFirst(args: {
      where: { id: string; workshopId: string; deletedAt: null };
      select: { id: true; status: true; createdById?: true };
    }): Promise<{ id: string; status: string; createdById?: string | null } | null>;
  };
  adminUser?: {
    findFirst(args: {
      where: { workshopId: string; active: boolean; deletedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  partItem: {
    findMany(args: {
      where: { workOrderId: string };
      select: { status: true; requiresApproval: boolean };
    }): Promise<Array<{ status: string; requiresApproval: boolean }>>;
  };
  workItem: {
    findMany(args: {
      where: { workOrderId: string };
      select: { isAdditional: true; requiresApproval: boolean };
    }): Promise<Array<{ isAdditional: boolean; requiresApproval: boolean }>>;
  };
  budget: {
    findFirst(args: {
      where: { workOrderId: string };
      select: { currentVersion: { select: { status: true } } };
    }): Promise<{ currentVersion: { status: string } | null } | null>;
  };
  intakeRecord: {
    findFirst(args: { where: { workOrderId: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  qualityControl: {
    findFirst(args: {
      where: { workOrderId: string };
      select: { passed: true };
    }): Promise<{ passed: boolean } | null>;
  };
  orderBlocker: {
    findMany(args: {
      where: { workOrderId: string; isActive: true };
      select: { reason: true };
    }): Promise<Array<{ reason: string }>>;
    create(args: {
      data: {
        workshopId: string;
        workOrderId: string;
        type: BlockerType;
        reason: string;
        isActive: boolean;
        blockedByUserId: string;
      };
    }): Promise<{ id: string }>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: { isActive: boolean; resolvedAt: Date; resolvedByUserId?: string | null };
    }): Promise<{ count: number }>;
  };
}

export function prioritizeBlockers(active: ReadonlyArray<BlockReasonName>): BlockReasonName {
  for (const reason of BLOCK_REASON_PRIORITY) {
    if (active.includes(reason)) {
      return reason;
    }
  }
  return "NINGUNO";
}

export function collectBlockers(snapshot: BlockerSnapshotInput): BlockReasonName[] {
  const blockers: BlockReasonName[] = [];

  if (snapshot.budgetVersionStatus === "PENDIENTE_APROBACION") {
    blockers.push("APROBACION_CLIENTE");
  }
  if (
    snapshot.workItems.some((item) => item.isAdditional && item.requiresApproval) ||
    snapshot.partItems.some((part) => part.requiresApproval && part.status === "PENDIENTE")
  ) {
    blockers.push("APROBACION_CLIENTE");
  }
  if (snapshot.partItems.some((part) => part.status === "PENDIENTE")) {
    blockers.push("REPUESTO_PENDIENTE");
  }
  if (snapshot.qualityControlPassed === false) {
    blockers.push("CONTROL_OBSERVADO");
  }
  if (!snapshot.intakeRecord) {
    blockers.push("DATOS_INCOMPLETOS");
  }
  if (snapshot.capacityBlocked === true) {
    blockers.push("CAPACIDAD_TALLER");
  }

  return Array.from(new Set(blockers));
}

const TARGET_BLOCKING_REASONS: Readonly<Record<string, ReadonlyArray<BlockReasonName>>> = {
  EN_REPARACION: ["APROBACION_CLIENTE", "REPUESTO_PENDIENTE", "DATOS_INCOMPLETOS"],
  LISTO: ["CONTROL_OBSERVADO", "APROBACION_CLIENTE"],
};

export function assertTransitionNotBlocked(
  targetStatus: string,
  blockers: ReadonlyArray<BlockReasonName>
): void {
  const blockingSet = TARGET_BLOCKING_REASONS[targetStatus] ?? [];
  const blocking = blockingSet.filter((reason) => blockers.includes(reason));
  if (blocking.length > 0) {
    throw new DomainConflictException(
      "BLOCKED_TRANSITION",
      `Invariante A1: la transición a ${targetStatus} está bloqueada por: ${blocking.join(", ")}.`,
      { blockers: blocking }
    );
  }
}

export async function loadBlockerSnapshotInTx(
  tx: BlockerServiceTx,
  args: { workshopId: string; workOrderId: string }
): Promise<BlockerSnapshotInput> {
  const order = await tx.workOrder.findFirst({
    where: { id: args.workOrderId, workshopId: args.workshopId, deletedAt: null },
    select: { id: true, status: true, createdById: true },
  });
  if (!order) {
    throw new NotFoundException("WORK_ORDER_NOT_FOUND", "La orden de trabajo no existe en el tenant.", {
      workOrderId: args.workOrderId,
    });
  }

  const [partItems, workItems, budget, intakeRecord, qualityControl] = await Promise.all([
    tx.partItem.findMany({
      where: { workOrderId: args.workOrderId },
      select: { status: true, requiresApproval: true },
    }),
    tx.workItem.findMany({
      where: { workOrderId: args.workOrderId },
      select: { isAdditional: true, requiresApproval: true },
    }),
    tx.budget.findFirst({
      where: { workOrderId: args.workOrderId },
      select: { currentVersion: { select: { status: true } } },
    }),
    tx.intakeRecord.findFirst({ where: { workOrderId: args.workOrderId }, select: { id: true } }),
    tx.qualityControl.findFirst({ where: { workOrderId: args.workOrderId }, select: { passed: true } }),
  ]);

  return {
    orderStatus: order.status,
    createdById: order.createdById,
    intakeRecord,
    partItems,
    workItems,
    budgetVersionStatus: budget?.currentVersion?.status ?? null,
    qualityControlPassed: qualityControl?.passed ?? null,
    capacityBlocked: false,
  };
}

export async function recalculateBlockersInTx(
  tx: BlockerServiceTx,
  args: { workshopId: string; workOrderId: string; actorAdminId?: string | null }
): Promise<BlockReasonName> {
  const snapshot = await loadBlockerSnapshotInTx(tx, args);
  const currentBlockers = collectBlockers(snapshot);
  const primary = prioritizeBlockers(currentBlockers);

  const activeDbBlockers = await tx.orderBlocker.findMany({
    where: { workOrderId: args.workOrderId, isActive: true },
    select: { reason: true },
  });
  const activeDbReasons = activeDbBlockers.map((b) => b.reason as BlockReasonName);

  const toCreate = currentBlockers.filter((r) => !activeDbReasons.includes(r));
  const toResolve = activeDbReasons.filter((r) => !currentBlockers.includes(r));

  if (toCreate.length > 0) {
    let resolvedBlockedByUserId = args.actorAdminId ?? snapshot.createdById ?? null;
    if (!resolvedBlockedByUserId && tx.adminUser) {
      const admin = await tx.adminUser.findFirst({
        where: { workshopId: args.workshopId, active: true, deletedAt: null },
        select: { id: true },
      });
      resolvedBlockedByUserId = admin?.id ?? null;
    }

    if (!resolvedBlockedByUserId) {
      throw new DomainConflictException(
        "NO_ADMIN_ACTOR_AVAILABLE",
        "No se pudo determinar un usuario administrativo válido en el taller para asociar al bloqueo de orden.",
        { workshopId: args.workshopId, workOrderId: args.workOrderId }
      );
    }

    const finalBlockedByUserId = resolvedBlockedByUserId;

    await Promise.all(
      toCreate.map((reason) =>
        tx.orderBlocker.create({
          data: {
            workshopId: args.workshopId,
            workOrderId: args.workOrderId,
            type: BLOCK_REASON_TO_TYPE[reason] ?? "OTRO",
            reason,
            isActive: true,
            blockedByUserId: finalBlockedByUserId,
          },
        })
      )
    );
  }

  if (toResolve.length > 0) {
    await tx.orderBlocker.updateMany({
      where: { workOrderId: args.workOrderId, reason: { in: toResolve }, isActive: true },
      data: {
        isActive: false,
        resolvedAt: new Date(),
        ...(args.actorAdminId ? { resolvedByUserId: args.actorAdminId } : {}),
      },
    });
  }

  return primary;
}

export async function assertTransitionAllowedInTx(
  tx: BlockerServiceTx,
  args: { workshopId: string; workOrderId: string; targetStatus: string }
): Promise<{ blockers: BlockReasonName[]; primary: BlockReasonName }> {
  const snapshot = await loadBlockerSnapshotInTx(tx, args);
  const blockers = collectBlockers(snapshot);
  assertTransitionNotBlocked(args.targetStatus, blockers);
  return { blockers, primary: prioritizeBlockers(blockers) };
}
