import { prisma } from "@/lib/prisma";
import { hashTrackingToken } from "@/lib/tracking-token";
import { NotFoundException } from "@/shared/errors";

export interface PublicTrackingResult {
  vehicle: {
    make: string | null;
    model: string | null;
    modelYear: number | null;
    licensePlateMasked: string;
  };
  status: string;
  costs: {
    laborSubtotal: string;
    partsSubtotal: string;
    totalEstimated: string;
    totalFinal: string;
  };
  workItems: ReadonlyArray<{ description: string; status: string }>;
  partItems: ReadonlyArray<{ description: string; quantity: number; status: string }>;
  timeline: ReadonlyArray<{
    eventType: string;
    description: string;
    createdAt: string;
  }>;
}

function maskLicensePlate(licensePlate: string): string {
  if (licensePlate.length <= 3) return "***";
  return `${"*".repeat(Math.max(1, licensePlate.length - 3))}${licensePlate.slice(-3)}`;
}

export async function getPublicTrackingOrder(token: string): Promise<PublicTrackingResult> {
  const order = await prisma.workOrder.findFirst({
    where: {
      trackingCodeHash: hashTrackingToken(token),
      trackingCodeRevokedAt: null,
      deletedAt: null,
    },
    select: {
      status: true,
      laborSubtotal: true,
      partsSubtotal: true,
      totalEstimated: true,
      totalFinal: true,
      vehicle: {
        select: {
          make: true,
          model: true,
          modelYear: true,
          licensePlate: true,
        },
      },
      workItems: {
        where: { deletedAt: null },
        select: { description: true, status: true },
        orderBy: { createdAt: "asc" },
      },
      partItems: {
        where: { deletedAt: null },
        select: { description: true, quantity: true, status: true },
        orderBy: { createdAt: "asc" },
      },
      statusHistory: {
        where: { publicVisible: true },
        select: { eventType: true, publicDescription: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!order) {
    throw new NotFoundException(
      "TRACKING_NOT_FOUND",
      "No encontramos una orden activa con ese acceso de seguimiento."
    );
  }

  return {
    vehicle: {
      make: order.vehicle.make,
      model: order.vehicle.model,
      modelYear: order.vehicle.modelYear,
      licensePlateMasked: maskLicensePlate(order.vehicle.licensePlate),
    },
    status: order.status,
    costs: {
      laborSubtotal: order.laborSubtotal.toFixed(2),
      partsSubtotal: order.partsSubtotal.toFixed(2),
      totalEstimated: order.totalEstimated.toFixed(2),
      totalFinal: order.totalFinal.toFixed(2),
    },
    workItems: order.workItems,
    partItems: order.partItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      status: item.status,
    })),
    timeline: order.statusHistory.map((event) => ({
      eventType: event.eventType,
      description: event.publicDescription,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
