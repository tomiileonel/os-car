import { NextRequest, NextResponse } from "next/server";
import type { Prisma, OrderStatus } from "@prisma/client";
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

    const params = request.nextUrl.searchParams;
    const statusParam = params.get("status");
    const searchParam = params.get("search")?.trim();

    const where: Prisma.WorkOrderWhereInput = {
      workshopId,
      deletedAt: null,
    };

    if (statusParam) {
      where.status = statusParam as OrderStatus;
    }

    if (searchParam) {
      where.OR = [
        { vehicle: { licensePlateNormalized: { contains: searchParam.toUpperCase() } } },
        { customer: { fullName: { contains: searchParam, mode: "insensitive" } } },
      ];
    }

    const orders = await prisma.workOrder.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
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
        bayAssignments: {
          where: { releasedAt: null },
          take: 1,
          include: { bay: true },
        },
        createdBy: {
          select: { id: true, displayName: true },
        },
      },
    });

    const data = orders.map((wo) => {
      const activeBay = wo.bayAssignments[0]?.bay;
      return {
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
        bayCode: activeBay?.code ?? null,
        totalEstimated: Number(wo.totalEstimated),
        activeBlockersCount: wo.blockers.length,
        completedTasksCount: wo.workItems.filter((i) => i.status === "COMPLETADO").length,
        totalTasksCount: wo.workItems.length,
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
