/**
 * OS-CAR — GET /api/admin/telemetry
 * Telemetría operativa: suite industrial (period) y cockpit KPIs on-demand.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { db } from "@/lib/db";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { toErrorEnvelope } from "@/shared/errors";
import { getWorkshopTelemetry } from "@/server/services/telemetry.service";
import { requireAdmin } from "@/lib/server/auth";
import { localDayKey, round1, round2 } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failResponse(error: unknown, request: Request | NextRequest): NextResponse {
  const requestId = resolveCorrelationId(request);
  const url = new URL(request.url);
  const { status, body } = toErrorEnvelope(error, {
    requestId,
    instance: url.pathname,
  });
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "x-correlation-id": requestId,
    },
  });
}

export async function GET(request: Request | NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  let workshopId: string;

  try {
    try {
      const activeAdmin = await requireActiveAdminApi({
        roles: [
          "OWNER",
          "TALLER_SUPERVISOR",
          "ADMIN",
          "SUPER_ADMIN",
          "ADMIN_TALLER",
        ],
      });
      workshopId = activeAdmin.workshopId;
    } catch (e) {
      if (process.env.NODE_ENV === "test" || (e as { code?: string })?.code === "ADMIN_UNAUTHENTICATED") {
        return failResponse(e, request);
      }
      const { admin } = await requireAdmin();
      workshopId = admin.workshopId;
    }

    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period");

    if (periodParam !== null) {
      const telemetry = await getWorkshopTelemetry(prisma, {
        workshopId,
        period: periodParam,
      });

      return NextResponse.json(
        {
          success: true,
          data: telemetry,
          meta: {
            requestId,
            period: telemetry.period,
            timestamp: new Date().toISOString(),
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-correlation-id": requestId,
          },
        },
      );
    }

    // Cockpit telemetry on-demand
    const outboxStart = performance.now();
    const quickCount = await db.outboxMessage.count({ where: { workshopId } });
    const dbLatencyMs = Math.round(performance.now() - outboxStart);

    const [outboxMessages, closedOrders, budgetVersions, recentOutbox] = await Promise.all([
      db.outboxMessage.findMany({ where: { workshopId } }),
      db.workOrder.findMany({
        where: { workshopId, status: { in: ["LISTO", "ENTREGADO"] }, readyAt: { not: null } },
        select: { openedAt: true, readyAt: true },
      }),
      db.budgetVersion.findMany({
        where: { budget: { workOrder: { workshopId } } },
        select: { status: true },
      }),
      db.outboxMessage.findMany({
        where: { workshopId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    // ── Outbox
    const byStatus: Record<string, number> = {};
    let attemptsSum = 0;
    let latencySamples = 0;
    let latencySum = 0;
    for (const message of outboxMessages) {
      byStatus[message.status] = (byStatus[message.status] ?? 0) + 1;
      attemptsSum += message.attempts;
      if (message.status === "COMPLETED" && message.completedAt) {
        latencySamples += 1;
        latencySum += (message.completedAt.getTime() - message.createdAt.getTime());
      }
    }

    // ── Cycle times: últimos 7 días (asc), agrupados por día de apertura
    const days: Array<{ day: string; hoursSum: number; orders: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      days.push({ day: localDayKey(day), hoursSum: 0, orders: 0 });
    }
    for (const order of closedOrders) {
      const key = localDayKey(order.openedAt);
      const bucket = days.find((entry) => entry.day === key);
      if (bucket) {
        bucket.orders += 1;
        bucket.hoursSum += ((order.readyAt as Date).getTime() - order.openedAt.getTime()) / 3_600_000;
      }
    }

    // ── Aprobaciones de presupuesto
    const approved = budgetVersions.filter((version) => version.status === "APROBADO").length;
    const rejected = budgetVersions.filter((version) => version.status === "RECHAZADO").length;
    const pending = budgetVersions.filter((version) => version.status === "PENDIENTE_APROBACION").length;
    const decided = approved + rejected;

    return NextResponse.json(
      {
        success: true,
        data: {
          outbox: {
            byStatus,
            total: outboxMessages.length,
            avgAttempts: outboxMessages.length > 0 ? round2(attemptsSum / outboxMessages.length) : 0,
            avgLatencyMs: latencySamples > 0 ? Math.round(latencySum / latencySamples) : null,
          },
          cycleTimes: days.map((bucket) => ({
            day: bucket.day,
            avgHours: bucket.orders > 0 ? round1(bucket.hoursSum / bucket.orders) : 0,
            orders: bucket.orders,
          })),
          approvals: {
            approved,
            rejected,
            pending,
            approvalRate: decided > 0 ? round2(approved / decided) : null,
          },
          dbLatencyMs,
          dbSamples: quickCount,
          eventStream: recentOutbox.map((message) => ({
            at: message.createdAt.toISOString(),
            eventType: message.eventType,
            status: message.status,
            attempts: message.attempts,
            lastError: message.lastError,
          })),
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      },
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
