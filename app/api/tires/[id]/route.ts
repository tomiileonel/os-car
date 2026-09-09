import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import {
  toErrorEnvelope,
  NotFoundException,
  ValidationException,
} from "@/shared/errors";

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

    const set = await prisma.tireSet.findFirst({
      where: { id, workshopId, deletedAt: null },
      include: {
        customer: true,
        vehicle: true,
        tires: true,
      },
    });

    if (!set) {
      throw new NotFoundException("TIRE_SET_NOT_FOUND", "Juego de neumáticos no encontrado.");
    }

    return NextResponse.json(
      { success: true, data: set, meta: { requestId } },
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
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "checkout";

    const set = await prisma.tireSet.findFirst({
      where: { id, workshopId, deletedAt: null },
    });
    if (!set) {
      throw new NotFoundException("TIRE_SET_NOT_FOUND", "Juego de neumáticos no encontrado.");
    }

    if (action === "checkout") {
      const deliveredTo = typeof body.deliveredTo === "string" && body.deliveredTo.trim() ? body.deliveredTo.trim() : "Titular del vehículo";
      const signatureHash = typeof body.signatureHash === "string" ? body.signatureHash : null;

      const updated = await prisma.tireSet.update({
        where: { id },
        data: {
          status: "ENTREGADO",
          checkOutAt: new Date(),
          deliveredTo,
          signatureHash,
        },
        include: {
          customer: true,
          vehicle: true,
          tires: true,
        },
      });

      return NextResponse.json(
        { success: true, data: updated, meta: { requestId } },
        {
          headers: {
            "Cache-Control": "no-store",
            "x-correlation-id": requestId,
          },
        },
      );
    } else if (action === "relocate") {
      const rack = typeof body.rack === "string" ? body.rack.trim() : set.rack;
      const level = typeof body.level === "string" ? body.level.trim() : set.level;
      const position = typeof body.position === "string" ? body.position.trim() : set.position;

      const updated = await prisma.tireSet.update({
        where: { id },
        data: { rack, level, position },
        include: {
          customer: true,
          vehicle: true,
          tires: true,
        },
      });

      return NextResponse.json(
        { success: true, data: updated, meta: { requestId } },
        {
          headers: {
            "Cache-Control": "no-store",
            "x-correlation-id": requestId,
          },
        },
      );
    } else {
      throw new ValidationException("INVALID_ACTION", `Acción '${action}' no válida.`);
    }
  } catch (error) {
    return failResponse(error, request);
  }
}
