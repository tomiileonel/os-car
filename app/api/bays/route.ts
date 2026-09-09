import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { toErrorEnvelope } from "@/shared/errors";

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

const DEFAULT_BAYS = [
  { code: "B1 - ELEVADOR 1", ordinal: 1 },
  { code: "B2 - ELEVADOR 2", ordinal: 2 },
  { code: "B3 - FOSA ALINEACIÓN", ordinal: 3 },
  { code: "B4 - DIAGNÓSTICO", ordinal: 4 },
];

async function getBaysWithAssignments(workshopId: string) {
  return prisma.bay.findMany({
    where: { workshopId, deletedAt: null },
    orderBy: { ordinal: "asc" },
    include: {
      assignments: {
        where: { releasedAt: null },
        take: 1,
        orderBy: { assignedAt: "desc" },
        include: {
          workOrder: {
            include: {
              vehicle: true,
              customer: true,
              workItems: {
                select: { id: true, status: true },
              },
              blockers: {
                where: { isActive: true },
                select: { id: true },
              },
              createdBy: {
                select: { id: true, displayName: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    let bays = await getBaysWithAssignments(workshopId);

    // Auto-inicialización si el taller aún no tiene bahías configuradas
    if (bays.length === 0) {
      await prisma.bay.createMany({
        data: DEFAULT_BAYS.map((b) => ({
          workshopId,
          code: b.code,
          ordinal: b.ordinal,
          status: "LIBRE",
          isEnabled: true,
        })),
        skipDuplicates: true,
      });

      bays = await getBaysWithAssignments(workshopId);
    }

    const data = bays.map((bay) => {
      const active = bay.assignments[0];
      const wo = active?.workOrder;
      return {
        id: bay.id,
        code: bay.code,
        ordinal: bay.ordinal,
        status: bay.status,
        isEnabled: bay.isEnabled,
        activeAssignment: active
          ? {
              id: active.id,
              bayId: active.bayId,
              workOrderId: active.workOrderId,
              assignedAt: active.assignedAt.toISOString(),
              releasedAt: active.releasedAt ? active.releasedAt.toISOString() : null,
              workOrder: wo
                ? {
                    id: wo.id,
                    status: wo.status,
                    version: wo.version,
                    openedAt: wo.openedAt.toISOString(),
                    trackingCodeHash: wo.trackingCodeHash,
                    customerName: wo.customer.fullName,
                    customerPhone: wo.customer.phoneE164,
                    vehiclePlate: wo.vehicle.licensePlateNormalized,
                    vehicleLabel: [wo.vehicle.make, wo.vehicle.model, wo.vehicle.modelYear]
                      .filter(Boolean)
                      .join(" ") || "S/D",
                    mechanicName: wo.createdBy?.displayName ?? null,
                    bayCode: bay.code,
                    totalEstimated: Number(wo.totalEstimated),
                    activeBlockersCount: wo.blockers.length,
                    completedTasksCount: wo.workItems.filter((i) => i.status === "COMPLETADO").length,
                    totalTasksCount: wo.workItems.length,
                  }
                : undefined,
            }
          : null,
      };
    });

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
