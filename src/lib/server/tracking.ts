import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashTrackingToken } from "@/lib/tracking-token";
import { HttpError } from "./http";
import { TIMELINE_EVENT_LABELS, customerFirstName, formatOrderNumber } from "./domain";

/** Código de tracking: randomBytes(32) en base64url → 43 caracteres. */
export function generateTrackingCode(): string {
  return randomBytes(32).toString("base64url");
}

/** Igual que generateTrackingCode, verificando unicidad contra la DB. */
export async function generateUniqueTrackingCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateTrackingCode();
    const existing = await db.workOrder.findUnique({
      where: { trackingCodeHash: hashTrackingToken(code) },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new HttpError(500, "INTERNAL_ERROR", "No se pudo generar un código de seguimiento único.");
}

export interface TrackingLaborLineDTO {
  id: string;
  description: string;
  estimatedMinutes: number;
  lineTotal: number;
  isApproved: boolean;
}

export interface TrackingPartLineDTO {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isApproved: boolean;
}

export interface TrackingSnapshot {
  order: {
    orderNumber: string;
    status: string;
    openedAt: string;
    updatedAt: string;
    vehicle: { plate: string; make?: string; model?: string; color?: string; type?: string };
    customerFirstName: string;
  };
  timeline: Array<{ at: string; eventType: string; title: string; description: string }>;
  budget: {
    status: string;
    versionNumber: number;
    subtotalLabor: number;
    subtotalParts: number;
    total: number;
    laborLines: TrackingLaborLineDTO[];
    partLines: TrackingPartLineDTO[];
  } | null;
  blockers: Array<{ type: string; reason: string }>;
}

/** Snapshot público de la orden por trackingCode (timeline + presupuesto + bloqueos). */
export async function buildTrackingSnapshot(code: string): Promise<TrackingSnapshot> {
  const hash = hashTrackingToken(code);
  const order = await db.workOrder.findFirst({
    where: {
      OR: [
        { trackingCodeHash: hash },
        { id: code },
      ],
    },
    include: {
      vehicle: true,
      customer: true,
      statusHistory: {
        where: { publicVisible: true },
        orderBy: { createdAt: "desc" },
      },
      budget: {
        include: {
          currentVersion: { include: { laborLines: true, partLines: true } },
        },
      },
      blockers: { where: { isActive: true }, orderBy: { blockedAt: "asc" } },
    },
  });

  if (!order) {
    throw new HttpError(404, "TRACKING_NOT_FOUND", "El código de seguimiento no corresponde a ninguna orden.");
  }

  const version = order.budget?.currentVersion;
  const budgetVisible =
    version !== null &&
    version !== undefined &&
    (version.status === "PENDIENTE_APROBACION" || version.status === "APROBADO" || version.status === "RECHAZADO");

  return {
    order: {
      orderNumber: formatOrderNumber(order.id),
      status: order.status,
      openedAt: order.openedAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      vehicle: {
        plate: order.vehicle.licensePlate,
        make: order.vehicle.make ?? undefined,
        model: order.vehicle.model ?? undefined,
        color: order.vehicle.color ?? undefined,
        type: order.vehicle.vehicleType,
      },
      customerFirstName: customerFirstName(order.customer.fullName),
    },
    timeline: order.statusHistory.map((event) => ({
      at: event.createdAt.toISOString(),
      eventType: event.eventType,
      title: TIMELINE_EVENT_LABELS[event.eventType] ?? event.eventType,
      description: event.publicDescription,
    })),
    budget:
      version && budgetVisible
        ? {
            status: version.status,
            versionNumber: version.versionNumber,
            subtotalLabor: Number(version.subtotalLabor),
            subtotalParts: Number(version.subtotalParts),
            total: Number(version.totalEstimated),
            laborLines: version.laborLines.map((line) => ({
              id: line.id,
              description: line.description,
              estimatedMinutes: line.estimatedMinutes,
              lineTotal: Number(line.lineTotal),
              isApproved: line.isApproved,
            })),
            partLines: version.partLines.map((line) => ({
              id: line.id,
              description: line.description,
              quantity: line.quantity,
              unitPrice: Number(line.unitPriceCharged),
              lineTotal: Number(line.lineTotal),
              isApproved: line.isApproved,
            })),
          }
        : null,
    blockers: order.blockers.map((blocker) => ({ type: blocker.type, reason: blocker.reason })),
  };
}
