import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import {
  toErrorEnvelope,
  NotFoundException,
  DomainConflictException,
  ValidationException,
} from "@/shared/errors";
import { validateTransition } from "@/server/services/order-workflow.service";
import { recalculateOrderTotalsInTx } from "@/server/services/order-calculation.service";
import {
  decideBudgetVersion,
  type BudgetApprovalPrismaClient,
} from "@/server/services/budget-approval.service";
import { recalculateBlockersInTx } from "@/server/services/order-blocker.service";

function failResponse(error: unknown, request: NextRequest): NextResponse {
  const requestId = resolveCorrelationId(request);
  const { status, body } = toErrorEnvelope(error, {
    requestId,
    instance: request.nextUrl.pathname,
  });
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "x-correlation-id": requestId,
    },
  });
}

async function fetchWorkOrderDetail(workshopId: string, orderId: string) {
  const order = await prisma.workOrder.findFirst({
    where: { id: orderId, workshopId, deletedAt: null },
    include: {
      vehicle: true,
      customer: true,
      intakeRecord: true,
      createdBy: {
        select: { id: true, displayName: true, role: true },
      },
      bayAssignments: {
        where: { releasedAt: null },
        take: 1,
        orderBy: { assignedAt: "desc" },
        include: { bay: true },
      },
      workItems: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
      partItems: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
      },
      blockers: {
        where: { isActive: true },
        orderBy: { blockedAt: "desc" },
      },
      budget: {
        include: {
          currentVersion: true,
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundException("WORK_ORDER_NOT_FOUND", "La orden de trabajo no existe en el taller.", {
      orderId,
    });
  }

  const activeBay = order.bayAssignments[0]?.bay;

  return {
    id: order.id,
    status: order.status,
    version: order.version,
    openedAt: order.openedAt.toISOString(),
    diagnosedAt: order.diagnosedAt ? order.diagnosedAt.toISOString() : null,
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    trackingCodeHash: order.trackingCodeHash,
    vehicle: {
      id: order.vehicle.id,
      licensePlateNormalized: order.vehicle.licensePlateNormalized,
      vin: order.vehicle.vin,
      make: order.vehicle.make,
      model: order.vehicle.model,
      modelYear: order.vehicle.modelYear,
      color: order.vehicle.color,
    },
    customer: {
      id: order.customer.id,
      fullName: order.customer.fullName,
      phone: order.customer.phoneE164,
    },
    intakeRecord: order.intakeRecord
      ? {
          odometerAtIntake: order.intakeRecord.odometerAtIntake,
          fuelLevel: order.intakeRecord.fuelLevel,
          customerComplaint: order.intakeRecord.customerComplaint,
        }
      : null,
    assignedMechanic: order.createdBy
      ? {
          id: order.createdBy.id,
          name: order.createdBy.displayName,
          role: order.createdBy.role,
        }
      : null,
    currentBay: activeBay
      ? {
          id: activeBay.id,
          code: activeBay.code,
        }
      : null,
    workItems: order.workItems.map((item) => ({
      id: item.id,
      description: item.description,
      estimatedMinutes: item.estimatedMinutes,
      actualMinutes: item.actualMinutes,
      hourlyRateCharged: Number(item.hourlyRateCharged),
      status: item.status,
      isAdditional: item.isAdditional,
    })),
    partItems: order.partItems.map((part) => ({
      id: part.id,
      partNumber: part.partNumber,
      description: part.description,
      quantity: part.quantity,
      unitPriceCharged: Number(part.unitPriceCharged),
      status: part.status,
      isAdditional: part.isAdditional,
    })),
    blockers: order.blockers.map((b) => ({
      id: b.id,
      type: b.type,
      reason: b.reason,
      isActive: b.isActive,
      blockedAt: b.blockedAt.toISOString(),
    })),
    budget: order.budget
      ? {
          id: order.budget.id,
          currentVersion: order.budget.currentVersion
            ? {
                id: order.budget.currentVersion.id,
                versionNumber: order.budget.currentVersion.versionNumber,
                status: order.budget.currentVersion.status,
                totalEstimated: Number(order.budget.currentVersion.totalEstimated),
              }
            : null,
        }
      : null,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId } = await requireActiveAdminApi({
      roles: [
        "OWNER",
        "TALLER_SUPERVISOR",
        "ADMIN",
        "SUPER_ADMIN",
        "ADMIN_TALLER",
        "RECEPCIONISTA",
        "MECANICO",
      ],
    });

    const { id } = await context.params;
    const data = await fetchWorkOrderDetail(workshopId, id);

    return NextResponse.json(
      { success: true, data, meta: { requestId } },
      {
        headers: {
          "Cache-Control": "no-store",
          "x-correlation-id": requestId,
        },
      },
    );
  } catch (error) {
    return failResponse(error, request);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId, adminUser } = await requireActiveAdminApi({
      roles: [
        "OWNER",
        "TALLER_SUPERVISOR",
        "ADMIN",
        "SUPER_ADMIN",
        "ADMIN_TALLER",
        "RECEPCIONISTA",
        "MECANICO",
      ],
    });

    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "transition") {
      const targetStatus = body.targetStatus as OrderStatus;
      const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : undefined;

      const currentOrder = await prisma.workOrder.findFirst({
        where: { id, workshopId, deletedAt: null },
        select: { id: true, status: true, version: true },
      });
      if (!currentOrder) {
        throw new NotFoundException("WORK_ORDER_NOT_FOUND", "La orden no existe.");
      }

      if (expectedVersion !== undefined && currentOrder.version !== expectedVersion) {
        throw new DomainConflictException(
          "CONCURRENT_MODIFICATION",
          "La orden ha sido modificada concurrentemente.",
          { currentVersion: currentOrder.version, expectedVersion },
        );
      }

      const check = validateTransition(currentOrder.status, targetStatus, id);
      if (!check.ok) {
        throw check.error;
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        status: targetStatus,
        version: { increment: 1 },
      };

      if (targetStatus === "DIAGNOSTICO") {
        updateData.diagnosedAt = now;
      } else if (targetStatus === "EN_REPARACION") {
        updateData.repairStartedAt = now;
      } else if (targetStatus === "LISTO") {
        updateData.readyAt = now;
      } else if (targetStatus === "ENTREGADO") {
        updateData.deliveredAt = now;
      } else if (targetStatus === "CANCELADA") {
        updateData.cancelledAt = now;
        if (typeof body.reason === "string") {
          updateData.cancellationReason = body.reason;
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.workOrder.update({
          where: { id },
          data: updateData,
        });

        await tx.statusHistory.create({
          data: {
            workOrderId: id,
            actorType: "ADMIN",
            actorAdminId: adminUser.id,
            eventType: targetStatus === "CANCELADA" ? "ORDEN_CANCELADA" : "OTRO",
            publicVisible: true,
            publicDescription: `Estado actualizado a ${targetStatus}`,
            metadata: { from: currentOrder.status, to: targetStatus, reason: body.reason ?? null },
          },
        });

        await recalculateBlockersInTx(tx, {
          workshopId,
          workOrderId: id,
          actorAdminId: adminUser.id,
        });
      });
    } else if (action === "add-work-item") {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!description) {
        throw new ValidationException("DESCRIPTION_REQUIRED", "La descripción es requerida.");
      }
      const minutes = Number(body.estimatedMinutes);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        throw new ValidationException("INVALID_MINUTES", "Los minutos deben ser un entero positivo.");
      }
      const rate = Number(body.hourlyRateCharged);
      if (Number.isNaN(rate) || rate < 0) {
        throw new ValidationException("INVALID_RATE", "La tarifa horaria debe ser un número no negativo.");
      }

      await prisma.$transaction(async (tx) => {
        await tx.workItem.create({
          data: {
            workshopId,
            workOrderId: id,
            description,
            estimatedMinutes: minutes,
            hourlyRateCharged: rate.toFixed(2),
            createdById: adminUser.id,
          },
        });

        await recalculateOrderTotalsInTx(tx, { workshopId, workOrderId: id });
        await recalculateBlockersInTx(tx, { workshopId, workOrderId: id, actorAdminId: adminUser.id });
      });
    } else if (action === "add-part-item") {
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!description) {
        throw new ValidationException("DESCRIPTION_REQUIRED", "La descripción es requerida.");
      }
      const qty = Number(body.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new ValidationException("INVALID_QUANTITY", "La cantidad debe ser un entero positivo.");
      }
      const unitPrice = Number(body.unitPriceCharged);
      if (Number.isNaN(unitPrice) || unitPrice < 0) {
        throw new ValidationException("INVALID_UNIT_PRICE", "El precio unitario debe ser un número no negativo.");
      }
      const partNumber = typeof body.partNumber === "string" && body.partNumber.trim() ? body.partNumber.trim() : null;

      await prisma.$transaction(async (tx) => {
        await tx.partItem.create({
          data: {
            workshopId,
            workOrderId: id,
            description,
            quantity: qty,
            unitPriceCharged: unitPrice.toFixed(2),
            partNumber,
            createdById: adminUser.id,
          },
        });

        await recalculateOrderTotalsInTx(tx, { workshopId, workOrderId: id });
        await recalculateBlockersInTx(tx, { workshopId, workOrderId: id, actorAdminId: adminUser.id });
      });
    } else if (action === "resolve-blocker") {
      const blockerId = typeof body.blockerId === "string" ? body.blockerId : "";
      if (!blockerId) {
        throw new ValidationException("BLOCKER_ID_REQUIRED", "El ID del bloqueo es requerido.");
      }

      const blocker = await prisma.orderBlocker.findFirst({
        where: { id: blockerId, workOrderId: id, workshopId, isActive: true },
      });
      if (!blocker) {
        throw new NotFoundException("BLOCKER_NOT_FOUND", "El bloqueo no existe o ya fue resuelto.");
      }

      await prisma.$transaction(async (tx) => {
        await tx.orderBlocker.update({
          where: { id: blockerId },
          data: {
            isActive: false,
            resolvedAt: new Date(),
            resolvedByUserId: adminUser.id,
            resolutionNotes: typeof body.notes === "string" ? body.notes : "Resuelto por operador",
          },
        });

        await recalculateBlockersInTx(tx, { workshopId, workOrderId: id, actorAdminId: adminUser.id });
      });
    } else if (action === "approve-budget") {
      const budgetVersionId = typeof body.budgetVersionId === "string" ? body.budgetVersionId : "";
      if (!budgetVersionId) {
        throw new ValidationException("BUDGET_VERSION_ID_REQUIRED", "El ID de versión de presupuesto es requerido.");
      }

      await decideBudgetVersion(prisma as unknown as BudgetApprovalPrismaClient, {
        workshopId,
        workOrderId: id,
        budgetVersionId,
        decision: "APROBADO",
        actorType: "ADMIN",
        actorAdminId: adminUser.id,
      });
    } else {
      throw new ValidationException("INVALID_ACTION", `Acción '${action}' no soportada.`);
    }

    const updatedData = await fetchWorkOrderDetail(workshopId, id);

    return NextResponse.json(
      { success: true, data: updatedData, meta: { requestId } },
      {
        headers: {
          "Cache-Control": "no-store",
          "x-correlation-id": requestId,
        },
      },
    );
  } catch (error) {
    return failResponse(error, request);
  }
}
