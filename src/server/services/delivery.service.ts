import type { Prisma } from "@prisma/client";
import { DomainConflictException, NotFoundException, ValidationException } from "@/shared/errors";
import { withSerializableRetry } from "./order-calculation.service";

export interface DeliveryOdometerCheckArgs {
  initialOdometer: number;
  finalOdometer: number;
  supervisorOverrideId?: string;
  supervisorNotes?: string;
}

export interface DeliveryOdometerVerdict {
  allowed: boolean;
  regressionDetected: boolean;
  overrideApplied: boolean;
}

export function validateDeliveryOdometer(args: DeliveryOdometerCheckArgs): DeliveryOdometerVerdict {
  if (!Number.isInteger(args.finalOdometer) || args.finalOdometer < 0) {
    throw new ValidationException(
      "INVALID_DELIVERY_ODOMETER",
      "El odómetro de entrega debe ser un entero no negativo.",
      { odometerAtDelivery: args.finalOdometer }
    );
  }

  if (args.finalOdometer >= args.initialOdometer) {
    return { allowed: true, regressionDetected: false, overrideApplied: false };
  }

  const hasValidOverride =
    typeof args.supervisorOverrideId === "string" &&
    args.supervisorOverrideId.trim().length > 0 &&
    typeof args.supervisorNotes === "string" &&
    args.supervisorNotes.trim().length >= 10;

  if (hasValidOverride) {
    return { allowed: true, regressionDetected: true, overrideApplied: true };
  }

  throw new ValidationException(
    "ODOMETER_REGRESSION",
    "Invariante A4: el odómetro de entrega no puede ser menor al registrado en recepción.",
    { initialOdometer: args.initialOdometer, odometerAtDelivery: args.finalOdometer }
  );
}

export interface DeliverOrderCommand {
  workshopId: string;
  workOrderId: string;
  expectedVersion: number;
  actorAdminId: string;
  recipientName: string;
  recipientDocumentLast4?: string;
  keysHandedOver: true;
  conformityAccepted: true;
  odometerAtDelivery: number;
  supervisorOverrideId?: string;
  supervisorNotes?: string;
  notes?: string;
}

interface DeliveryOrderRow {
  id: string;
  status: string;
  version: number;
  intakeRecord: { odometerAtIntake: number; odometerCorrectedTo: number | null } | null;
}

export interface DeliveryServiceTx {
  workOrder: {
    findFirst(args: {
      where: { id: string; workshopId: string; deletedAt: null };
      select: {
        id: true;
        status: true;
        version: true;
        intakeRecord: { select: { odometerAtIntake: true; odometerCorrectedTo: true } };
      };
    }): Promise<DeliveryOrderRow | null>;
    updateMany(args: {
      where: { id: string; workshopId: string; version: number; status: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  deliveryRecord: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  bayAssignment: {
    updateMany(args: {
      where: { workOrderId: string; releasedAt: null };
      data: { releasedAt: Date; releaseReason: string };
    }): Promise<{ count: number }>;
  };
  statusHistory: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface DeliveryPrismaClient {
  $transaction<T>(
    fn: (tx: DeliveryServiceTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T>;
}

export async function deliverOrderInTx(
  tx: DeliveryServiceTx,
  command: DeliverOrderCommand
): Promise<{ workOrderId: string; status: "ENTREGADO"; newVersion: number; odometerVerdict: DeliveryOdometerVerdict }> {
  const order = await tx.workOrder.findFirst({
    where: { id: command.workOrderId, workshopId: command.workshopId, deletedAt: null },
    select: {
      id: true,
      status: true,
      version: true,
      intakeRecord: { select: { odometerAtIntake: true, odometerCorrectedTo: true } },
    },
  });
  if (!order) {
    throw new NotFoundException("WORK_ORDER_NOT_FOUND", "La orden de trabajo no existe en el tenant.", {
      workOrderId: command.workOrderId,
    });
  }

  if (order.status !== "LISTO") {
    throw new DomainConflictException(
      "INVALID_STATE_TRANSITION",
      "La entrega física sólo puede ejecutarse desde el estado LISTO.",
      { currentStatus: order.status }
    );
  }

  if (order.version !== command.expectedVersion) {
    throw new DomainConflictException(
      "VERSION_CONFLICT",
      "Invariante C1: la versión esperada de la orden no coincide.",
      { expectedVersion: command.expectedVersion, actualVersion: order.version }
    );
  }

  if (!order.intakeRecord) {
    throw new ValidationException(
      "INTAKE_RECORD_MISSING",
      "No existe registro de recepción para validar el odómetro de entrega."
    );
  }

  const initialOdometer =
    order.intakeRecord.odometerCorrectedTo ?? order.intakeRecord.odometerAtIntake;
  const verdict = validateDeliveryOdometer({
    initialOdometer,
    finalOdometer: command.odometerAtDelivery,
    supervisorOverrideId: command.supervisorOverrideId,
    supervisorNotes: command.supervisorNotes,
  });

  const now = new Date();

  const applied = await tx.workOrder.updateMany({
    where: {
      id: order.id,
      workshopId: command.workshopId,
      version: command.expectedVersion,
      status: "LISTO",
    },
    data: {
      status: "ENTREGADO",
      deliveredAt: now,
      trackingCodeRevokedAt: now,
      version: { increment: 1 },
      updatedAt: now,
    },
  });
  if (applied.count === 0) {
    throw new DomainConflictException(
      "VERSION_CONFLICT",
      "Modificación concurrente detectada durante la entrega; transacción abortada.",
      { workOrderId: order.id }
    );
  }

  await tx.deliveryRecord.create({
    data: {
      workOrderId: order.id,
      deliveredById: command.actorAdminId,
      recipientName: command.recipientName,
      recipientDocumentLast4: command.recipientDocumentLast4 ?? null,
      keysHandedOver: command.keysHandedOver,
      conformityAccepted: command.conformityAccepted,
      odometerAtDelivery: command.odometerAtDelivery,
      supervisorOverrideId: command.supervisorOverrideId ?? null,
      supervisorNotes: command.supervisorNotes ?? null,
      notes: command.notes ?? null,
      deliveredAt: now,
    },
  });

  await tx.bayAssignment.updateMany({
    where: { workOrderId: order.id, releasedAt: null },
    data: { releasedAt: now, releaseReason: "ENTREGA" },
  });

  await tx.statusHistory.create({
    data: {
      workOrderId: order.id,
      actorType: "ADMIN",
      actorAdminId: command.actorAdminId,
      eventType: "ENTREGA_REALIZADA",
      fromStatus: "LISTO",
      toStatus: "ENTREGADO",
      publicVisible: true,
      publicDescription: "El vehículo fue entregado.",
      createdAt: now,
      metadata: {
        odometerAtDelivery: command.odometerAtDelivery,
        initialOdometer,
        odometerRegression: verdict.regressionDetected,
        odometerOverrideApplied: verdict.overrideApplied,
        supervisorOverrideId: verdict.overrideApplied ? command.supervisorOverrideId ?? null : null,
      },
    },
  });

  return {
    workOrderId: order.id,
    status: "ENTREGADO",
    newVersion: command.expectedVersion + 1,
    odometerVerdict: verdict,
  };
}

export async function deliverOrder(
  prismaClient: DeliveryPrismaClient,
  command: DeliverOrderCommand
): Promise<{ workOrderId: string; status: "ENTREGADO"; newVersion: number; odometerVerdict: DeliveryOdometerVerdict }> {
  return withSerializableRetry(() =>
    prismaClient.$transaction((tx) => deliverOrderInTx(tx, command), {
      isolationLevel: "Serializable",
    })
  );
}
