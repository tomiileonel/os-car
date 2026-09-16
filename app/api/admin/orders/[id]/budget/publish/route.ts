/**
 * OS-CAR — POST /api/admin/orders/[id]/budget/publish
 * Publica (o republica) el presupuesto al cliente desde los ítems actuales.
 */
import { db } from "@/lib/db";
import { ok, handleApiError, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { round2, formatOrderNumber } from "@/lib/server/domain";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { admin } = await requireAdmin();
    const { id } = await params;

    const order = await db.workOrder.findFirst({
      where: { id, workshopId: admin.workshopId },
      include: {
        workItems: true,
        partItems: true,
        budget: { include: { versions: true, currentVersion: true } },
      },
    });
    if (!order) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "No encontramos la orden solicitada.");
    }

    const current = order.budget?.currentVersion ?? null;
    if (current && (current.status === "PENDIENTE_APROBACION" || current.status === "APROBADO")) {
      throw new HttpError(
        409,
        "BUDGET_ALREADY_PUBLISHED",
        "Ya hay un presupuesto publicado o aprobado para esta orden. No se puede publicar otro.",
      );
    }

    const nextVersionNumber =
      (order.budget?.versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) ?? 0) + 1;

    const laborLines = order.workItems
      .filter((item) => item.status !== "CANCELADO")
      .map((item) => ({
        description: item.description,
        estimatedMinutes: item.estimatedMinutes,
        hourlyRateCharged: item.hourlyRateCharged,
        lineTotal: round2((item.estimatedMinutes / 60) * Number(item.hourlyRateCharged)),
      }));

    const partLines = order.partItems
      .filter((item) => item.status !== "CANCELADO")
      .map((item) => ({
        partNumber: item.partNumber,
        description: item.description,
        quantity: item.quantity,
        unitPriceCharged: item.unitPriceCharged,
        lineTotal: round2(item.quantity * Number(item.unitPriceCharged)),
      }));

    if (laborLines.length === 0 && partLines.length === 0) {
      throw new HttpError(
        409,
        "BUDGET_EMPTY",
        "La orden no tiene trabajos ni repuestos activos para presupuestar.",
      );
    }

    const subtotalLabor = round2(laborLines.reduce((acc, line) => acc + line.lineTotal, 0));
    const subtotalParts = round2(partLines.reduce((acc, line) => acc + line.lineTotal, 0));
    const totalEstimated = round2(subtotalLabor + subtotalParts);
    const now = new Date();

    const status = await db.$transaction(async (tx) => {
      const budget =
        order.budget ??
        (await tx.budget.create({
          data: { workOrderId: order.id },
        }));

      // Versiones rechazadas quedan SUPERSEDED
      await tx.budgetVersion.updateMany({
        where: { budgetId: budget.id, status: "RECHAZADO" },
        data: { status: "SUPERSEDED" },
      });

      // Bloqueadores de presupuesto previos sin resolver se cierran
      await tx.orderBlocker.updateMany({
        where: { workOrderId: order.id, type: "APROBACION_PRESUPUESTO", isActive: true },
        data: { isActive: false, resolvedAt: now, resolutionNotes: "Superado por una nueva versión del presupuesto" },
      });

      const version = await tx.budgetVersion.create({
        data: {
          budgetId: budget.id,
          versionNumber: nextVersionNumber,
          status: "PENDIENTE_APROBACION",
          subtotalLabor,
          subtotalParts,
          totalEstimated,
          publishedAt: now,
          laborLines: {
            create: laborLines.map((line) => ({
              description: line.description,
              estimatedMinutes: line.estimatedMinutes,
              hourlyRateCharged: line.hourlyRateCharged,
              lineTotal: line.lineTotal,
              isApproved: false,
            })),
          },
          partLines: {
            create: partLines.map((line) => ({
              partNumber: line.partNumber,
              description: line.description,
              quantity: line.quantity,
              unitPriceCharged: line.unitPriceCharged,
              lineTotal: line.lineTotal,
              isApproved: false,
            })),
          },
        },
      });

      await tx.budget.update({ where: { id: budget.id }, data: { currentVersionId: version.id } });

      await tx.orderBlocker.create({
        data: {
          workshopId: order.workshopId,
          workOrderId: order.id,
          type: "APROBACION_PRESUPUESTO",
          reason: `Presupuesto v${nextVersionNumber} publicado. Esperando aprobación del cliente.`,
          blockedByUserId: admin.id,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "PRESUPUESTO_PUBLICADO",
          toStatus: order.status,
          publicDescription: `Presupuesto v${nextVersionNumber} publicado y enviado al cliente`,
        },
      });

      await tx.outboxMessage.create({
        data: {
          workshopId: order.workshopId,
          eventType: "NOTIFY_CLIENTE_PRESUPUESTO",
          idempotentKey: `notify-budget-${version.id}`,
          payload: {
            orderId: order.id,
            orderNumber: formatOrderNumber(order.id),
            trackingCode: order.trackingCodeHash,
            versionNumber: nextVersionNumber,
            total: totalEstimated,
          },
          status: "PENDING",
        },
      });

      return version.status;
    });

    return ok({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
