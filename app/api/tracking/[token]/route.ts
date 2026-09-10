import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashTrackingToken } from "@/lib/tracking-token";
import { clientIp } from "@/lib/client-ip";
import { memoryLimiter } from "@/lib/rate-limit";
import {
  NotFoundException,
  RateLimitException,
  toErrorEnvelope,
} from "@/shared/errors";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import type {
  PublicTrackingBudgetDto,
  PublicTrackingDto,
  PublicTrackingTimelineStepDto,
} from "@/lib/api-client";

export const runtime = "nodejs";

const WORKSHOP_METADATA = {
  name: "Taller Mecánico Os-Car",
  address: "Flor de Ceibo 11275, Barrio Itaembé Guazú, Posadas",
  phone: "+54 9 376 435-3566",
  whatsapp: "5493764353566",
};

const TIMELINE_STAGES: Array<{
  key: string;
  matchStatuses: string[];
  title: string;
  description: string;
}> = [
  {
    key: "INGRESADO",
    matchStatuses: ["INGRESADO"],
    title: "Ingreso & Recepción",
    description: "Vehículo recibido en mostrador y ficha técnica generada.",
  },
  {
    key: "DIAGNOSTICO",
    matchStatuses: ["DIAGNOSTICO"],
    title: "Diagnóstico Técnico",
    description: "Evaluación en bahía mecánica para constatación de fallas.",
  },
  {
    key: "PRESUPUESTO",
    matchStatuses: ["ESPERANDO_REPARACION"],
    title: "Presupuesto & Aprobación",
    description: "Estimación de repuestos y mano de obra a disposición del cliente.",
  },
  {
    key: "EN_REPARACION",
    matchStatuses: ["EN_REPARACION"],
    title: "En Reparación",
    description: "Trabajos mecánicos y sustitución de piezas en ejecución.",
  },
  {
    key: "CONTROL",
    matchStatuses: ["CONTROL"],
    title: "Control de Calidad",
    description: "Prueba técnica de rodaje y verificación perimetral final.",
  },
  {
    key: "LISTO",
    matchStatuses: ["LISTO", "ENTREGADO"],
    title: "Listo para Retiro",
    description: "Unidad finalizada y lista para ser entregada al cliente.",
  },
];

