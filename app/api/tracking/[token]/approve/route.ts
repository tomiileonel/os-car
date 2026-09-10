import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashTrackingToken } from "@/lib/tracking-token";
import { clientIp } from "@/lib/client-ip";
import { memoryLimiter } from "@/lib/rate-limit";
import {
  DomainConflictException,
  NotFoundException,
  RateLimitException,
  ValidationException,
  toErrorEnvelope,
} from "@/shared/errors";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { decideBudgetVersion, type BudgetApprovalPrismaClient } from "@/server/services/budget-approval.service";
import type { BudgetDecisionInput, BudgetDecisionResultDto } from "@/lib/api-client";

export const runtime = "nodejs";

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  const ip = clientIp(request);

  // Rate limiting público para decisiones (10 req / 10 min por IP)
  const rateLimit = memoryLimiter.record(
    `public-tracking-approve:${ip}`,
    10,
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
      throw new NotFoundException("TRACKING_NOT_FOUND", "Enlace de seguimiento inválido.");
    }

    const tokenHash = hashTrackingToken(token.trim());

    const order = await prisma.workOrder.findFirst({
      where: {
        trackingCodeHash: tokenHash,
        trackingCodeRevokedAt: null,
        deletedAt: null,
      },
      include: {
        vehicle: true,
        budget: {
          include: {
            currentVersion: {
              include: { laborLines: true, partLines: true },
            },
            versions: {
              where: { status: "PENDIENTE_APROBACION" },
              orderBy: { versionNumber: "desc" },
              take: 1,
              include: { laborLines: true, partLines: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        "TRACKING_NOT_FOUND",
        "No se encontró una orden de trabajo activa vinculada a este enlace.",
      );
    }

    const body = (await request.json().catch(() => ({}))) as BudgetDecisionInput;

    const targetVersion =
      order.budget?.versions[0] ??
      (order.budget?.currentVersion?.status === "PENDIENTE_APROBACION"
        ? order.budget.currentVersion
        : null);

    if (!targetVersion) {
      if (order.budget?.currentVersion?.status === "APROBADO") {
        throw new DomainConflictException(
          "BUDGET_NOT_DECIDABLE",
          "El presupuesto vigente ya ha sido aprobado previamente.",
        );
      }
      throw new ValidationException(
        "NO_PENDING_BUDGET",
        "No existe un presupuesto pendiente de aprobación para esta orden.",
      );
    }

    // Determinar decisión: si explícita, usarla; si hay items aprobados -> APROBADO; si solo rechazados -> RECHAZADO
    const isExplicitReject = body.decision === "RECHAZADO";
    const decision = isExplicitReject ? "RECHAZADO" : "APROBADO";

    const approvedItemIds = body.approvedItemIds ?? [];
    const rejectedItemIds = body.rejectedItemIds ?? [];

    // Calcular montos
    let totalApproved = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    const allLines = [
      ...targetVersion.laborLines.map((l) => ({ id: l.id, lineTotal: Number(l.lineTotal) })),
      ...targetVersion.partLines.map((p) => ({ id: p.id, lineTotal: Number(p.lineTotal) })),
    ];

    if (decision === "APROBADO") {
      for (const line of allLines) {
        if (rejectedItemIds.includes(line.id)) {
          rejectedCount++;
        } else {
          // Si no está explícitamente rechazado, se aprueba
          totalApproved += line.lineTotal;
          approvedCount++;
        }
      }
    } else {
      rejectedCount = allLines.length;
    }

    // Ejecutar el servicio formal de aprobación de presupuestos
    await decideBudgetVersion(prisma as unknown as BudgetApprovalPrismaClient, {
      workshopId: order.workshopId,
      workOrderId: order.id,
      budgetVersionId: targetVersion.id,
      decision,
      actorType: "CLIENTE",
      ipHash: ip,
      rejectionReason: decision === "RECHAZADO" ? (body.notes || "Rechazado por cliente desde portal público") : undefined,
    });

    // Transición de orden y registro del evento APROBACION_CLIENTE_WEB
    const newStatus = decision === "APROBADO" ? "EN_REPARACION" : order.status;

    if (decision === "APROBADO") {
      await prisma.workOrder.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          repairStartedAt: new Date(),
        },
      });

      await prisma.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "CLIENTE",
          eventType: "APROBACION_CLIENTE_WEB",
          toStatus: newStatus,
          publicVisible: true,
          publicDescription: `Presupuesto aprobado por el cliente vía portal público (${approvedCount} ítems aprobados).`,
          metadata: {
            approvedItemIds,
            rejectedItemIds,
            totalApprovedAmount: totalApproved,
            notes: body.notes ?? null,
          },
        },
      });
    }

    const result: BudgetDecisionResultDto = {
      workOrderId: order.id,
      budgetVersionId: targetVersion.id,
      decision,
      newStatus,
      totalApprovedAmount: totalApproved,
      approvedItemsCount: approvedCount,
      rejectedItemsCount: rejectedCount,
      decidedAt: new Date().toISOString(),
      message:
        decision === "APROBADO"
          ? "¡Presupuesto aprobado con éxito! Tu vehículo ya ingresó en etapa de reparación."
          : "Presupuesto rechazado. Tu asesor de servicio se pondrá en contacto a la brevedad.",
    };

    return NextResponse.json(
      { success: true, data: result, meta: { requestId } },
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
