import { prisma } from "@/lib/prisma";
import { createTrackingToken, hashTrackingToken } from "@/lib/tracking-token";
import { DomainConflictException, ValidationException } from "@/shared/errors";
import type { PublicIntakeInput } from "@/shared/schemas";

export interface PublicIntakeResult {
  trackingToken: string;
  trackingUrl: string;
  workOrderId: string;
}

function configuredWorkshopId(): string {
  const workshopId = process.env.OSCAR_WORKSHOP_ID?.trim();
  if (!workshopId) {
    throw new ValidationException(
      "WORKSHOP_NOT_CONFIGURED",
      "El taller no está configurado para recibir altas públicas."
    );
  }
  return workshopId;
}

function normalizePhone(phoneE164: string): string {
  return phoneE164.replace(/\D/g, "");
}

function isActiveOrderUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };

  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return (
      target.includes("vehicleId") &&
      target.every((field) => field === "vehicleId" || field === "workshopId")
    );
  }

  if (typeof target === "string") {
    return (
      target === "work_orders_one_active_per_vehicle" ||
      target === "work_order_one_active_per_vehicle"
    );
  }

  return false;
}

export async function registerPublicIntake(input: PublicIntakeInput): Promise<PublicIntakeResult> {
  const workshopId = configuredWorkshopId();
  const trackingToken = createTrackingToken();
  const trackingCodeHash = hashTrackingToken(trackingToken);
  const phoneNormalized = normalizePhone(input.phoneE164);

  let workOrder: { id: string };

  try {
    workOrder = await prisma.$transaction(async (tx) => {
      const existingCustomer = await tx.customer.findFirst({
        where: { workshopId, phoneNormalized, deletedAt: null },
        select: { id: true },
      });

      const customer = existingCustomer
        ? existingCustomer
        : await tx.customer.create({
            data: {
              workshopId,
              fullName: input.fullName,
              phoneE164: input.phoneE164,
              phoneNormalized,
              email: input.email ?? null,
            },
            select: { id: true },
          });

      const existingVehicle = await tx.vehicle.findFirst({
        where: { workshopId, licensePlateNormalized: input.licensePlate, deletedAt: null },
        select: { id: true, customerId: true },
      });

      if (existingVehicle && existingVehicle.customerId !== customer.id) {
        throw new DomainConflictException(
          "LICENSE_PLATE_EXISTS",
          "La patente ya está registrada con otro cliente del taller.",
          { licensePlate: input.licensePlate }
        );
      }

      const vehicle = existingVehicle
        ? existingVehicle
        : await tx.vehicle.create({
            data: {
              workshopId,
              customerId: customer.id,
              vehicleType: input.vehicleType,
              licensePlate: input.licensePlate,
              licensePlateNormalized: input.licensePlate,
              make: input.make,
              model: input.model,
              modelYear: input.modelYear,
            },
            select: { id: true },
          });

      const activeOrder = await tx.workOrder.findFirst({
        where: {
          workshopId,
          vehicleId: vehicle.id,
          deletedAt: null,
          status: { notIn: ["ENTREGADO", "CANCELADA"] },
        },
        select: { id: true, status: true },
      });

      if (activeOrder) {
        throw new DomainConflictException(
          "ACTIVE_ORDER_EXISTS_FOR_VEHICLE",
          "El vehículo ya tiene una orden de trabajo activa en el taller.",
          { vehicleId: vehicle.id, workOrderId: activeOrder.id, status: activeOrder.status }
        );
      }

      return tx.workOrder.create({
        data: {
          workshopId,
          customerId: customer.id,
          vehicleId: vehicle.id,
          trackingCodeHash,
          status: "INGRESADO",
          intakeRecord: {
            create: {
              odometerAtIntake: input.odometerAtIntake,
              fuelLevel: input.fuelLevel,
              customerComplaint: input.customerComplaint,
            },
          },
          statusHistory: {
            create: {
              actorType: "CLIENTE",
              eventType: "INGRESO",
              toStatus: "INGRESADO",
              publicVisible: true,
              publicDescription: "Ingreso registrado. El taller recibió los datos del vehículo.",
            },
          },
        },
        select: { id: true },
      });
    });
  } catch (error) {
    if (isActiveOrderUniqueViolation(error)) {
      throw new DomainConflictException(
        "ACTIVE_ORDER_EXISTS_FOR_VEHICLE",
        "El vehículo ya tiene una orden de trabajo activa en el taller.",
        { licensePlate: input.licensePlate }
      );
    }
    throw error;
  }

  return {
    trackingToken,
    trackingUrl: `/seguimiento?token=${encodeURIComponent(trackingToken)}`,
    workOrderId: workOrder.id,
  };
}
