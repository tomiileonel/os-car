/**
 * OS-CAR — GET /api/admin/orders/[id]
 * Detalle completo de la orden: cliente, vehículo, intake, bahía, ítems, presupuesto, historia, bloqueos, totales.
 */
import { db } from "@/lib/db";
import { ok, handleApiError, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { parseChecklist, round2, vehicleLabel, formatOrderNumber } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;

    const order = await db.workOrder.findFirst({
      where: { id, workshopId: admin.workshopId },
      include: {
        customer: true,
        vehicle: true,
        intakeRecord: true,
        workItems: { include: { assignedAdmin: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
        partItems: { orderBy: { createdAt: "asc" } },
        bayAssignments: {
          where: { releasedAt: null },
          include: { bay: true },
          orderBy: { assignedAt: "desc" },
          take: 1,
        },
        budget: {
          include: {
            currentVersion: {
              include: {
                laborLines: true,
                partLines: true,
                approvals: { orderBy: { decidedAt: "desc" } },
              },
            },
          },
        },
        statusHistory: { include: { actorAdmin: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } },
        blockers: { where: { isActive: true }, orderBy: { blockedAt: "desc" } },
      },
    });

    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const assignment = order.bayAssignments[0] ?? null;
    const version = order.budget?.currentVersion ?? null;

    const internalCost = round2(
      order.workItems.reduce((acc, item) => acc + (Number(item.internalCostAmount) || 0), 0) +
        order.partItems.reduce((acc, item) => acc + (Number(item.unitCost) || 0) * item.quantity, 0),
    );

    return ok({
      id: order.id,
      orderNumber: formatOrderNumber(order.id),
      status: order.status,
      version: order.version,
      openedAt: order.openedAt.toISOString(),
      trackingCode: order.trackingCodeHash,
      customer: {
        id: order.customer.id,
        fullName: order.customer.fullName,
        phoneE164: order.customer.phoneE164,
        email: order.customer.email,
      },
      vehicle: {
        id: order.vehicle.id,
        plate: order.vehicle.licensePlate,
        make: order.vehicle.make,
        model: order.vehicle.model,
        modelYear: order.vehicle.modelYear,
        color: order.vehicle.color,
        vehicleType: order.vehicle.vehicleType,
      },
      intake: order.intakeRecord
        ? {
            odometerAtIntake: order.intakeRecord.odometerAtIntake,
            fuelLevel: order.intakeRecord.fuelLevel,
            customerComplaint: order.intakeRecord.customerComplaint,
            visualChecklist: [],
          }
        : null,
      bay: assignment ? { code: assignment.bay.code, since: assignment.assignedAt.toISOString() } : null,
      workItems: order.workItems.map((item) => ({
        id: item.id,
        description: item.description,
        estimatedMinutes: item.estimatedMinutes,
        actualMinutes: item.actualMinutes,
        hourlyRateCharged: Number(item.hourlyRateCharged),
        internalCostAmount: item.internalCostAmount ? Number(item.internalCostAmount) : null,
        status: item.status,
        isAdditional: item.isAdditional,
        assignedAdminId: item.assignedAdminId,
        assignedName: item.assignedAdmin?.displayName ?? null,
      })),
      partItems: order.partItems.map((item) => ({
        id: item.id,
        description: item.description,
        partNumber: item.partNumber,
        quantity: item.quantity,
        unitCost: item.unitCost ? Number(item.unitCost) : null,
        unitPriceCharged: Number(item.unitPriceCharged),
        status: item.status,
      })),
      budget: version
        ? {
            status: version.status,
            versionNumber: version.versionNumber,
            subtotalLabor: Number(version.subtotalLabor),
            subtotalParts: Number(version.subtotalParts),
            totalEstimated: Number(version.totalEstimated),
            publishedAt: version.publishedAt?.toISOString() ?? null,
            approvedAt: version.approvedAt?.toISOString() ?? null,
            laborLines: version.laborLines.map((line) => ({
              id: line.id,
              description: line.description,
              estimatedMinutes: line.estimatedMinutes,
              hourlyRate: Number(line.hourlyRateCharged),
              lineTotal: Number(line.lineTotal),
              isApproved: line.isApproved,
            })),
            partLines: version.partLines.map((line) => ({
              id: line.id,
              partNumber: line.partNumber,
              description: line.description,
              quantity: line.quantity,
              unitPrice: Number(line.unitPriceCharged),
              lineTotal: Number(line.lineTotal),
              isApproved: line.isApproved,
            })),
            approvals: version.approvals.map((approval) => ({
              actorType: approval.actorType,
              decision: approval.decision,
              reason: approval.reason,
              decidedAt: approval.decidedAt.toISOString(),
            })),
          }
        : null,
      history: order.statusHistory.map((event) => ({
        at: event.createdAt.toISOString(),
        eventType: event.eventType,
        description: event.publicDescription,
        actor: event.actorAdmin?.displayName ?? event.actorType,
        actorType: event.actorType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
      })),
      blockers: order.blockers.map((blocker) => ({
        id: blocker.id,
        type: blocker.type,
        reason: blocker.reason,
        blockedAt: blocker.blockedAt.toISOString(),
      })),
      totals: {
        laborSubtotal: Number(order.laborSubtotal),
        partsSubtotal: Number(order.partsSubtotal),
        totalEstimated: Number(order.totalEstimated),
        internalCost,
        margin: round2(Number(order.totalEstimated) - internalCost),
      },
      vehicleLabel: vehicleLabel(order.vehicle),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
