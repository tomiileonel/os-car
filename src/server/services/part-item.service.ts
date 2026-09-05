import type { Prisma } from "@prisma/client";
import { DomainConflictException, NotFoundException, ValidationException } from "@/shared/errors";
import { money, recalculateOrderTotalsInTx, toMoneyString, withSerializableRetry } from "./order-calculation.service";
import type { MoneyInput, TotalsRecalculationTx } from "./order-calculation.service";
import { recalculateBlockersInTx } from "./order-blocker.service";
import type { BlockerServiceTx } from "./order-blocker.service";

export type PartItemStatusName =
  | "PENDIENTE"
  | "CONSEGUIDO"
  | "INSTALADO"
  | "DEVOLUCION_PENDIENTE"
  | "DEVUELTO"
  | "CANCELADO";

const PART_STATUS_VALUES: readonly PartItemStatusName[] = [
  "PENDIENTE",
  "CONSEGUIDO",
  "INSTALADO",
  "DEVOLUCION_PENDIENTE",
  "DEVUELTO",
  "CANCELADO",
];

export interface UpdatePartItemPatch {
  description?: string;
  partNumber?: string | null;
  quantity?: number;
  unitPriceCharged?: MoneyInput;
  unitCost?: MoneyInput | null;
  status?: PartItemStatusName;
  isAdditional?: boolean;
  requiresApproval?: boolean;
}

export interface UpdatePartItemCommand {
  workshopId: string;
  partItemId: string;
  expectedVersion: number;
  actorAdminId?: string;
  patch: UpdatePartItemPatch;
}

export type PartItemServiceTx = TotalsRecalculationTx &
  BlockerServiceTx & {
    partItem: {
      findFirst(args: {
        where: { id: string; workshopId: string; deletedAt: null };
        select: { id: true; version: true; workOrderId: true; status: true };
      }): Promise<{ id: string; version: number; workOrderId: string; status: string } | null>;
      updateMany(args: {
        where: { id: string; workshopId: string; version: number; deletedAt: null };
        data: Record<string, unknown>;
      }): Promise<{ count: number }>;
    };
  };

export interface PartItemPrismaClient {
  $transaction<T>(
    fn: (tx: PartItemServiceTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T>;
}

function buildPatchData(patch: UpdatePartItemPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (patch.description !== undefined) {
    const description = patch.description.trim();
    if (description.length < 2 || description.length > 500) {
      throw new ValidationException(
        "INVALID_PART_DESCRIPTION",
        "La descripción del repuesto debe tener entre 2 y 500 caracteres."
      );
    }
    data.description = description;
  }

  if (patch.partNumber !== undefined) {
    data.partNumber = patch.partNumber;
  }

  if (patch.quantity !== undefined) {
    if (!Number.isInteger(patch.quantity) || patch.quantity <= 0) {
      throw new ValidationException(
        "INVALID_PART_QUANTITY",
        "La cantidad del repuesto debe ser un entero positivo.",
        { quantity: patch.quantity }
      );
    }
    data.quantity = patch.quantity;
  }

  if (patch.unitPriceCharged !== undefined) {
    const price = money(patch.unitPriceCharged);
    if (price.isNegative()) {
      throw new ValidationException("INVALID_UNIT_PRICE", "El precio unitario no puede ser negativo.");
    }
    data.unitPriceCharged = toMoneyString(price);
  }

  if (patch.unitCost !== undefined) {
    data.unitCost = patch.unitCost === null ? null : toMoneyString(money(patch.unitCost));
  }

  if (patch.status !== undefined) {
    if (!(PART_STATUS_VALUES as readonly string[]).includes(patch.status)) {
      throw new ValidationException("INVALID_PART_STATUS", `Estado de repuesto inválido: ${patch.status}.`);
    }
    data.status = patch.status;
  }

  if (patch.isAdditional !== undefined) {
    data.isAdditional = patch.isAdditional;
  }
  if (patch.requiresApproval !== undefined) {
    data.requiresApproval = patch.requiresApproval;
  }

  return data;
}

export async function updatePartItemInTx(
  tx: PartItemServiceTx,
  command: UpdatePartItemCommand
): Promise<{ partItemId: string; newVersion: number }> {
  const existing = await tx.partItem.findFirst({
    where: { id: command.partItemId, workshopId: command.workshopId, deletedAt: null },
    select: { id: true, version: true, workOrderId: true, status: true },
  });
  if (!existing) {
    throw new NotFoundException("PART_ITEM_NOT_FOUND", "El repuesto no existe en el tenant.", {
      partItemId: command.partItemId,
    });
  }

  if (existing.version !== command.expectedVersion) {
    throw new DomainConflictException(
      "VERSION_CONFLICT",
      "Invariante C1: la versión esperada no coincide con la almacenada.",
      { expectedVersion: command.expectedVersion, actualVersion: existing.version }
    );
  }

  const data = buildPatchData(command.patch);
  data.version = { increment: 1 };
  data.updatedAt = new Date();

  const applied = await tx.partItem.updateMany({
    where: {
      id: existing.id,
      workshopId: command.workshopId,
      version: command.expectedVersion,
      deletedAt: null,
    },
    data,
  });
  if (applied.count === 0) {
    throw new DomainConflictException(
      "VERSION_CONFLICT",
      "Invariante C1: modificación concurrente detectada; la transacción fue abortada.",
      { partItemId: existing.id, expectedVersion: command.expectedVersion }
    );
  }

  await recalculateBlockersInTx(tx, {
    workshopId: command.workshopId,
    workOrderId: existing.workOrderId,
    actorAdminId: command.actorAdminId ?? null,
  });
  await recalculateOrderTotalsInTx(tx, {
    workshopId: command.workshopId,
    workOrderId: existing.workOrderId,
  });

  return { partItemId: existing.id, newVersion: command.expectedVersion + 1 };
}

export async function updatePartItem(
  prismaClient: PartItemPrismaClient,
  command: UpdatePartItemCommand
): Promise<{ partItemId: string; newVersion: number }> {
  return withSerializableRetry(() =>
    prismaClient.$transaction((tx) => updatePartItemInTx(tx, command), {
      isolationLevel: "Serializable",
    })
  );
}
