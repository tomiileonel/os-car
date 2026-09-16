/**
 * OS-CAR — /api/admin/orders
 * GET  → lista con filtros status / q (orderNumber, cliente, patente).
 * POST → recepción rápida desde el mostrador.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import {
  FUEL_LEVELS,
  ORDER_STATUSES,
  PHONE_E164_RE,
  PLATE_NORMALIZED_RE,
  VEHICLE_TYPES,
  normalizePhone,
  normalizePlate,
  nextOrderNumber,
  formatOrderNumber,
  vehicleLabel,
} from "@/lib/server/domain";
import { generateUniqueTrackingCode } from "@/lib/server/tracking";
import { hashTrackingToken } from "@/lib/tracking-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─────────────────────────── GET (lista) ─────────────────────────── */

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const url = new URL(request.url);
    const statusParam = (url.searchParams.get("status") ?? "").trim();
    const q = (url.searchParams.get("q") ?? "").trim();

    if (statusParam !== "" && !ORDER_STATUSES.includes(statusParam as (typeof ORDER_STATUSES)[number])) {
      throw new HttpError(400, "VALIDATION_ERROR", "Estado de orden inválido.");
    }

    const where: Prisma.WorkOrderWhereInput = { workshopId: admin.workshopId };
    if (statusParam !== "") where.status = statusParam as any;
    if (q !== "") {
      where.OR = [
        { id: { contains: q, mode: "insensitive" } },
        { customer: { fullName: { contains: q, mode: "insensitive" } } },
        { vehicle: { licensePlateNormalized: { contains: q.toUpperCase() } } },
      ];
    }

    const [orders, total] = await Promise.all([
      db.workOrder.findMany({
        where,
        include: {
          customer: { select: { fullName: true } },
          vehicle: true,
          bayAssignments: {
            where: { releasedAt: null },
            include: { bay: { select: { code: true } } },
            orderBy: { assignedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { openedAt: "desc" },
      }),
      db.workOrder.count({ where }),
    ]);

    const items = orders.map((order) => ({
      id: order.id,
      orderNumber: formatOrderNumber(order.id),
      status: order.status,
      plate: order.vehicle.licensePlate,
      vehicle: vehicleLabel(order.vehicle),
      customer: order.customer.fullName,
      bayCode: order.bayAssignments[0]?.bay.code ?? null,
      openedAt: order.openedAt.toISOString(),
      totalEstimated: Number(order.totalEstimated),
    }));

    return ok({ items, total });
  } catch (error) {
    return handleApiError(error);
  }
}

/* ─────────────────────────── POST (recepción) ─────────────────────────── */

const createOrderSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  vehicleId: z.string().trim().min(1).optional(),
  customer: z
    .object({
      fullName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
      phoneE164: z.string().trim().regex(PHONE_E164_RE, "Teléfono inválido (formato E.164)"),
    })
    .optional(),
  vehicle: z
    .object({
      licensePlate: z
        .string()
        .trim()
        .min(1, "Ingresá la patente")
        .max(20)
        .transform(normalizePlate)
        .refine((value) => PLATE_NORMALIZED_RE.test(value), "Patente inválida (5 a 10 caracteres alfanuméricos)"),
      make: z.string().trim().min(1, "Ingresá la marca").max(80),
      model: z.string().trim().min(1, "Ingresá el modelo").max(80),
      vehicleType: z.enum(VEHICLE_TYPES),
    })
    .optional(),
  customerComplaint: z.string().trim().min(5, "Contá el motivo del ingreso (mínimo 5 caracteres)").max(2000),
  odometerAtIntake: z.coerce.number().int().min(0, "El odómetro no puede ser negativo"),
  fuelLevel: z.enum(FUEL_LEVELS),
  bayId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const body = await parseBody(request, createOrderSchema);

    if (!body.customerId && !body.customer) {
      throw new HttpError(400, "VALIDATION_ERROR", "Faltan datos del cliente: envía customerId o customer.");
    }
    if (!body.vehicleId && !body.vehicle) {
      throw new HttpError(400, "VALIDATION_ERROR", "Faltan datos del vehículo: envía vehicleId o vehicle.");
    }

    const workshopId = admin.workshopId;

    // Cliente existente o upsert por teléfono
    let customerId: string | null = null;
    if (body.customerId) {
      const customer = await db.customer.findFirst({ where: { id: body.customerId, workshopId }, select: { id: true } });
      if (!customer) throw new HttpError(404, "CUSTOMER_NOT_FOUND", "El cliente no existe en este taller.");
      customerId = customer.id;
    } else if (body.customer) {
      const phoneNormalized = normalizePhone(body.customer.phoneE164);
      const customer = await db.customer.upsert({
        where: { workshopId_phoneNormalized: { workshopId, phoneNormalized } },
        create: {
          workshopId,
          fullName: body.customer.fullName,
          phoneE164: body.customer.phoneE164,
          phoneNormalized,
        },
        update: { fullName: body.customer.fullName, phoneE164: body.customer.phoneE164 },
      });
      customerId = customer.id;
    }

    // Vehículo existente o upsert por patente
    let vehicleId: string | null = null;
    if (body.vehicleId) {
      const vehicle = await db.vehicle.findFirst({ where: { id: body.vehicleId, workshopId }, select: { id: true } });
      if (!vehicle) throw new HttpError(404, "VEHICLE_NOT_FOUND", "El vehículo no existe en este taller.");
      vehicleId = vehicle.id;
    } else if (body.vehicle) {
      const vehicle = await db.vehicle.upsert({
        where: { workshopId_licensePlateNormalized: { workshopId, licensePlateNormalized: body.vehicle.licensePlate } },
        create: {
          workshopId,
          customerId: customerId as string,
          vehicleType: body.vehicle.vehicleType,
          licensePlate: body.vehicle.licensePlate,
          licensePlateNormalized: body.vehicle.licensePlate,
          make: body.vehicle.make,
          model: body.vehicle.model,
        },
        update: {
          customerId: customerId as string,
          make: body.vehicle.make,
          model: body.vehicle.model,
          vehicleType: body.vehicle.vehicleType,
        },
      });
      vehicleId = vehicle.id;
    }

    // Bahía (opcional)
    let bayId: string | null = null;
    if (body.bayId) {
      const bay = await db.bay.findFirst({ where: { id: body.bayId, workshopId } });
      if (!bay) throw new HttpError(404, "BAY_NOT_FOUND", "La bahía indicada no existe.");
      if (!bay.isEnabled) throw new HttpError(409, "BAY_DISABLED", "La bahía está deshabilitada.");
      const activeOnBay = await db.bayAssignment.findFirst({ where: { bayId: bay.id, releasedAt: null }, select: { id: true } });
      if (activeOnBay) throw new HttpError(409, "BAY_OCCUPIED", "La bahía ya tiene un vehículo asignado.");
      bayId = bay.id;
    }

    const trackingCode = await generateUniqueTrackingCode();

    const created = await db.$transaction(async (tx) => {
      const order = await tx.workOrder.create({
        data: {
          workshopId,
          customerId: customerId as string,
          vehicleId: vehicleId as string,
          createdById: admin.id,
          trackingCodeHash: hashTrackingToken(trackingCode),
          status: "INGRESADO",
        },
      });

      await tx.intakeRecord.create({
        data: {
          workOrderId: order.id,
          odometerAtIntake: body.odometerAtIntake,
          fuelLevel: body.fuelLevel,
          customerComplaint: body.customerComplaint,
          intakeNotes: `Recepción rápida por ${admin.displayName}.`,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: "ADMIN",
          actorAdminId: admin.id,
          eventType: "INGRESO",
          toStatus: "INGRESADO",
          publicDescription: "Vehículo ingresado por mostrador de recepción",
        },
      });

      if (bayId) {
        const bay = await tx.bay.findUniqueOrThrow({ where: { id: bayId } });
        await tx.bayAssignment.create({
          data: { bayId, workOrderId: order.id, assignedById: admin.id },
        });
        await tx.bay.update({ where: { id: bayId }, data: { status: "OCUPADA" } });
        await tx.statusHistory.create({
          data: {
            workOrderId: order.id,
            actorType: "ADMIN",
            actorAdminId: admin.id,
            eventType: "BAHIA_ASIGNADA",
            toStatus: "INGRESADO",
            publicDescription: `Vehículo asignado a bahía ${bay.code}`,
          },
        });
      }

      return { id: order.id, orderNumber: formatOrderNumber(order.id) };
    });

    return ok(created);
  } catch (error) {
    return handleApiError(error);
  }
}
