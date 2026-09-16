/**
 * OS-CAR — POST /api/public/budget/[code]/decide
 * Aprobación / rechazo del presupuesto desde el portal web del cliente.
 */
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { round2 } from "@/lib/server/domain";
import { hashTrackingToken } from "@/lib/tracking-token";

export const runtime = "nodejs";

const decideSchema = z.object({
  decision: z.enum(["APROBADO", "RECHAZADO"]),
  laborLineIds: z.array(z.string().min(1)).default([]),
  partLineIds: z.array(z.string().min(1)).default([]),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await parseBody(request, decideSchema);

    const decoded = decodeURIComponent(code);
    const hash = hashTrackingToken(decoded);
    const order = await db.workOrder.findFirst({
      where: {
        OR: [
          { trackingCodeHash: hash },
          { id: decoded },
        ],
      },
      include: {
        customer: true,
        budget: { include: { currentVersion: { include: { laborLines: true, partLines: true } } } },
      },
    });
    if (!order) {
      throw new HttpError(404, "TRACKING_NOT_FOUND", "El código de seguimiento no corresponde a ninguna orden.");
    }

    const version = order.budget?.currentVersion;
    if (!version || version.status !== "PENDIENTE_APROBACION") {
      throw new HttpError(409, "BUDGET_NOT_PENDING", "El presupuesto de esta orden no está pendiente de aprobación.");
    }

    const now = new Date();
    const status = await db.$transaction(async (tx) => {
      if (body.decision === "APROBADO") {
        const laborIds = new Set(body.laborLineIds);
        const partIds = new Set(body.partLineIds);

        for (const line of version.laborLines) {
          await tx.budgetLaborLine.update({ where: { id: line.id }, data: { isApproved: laborIds.has(line.id) } });
        }
        for (const line of version.partLines) {
          await tx.budgetPartLine.update({ where: { id: line.id }, data: { isApproved: partIds.has(line.id) } });
        }

        await tx.budgetVersion.update({
          where: { id: version.id },
          data: { status: "APROBADO", approvedAt: now },
        });

        const approvalHash = createHash("sha256").update(JSON.stringify({ id: version.id, at: now.toISOString() })).digest("hex");
        await tx.budgetApproval.create({
          data: {
            budgetVersionId: version.id,
            actorType: "CLIENTE",
            decision: "APROBADO",
            contentHash: approvalHash,
            reason: body.reason ?? null,
            decidedAt: now,
          },
        });

        await tx.orderBlocker.updateMany({
          where: { workOrderId: order.id, type: "APROBACION_PRESUPUESTO", isActive: true },
          data: { isActive: false, resolvedAt: now, resolutionNotes: "Cliente aprobó el presupuesto desde el portal web" },
        });

        const laborSubtotal = round2(
          version.laborLines.filter((line) => laborIds.has(line.id)).reduce((acc, line) => acc + Number(line.lineTotal), 0),
        );
        const partsSubtotal = round2(
          version.partLines.filter((line) => partIds.has(line.id)).reduce((acc, line) => acc + Number(line.lineTotal), 0),
        );

        const nextOrderStatus =
          order.status === "DIAGNOSTICO" || order.status === "ESPERANDO_REPARACION"
            ? "ESPERANDO_REPARACION"
            : order.status;

        await tx.workOrder.update({
          where: { id: order.id },
          data: {
            status: nextOrderStatus,
            laborSubtotal,
            partsSubtotal,
            totalEstimated: round2(laborSubtotal + partsSubtotal),
          },
        });

        await tx.statusHistory.create({
          data: {
            workOrderId: order.id,
            actorType: "CLIENTE",
            eventType: "APROBACION_CLIENTE_WEB",
            fromStatus: order.status,
            toStatus: nextOrderStatus,
            publicDescription: "Cliente aprobó el presupuesto desde el portal",
          },
        });

        return "APROBADO" as const;
      }

      // RECHAZADO
      await tx.budgetVersion.update({
        where: { id: version.id },
        data: {
          status: "RECHAZADO",
          rejectedAt: now,
          rejectionReason: body.reason ?? "Cliente rechazó el presupuesto desde el portal web.",
        },
      });

      const rejectionHash = createHash("sha256").update(JSON.stringify({ id: version.id, at: now.toISOString(), rejected: true })).digest("hex");
      await tx.budgetApproval.create({
        data: {
          budgetVersionId: version.id,
          actorType: "CLIENTE",
          decision: "RECHAZADO",
          contentHash: rejectionHash,
          reason: body.reason ?? null,
          decidedAt: now,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "CLIENTE",
          eventType: "PRESUPUESTO_RECHAZADO",
          fromStatus: order.status,
          toStatus: order.status,
          publicDescription: "Cliente rechazó el presupuesto desde el portal web",
        },
      });

      return "RECHAZADO" as const;
    });

    return ok({ status });
  } catch (error) {
    return handleApiError(error);
  }
}