function maskPlate(licensePlate: string): string {
  const clean = licensePlate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 2)} *** ${clean.slice(-2)}`;
}

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
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  const ip = clientIp(request);

  // Rate Limiting público (30 req / 10 min por IP)
  const rateLimit = memoryLimiter.record(
    `public-tracking-get:${ip}`,
    30,
    10 * 60 * 1000,
    Date.now(),
  );

  if (!rateLimit.allowed) {
    const error = new RateLimitException(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)));
    return failResponse(error, request);
  }

  try {
    const { token } = await context.params;
    if (!token || typeof token !== "string" || token.trim().length < 6) {
      throw new NotFoundException(
        "TRACKING_NOT_FOUND",
        "El enlace de seguimiento es inválido o no existe.",
      );
    }

    const tokenHash = hashTrackingToken(token.trim());

    const order = await prisma.workOrder.findFirst({
      where: {
        trackingCodeHash: tokenHash,
        trackingCodeRevokedAt: null,
        deletedAt: null,
      },
      include: {
        workshop: true,
        vehicle: true,
        intakeRecord: {
          include: {
            damageMarks: true,
          },
        },
        budget: {
          include: {
            currentVersion: {
              include: {
                laborLines: true,
                partLines: true,
              },
            },
            versions: {
              where: { status: { in: ["PENDIENTE_APROBACION", "APROBADO", "BORRADOR"] } },
              orderBy: { versionNumber: "desc" },
              take: 1,
              include: {
                laborLines: true,
                partLines: true,
              },
            },
          },
        },
        statusHistory: {
          where: { publicVisible: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const MAX_TRACKING_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días TTL (N5)

    if (
      !order ||
      order.status === "ENTREGADO" ||
      Date.now() - order.trackingCodeIssuedAt.getTime() > MAX_TRACKING_AGE_MS
    ) {
      throw new NotFoundException(
        "TRACKING_NOT_FOUND",
        "No encontramos una orden activa vinculada a este enlace de seguimiento.",
      );
    }

    // Calcular estado actual en la línea de tiempo
    const currentStatus = order.status;
    let stageReachedIndex = 0;

    if (currentStatus === "INGRESADO") stageReachedIndex = 0;
    else if (currentStatus === "DIAGNOSTICO") stageReachedIndex = 1;
    else if (currentStatus === "ESPERANDO_REPARACION") stageReachedIndex = 2;
    else if (currentStatus === "EN_REPARACION") stageReachedIndex = 3;
    else if (currentStatus === "CONTROL") stageReachedIndex = 4;
    else if (currentStatus === "LISTO") stageReachedIndex = 5;

    const timeline: PublicTrackingTimelineStepDto[] = TIMELINE_STAGES.map((stage, idx) => {
      // Buscar evento de historial vinculado
      const matchingHistory = order.statusHistory.find((sh) =>
        stage.matchStatuses.includes(sh.toStatus ?? sh.eventType),
      );

      return {
        status: stage.key,
        title: stage.title,
        description: stage.description,
        date: matchingHistory ? matchingHistory.createdAt.toISOString() : null,
        completed: idx <= stageReachedIndex,
        current: idx === stageReachedIndex,
      };
    });

    // Mapeo de presupuesto
    const activeVersion = order.budget?.currentVersion ?? order.budget?.versions[0] ?? null;
    let budgetDto: PublicTrackingBudgetDto | null = null;

    if (activeVersion) {
      const isApprovedBudget = activeVersion.status === "APROBADO";
      const laborTotal = activeVersion.laborLines
        .filter((l) => !isApprovedBudget || l.isApproved)
        .reduce((acc, l) => acc + Number(l.lineTotal), 0);
      const partsTotal = activeVersion.partLines
        .filter((p) => !isApprovedBudget || p.isApproved)
        .reduce((acc, p) => acc + Number(p.lineTotal), 0);

      budgetDto = {
        id: activeVersion.id,
        versionNumber: activeVersion.versionNumber,
        status: activeVersion.status,
        laborSubtotal: laborTotal,
        partsSubtotal: partsTotal,
        totalEstimated: laborTotal + partsTotal,
        laborLines: activeVersion.laborLines.map((line) => ({
          id: line.id,
          description: line.description,
          estimatedMinutes: line.estimatedMinutes,
          hourlyRateCharged: Number(line.hourlyRateCharged),
          lineTotal: Number(line.lineTotal),
          approved: line.isApproved,
        })),
        partLines: activeVersion.partLines.map((part) => ({
          id: part.id,
          description: part.description,
          quantity: part.quantity,
          unitPriceCharged: Number(part.unitPriceCharged),
          lineTotal: Number(part.lineTotal),
          approved: part.isApproved,
        })),
      };
    }

    const data: PublicTrackingDto = {
      workOrderId: order.id,
      workOrderNumber: `OT-${order.id.slice(-6).toUpperCase()}`,
      status: order.status,
      openedAt: order.openedAt.toISOString(),
      estimatedCompletionDate: order.readyAt ? order.readyAt.toISOString() : null,
      vehicle: {
        make: order.vehicle.make,
        model: order.vehicle.model,
        modelYear: order.vehicle.modelYear,
        licensePlateMasked: maskPlate(order.vehicle.licensePlate),
        color: order.vehicle.color,
      },
      workshop: {
        name: order.workshop.name || WORKSHOP_METADATA.name,
        address: WORKSHOP_METADATA.address,
        phone: WORKSHOP_METADATA.phone,
        whatsapp: WORKSHOP_METADATA.whatsapp,
      },
      reception: order.intakeRecord
        ? {
            odometer: order.intakeRecord.odometerAtIntake,
            fuelLevel: order.intakeRecord.fuelLevel,
            customerComplaint: order.intakeRecord.customerComplaint,
            declaredBelongings: order.intakeRecord.declaredBelongings,
            damages: order.intakeRecord.damageMarks.map((dm) => ({
              id: dm.id,
              zone: dm.zone,
              damageType: dm.damageType,
              xPercent: Number(dm.xPercent),
              yPercent: Number(dm.yPercent),
              note: dm.note,
            })),
          }
        : null,
      timeline,
      budget: budgetDto,
    };

    return NextResponse.json(
      { success: true, data, meta: { requestId } },
      {
        status: 200,
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
