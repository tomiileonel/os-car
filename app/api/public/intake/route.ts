/**
 * OS-CAR — POST /api/public/intake
 * Ingreso auto-gestionado desde el portal web del cliente.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import {
  EMAIL_RE,
  FUEL_LEVELS,
  PHONE_E164_RE,
  PLATE_NORMALIZED_RE,
  VEHICLE_TYPES,
  normalizePhone,
  normalizePlate,
  getPrimaryWorkshopId,
  formatOrderNumber,
} from "@/lib/server/domain";
import { generateUniqueTrackingCode } from "@/lib/server/tracking";
import { hashTrackingToken } from "@/lib/tracking-token";

export const runtime = "nodejs";

const intakeSchema = z.object({
  fullName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  phoneE164: z.string().trim().regex(PHONE_E164_RE, "Teléfono inválido (formato E.164, ej: +543764123456)"),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().regex(EMAIL_RE, "Email inválido").optional(),
  ),
  vehicleType: z.enum(VEHICLE_TYPES),
  licensePlate: z
    .string()
    .trim()
    .min(1, "Ingresá la patente del vehículo")
    .max(20)
    .transform(normalizePlate)
    .refine((value) => PLATE_NORMALIZED_RE.test(value), "Patente inválida (5 a 10 caracteres alfanuméricos)"),
  make: z.string().trim().min(1, "Ingresá la marca").max(80),
  model: z.string().trim().min(1, "Ingresá el modelo").max(80),
  modelYear: z.coerce
    .number()
    .int("El año debe ser un número entero")
    .min(1886, "Año demasiado antiguo")
    .max(new Date().getFullYear() + 1, "Año inválido"),
  odometerAtIntake: z.coerce.number().int().min(0, "El odómetro no puede ser negativo"),
  fuelLevel: z.enum(FUEL_LEVELS),
  customerComplaint: z.string().trim().min(5, "Contán el motivo de la visita (mínimo 5 caracteres)").max(2000),
  visualChecklist: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
});

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, intakeSchema);

    const workshopId = await getPrimaryWorkshopId();
    const receptionist =
      (await db.adminUser.findFirst({
        where: { workshopId, active: true, role: "RECEPCIONISTA" },
      })) ??
      (await db.adminUser.findFirst({ where: { workshopId, active: true } }));
    if (!receptionist) {
      throw new HttpError(500, "INTERNAL_ERROR", "No hay usuarios activos en el taller para registrar el ingreso.");
    }

    const phoneNormalized = normalizePhone(body.phoneE164);
    const trackingCode = await generateUniqueTrackingCode();

    const result = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { workshopId_phoneNormalized: { workshopId, phoneNormalized } },
        create: {
          workshopId,
          fullName: body.fullName,
          phoneE164: body.phoneE164,
          phoneNormalized,
          email: body.email ?? null,
        },
        update: {
          fullName: body.fullName,
          phoneE164: body.phoneE164,
          ...(body.email !== undefined ? { email: body.email } : {}),
        },
      });

      const vehicle = await tx.vehicle.upsert({
        where: { workshopId_licensePlateNormalized: { workshopId, licensePlateNormalized: body.licensePlate } },
        create: {
          workshopId,
          customerId: customer.id,
          vehicleType: body.vehicleType,
          licensePlate: body.licensePlate,
          licensePlateNormalized: body.licensePlate,
          make: body.make,
          model: body.model,
          modelYear: body.modelYear,
        },
        update: {
          make: body.make,
          model: body.model,
          modelYear: body.modelYear,
          vehicleType: body.vehicleType,
        },
      });

      const order = await tx.workOrder.create({
        data: {
          workshopId,
          customerId: customer.id,
          vehicleId: vehicle.id,
          createdById: receptionist.id,
          trackingCodeHash: hashTrackingToken(trackingCode),
          status: "INGRESADO",
        },
      });

      const orderNumber = formatOrderNumber(order.id);

      await tx.intakeRecord.create({
        data: {
          workOrderId: order.id,
          odometerAtIntake: body.odometerAtIntake,
          fuelLevel: body.fuelLevel,
          customerComplaint: body.customerComplaint,
          intakeNotes: "Ingreso auto-gestionado desde el portal web del cliente.",
          declaredBelongings: body.visualChecklist.length > 0,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "CLIENTE",
          eventType: "INGRESO",
          toStatus: "INGRESADO",
          publicDescription: "Vehículo ingresado a través del portal web",
        },
      });

      await tx.outboxMessage.create({
        data: {
          workshopId,
          eventType: "NOTIFY_CLIENTE_INGRESO",
          idempotentKey: `notify-intake-${order.id}`,
          payload: {
            orderId: order.id,
            orderNumber,
            trackingCode,
            customerName: customer.fullName,
            customerPhone: customer.phoneE164,
          },
          status: "PENDING",
        },
      });

      return { trackingCode, orderNumber };
    });

    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
