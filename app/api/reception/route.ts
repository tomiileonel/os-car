import { NextRequest, NextResponse } from "next/server";
import type { DamageType, FuelLevel, VehicleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import { createTrackingToken, hashTrackingToken } from "@/lib/tracking-token";
import {
  DomainConflictException,
  ValidationException,
  toErrorEnvelope,
} from "@/shared/errors";
import type {
  FastVehicleLookupDto,
  ReceptionDamageItemInput,
  ReceptionSummaryDto,
} from "@/lib/api-client";

const ALLOWED_ADMIN_ROLES = [
  "OWNER",
  "TALLER_SUPERVISOR",
  "ADMIN",
  "SUPER_ADMIN",
  "ADMIN_TALLER",
  "RECEPCIONISTA",
  "MECANICO",
] as const;

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

function normalizePlateString(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizePhoneString(raw: string): string {
  return raw.replace(/\D/g, "");
}

function parseFuelLevel(raw: unknown): FuelLevel {
  if (typeof raw !== "string") return "MITAD";
  const normalized = raw.trim().toUpperCase();
  switch (normalized) {
    case "VACIO":
    case "E":
    case "EMPTY":
    case "0":
      return "VACIO";
    case "CUARTO":
    case "1/4":
    case "0.25":
      return "CUARTO";
    case "MITAD":
    case "1/2":
    case "0.5":
    case "0.50":
      return "MITAD";
    case "TRES_CUARTOS":
    case "3/4":
    case "0.75":
      return "TRES_CUARTOS";
    case "LLENO":
    case "FULL":
    case "F":
    case "1/1":
    case "1":
      return "LLENO";
    default:
      return "MITAD";
  }
}

function parseDamageType(raw: string): DamageType {
  const norm = raw.trim().toUpperCase();
  if (norm === "RAYON" || norm === "ABOLLADURA" || norm === "ROTURA" || norm === "CRISTAL" || norm === "OTRO") {
    return norm as DamageType;
  }
  return "OTRO";
}

async function computeSha256Hex(content: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId } = await requireActiveAdminApi({
      roles: ALLOWED_ADMIN_ROLES,
    });

    const url = new URL(request.url);
    const rawPlate = url.searchParams.get("plate") ?? url.searchParams.get("search");

    if (!rawPlate || !rawPlate.trim()) {
      throw new ValidationException(
        "PLATE_REQUIRED",
        "El parámetro 'plate' es obligatorio para la búsqueda rápida de recepción.",
      );
    }

    const normalizedPlate = normalizePlateString(rawPlate);

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        workshopId,
        licensePlateNormalized: normalizedPlate,
        deletedAt: null,
      },
      include: {
        customer: true,
        workOrders: {
          where: { deletedAt: null },
          orderBy: { openedAt: "desc" },
          take: 5,
          include: {
            intakeRecord: true,
          },
        },
      },
    });

    if (!vehicle) {
      const emptyResult: FastVehicleLookupDto = {
        found: false,
        vehicle: null,
        customer: null,
        history: null,
        activeOrder: null,
      };
      return NextResponse.json(
        { success: true, data: emptyResult, meta: { requestId } },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "x-correlation-id": requestId,
          },
        },
      );
    }

    const activeOrder = vehicle.workOrders.find(
      (wo) => wo.status !== "ENTREGADO" && wo.status !== "CANCELADA",
    );
    const lastOrder = vehicle.workOrders[0];

    const result: FastVehicleLookupDto = {
      found: true,
      vehicle: {
        id: vehicle.id,
        licensePlate: vehicle.licensePlate,
        licensePlateNormalized: vehicle.licensePlateNormalized,
        vehicleType: vehicle.vehicleType,
        make: vehicle.make,
        model: vehicle.model,
        modelYear: vehicle.modelYear,
        color: vehicle.color,
        vin: vehicle.vin,
      },
      customer: vehicle.customer
        ? {
            id: vehicle.customer.id,
            fullName: vehicle.customer.fullName,
            phoneE164: vehicle.customer.phoneE164,
            email: vehicle.customer.email,
            document: vehicle.customer.document,
          }
        : null,
      history: {
        previousOrdersCount: vehicle.workOrders.length,
        lastServiceDate: lastOrder ? lastOrder.openedAt.toISOString() : null,
        lastServiceComplaint: lastOrder?.intakeRecord?.customerComplaint ?? null,
        lastOdometer: lastOrder?.intakeRecord?.odometerAtIntake ?? null,
      },
      activeOrder: activeOrder
        ? {
            id: activeOrder.id,
            status: activeOrder.status,
          }
        : null,
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId, adminUser } = await requireActiveAdminApi({
      roles: ALLOWED_ADMIN_ROLES,
    });

    const body = (await request.json()) as Record<string, unknown>;

    const rawPlate = typeof body.licensePlate === "string" ? body.licensePlate : "";
    const licensePlateNormalized = normalizePlateString(rawPlate);

    if (!licensePlateNormalized || licensePlateNormalized.length < 5) {
      throw new ValidationException(
        "INVALID_LICENSE_PLATE",
        "La patente debe ser válida y contener al menos 5 caracteres alfanuméricos.",
      );
    }

    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    if (customerName.length < 2) {
      throw new ValidationException(
        "CUSTOMER_NAME_REQUIRED",
        "El nombre del cliente debe contener al menos 2 caracteres.",
      );
    }

    const customerPhoneRaw = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
    const phoneNormalized = normalizePhoneString(customerPhoneRaw);
    if (phoneNormalized.length < 6) {
      throw new ValidationException(
        "CUSTOMER_PHONE_REQUIRED",
        "El teléfono del cliente debe contener al menos 6 dígitos numéricos.",
      );
    }

    const phoneE164 = customerPhoneRaw.startsWith("+")
      ? customerPhoneRaw
      : `+${phoneNormalized}`;

    const customerDocument = typeof body.customerDocument === "string" && body.customerDocument.trim()
      ? body.customerDocument.trim()
      : null;
    const customerEmail = typeof body.customerEmail === "string" && body.customerEmail.trim()
      ? body.customerEmail.trim().toLowerCase()
      : null;

    const rawVehicleType = typeof body.vehicleType === "string" ? body.vehicleType.toUpperCase() : "AUTO";
    const vehicleType: VehicleType =
      rawVehicleType === "CAMIONETA" || rawVehicleType === "CAMION" ? rawVehicleType : "AUTO";

    const make = typeof body.make === "string" && body.make.trim() ? body.make.trim() : null;
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
    const modelYear =
      typeof body.modelYear === "number" && Number.isInteger(body.modelYear) && body.modelYear > 1900
        ? body.modelYear
        : null;
    const color = typeof body.color === "string" && body.color.trim() ? body.color.trim() : null;
    const vin = typeof body.vin === "string" && body.vin.trim() ? body.vin.trim().toUpperCase() : null;

    const rawOdometer = body.odometerIn ?? body.mileageIn;
    const odometerIn = Number(rawOdometer);
    if (!Number.isInteger(odometerIn) || odometerIn < 0) {
      throw new ValidationException(
        "INVALID_ODOMETER",
        "El odómetro de entrada debe ser un número entero no negativo.",
      );
    }

    const customerComplaint = typeof body.customerComplaint === "string" ? body.customerComplaint.trim() : "";
    if (customerComplaint.length < 3) {
      throw new ValidationException(
        "CUSTOMER_COMPLAINT_REQUIRED",
        "El motivo de ingreso / síntomas debe contener al menos 3 caracteres.",
      );
    }

    const intakeNotes = typeof body.intakeNotes === "string" && body.intakeNotes.trim()
      ? body.intakeNotes.trim()
      : null;

    const fuelLevel = parseFuelLevel(body.fuelLevel);

    const bayId = typeof body.bayId === "string" && body.bayId.trim() ? body.bayId.trim() : null;
    const signatureRaw = typeof body.signature === "string" && body.signature.trim() ? body.signature.trim() : null;
    const signatureHashInput = typeof body.signatureHash === "string" && body.signatureHash.trim()
      ? body.signatureHash.trim()
      : null;

    const declaredBelongings = Boolean(body.declaredBelongings);

    let signatureHash: string | null = signatureHashInput;
    if (!signatureHash && signatureRaw) {
      signatureHash = await computeSha256Hex(signatureRaw);
    }

    // Parse damages array if provided
    const damagesInput = Array.isArray(body.damages) ? (body.damages as ReceptionDamageItemInput[]) : [];
    const validDamages = damagesInput
      .filter((d): d is ReceptionDamageItemInput => typeof d === "object" && d !== null && typeof d.zone === "string")
      .map((d) => ({
        zone: d.zone.trim().toUpperCase(),
        damageType: parseDamageType(d.damageType ?? "OTRO"),
        xPercent: typeof d.xPercent === "number" ? Math.max(0, Math.min(100, d.xPercent)) : 50,
        yPercent: typeof d.yPercent === "number" ? Math.max(0, Math.min(100, d.yPercent)) : 50,
        note: typeof d.note === "string" && d.note.trim() ? d.note.trim() : null,
      }));

    const trackingToken = createTrackingToken();
    const trackingCodeHash = hashTrackingToken(trackingToken);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Cliente: buscar por teléfono o crear
      let customer = await tx.customer.findFirst({
        where: { workshopId, phoneNormalized, deletedAt: null },
      });

      if (customer) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            fullName: customerName,
            ...(customerDocument ? { document: customerDocument } : {}),
            ...(customerEmail ? { email: customerEmail } : {}),
          },
        });
      } else {
        customer = await tx.customer.create({
          data: {
            workshopId,
            fullName: customerName,
            phoneE164,
            phoneNormalized,
            email: customerEmail,
            document: customerDocument,
          },
        });
      }

      // 2. Vehículo: buscar por patente o crear
      let vehicle = await tx.vehicle.findFirst({
        where: { workshopId, licensePlateNormalized, deletedAt: null },
      });

      if (vehicle) {
        vehicle = await tx.vehicle.update({
          where: { id: vehicle.id },
          data: {
            customerId: customer.id,
            vehicleType,
            licensePlate: rawPlate.trim().toUpperCase(),
            ...(make ? { make } : {}),
            ...(model ? { model } : {}),
            ...(modelYear ? { modelYear } : {}),
            ...(color ? { color } : {}),
            ...(vin ? { vin } : {}),
          },
        });
      } else {
        vehicle = await tx.vehicle.create({
          data: {
            workshopId,
            customerId: customer.id,
            vehicleType,
            licensePlate: rawPlate.trim().toUpperCase(),
            licensePlateNormalized,
            make,
            model,
            modelYear,
            color,
            vin,
          },
        });
      }

      // 3. Invariante: no puede haber otra orden activa para este vehículo
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
          { vehicleId: vehicle.id, workOrderId: activeOrder.id, status: activeOrder.status },
        );
      }

      // 4. Bahía opcional
      let assignedBay: { id: string; code: string } | null = null;
      if (bayId) {
        const foundBay = await tx.bay.findFirst({
          where: { id: bayId, workshopId, deletedAt: null },
          select: { id: true, code: true, status: true },
        });
        if (foundBay) {
          assignedBay = { id: foundBay.id, code: foundBay.code };
        }
      }

      // 5. Crear WorkOrder con IntakeRecord, StatusHistory y Daños
      const workOrder = await tx.workOrder.create({
        data: {
          workshopId,
          customerId: customer.id,
          vehicleId: vehicle.id,
          createdById: adminUser.id,
          trackingCodeHash,
          status: "INGRESADO",
          intakeRecord: {
            create: {
              odometerAtIntake: odometerIn,
              fuelLevel,
              customerComplaint,
              intakeNotes,
              signatureHash,
              declaredBelongings,
              ...(validDamages.length > 0
                ? {
                    damageMarks: {
                      create: validDamages.map((d) => ({
                        zone: d.zone,
                        damageType: d.damageType,
                        xPercent: d.xPercent,
                        yPercent: d.yPercent,
                        note: d.note,
                      })),
                    },
                  }
                : {}),
            },
          },
          statusHistory: {
            create: {
              actorType: "ADMIN",
              actorAdminId: adminUser.id,
              eventType: "INGRESO",
              toStatus: "INGRESADO",
              publicVisible: true,
              publicDescription: "Vehículo recibido e ingresado en Mostrador Rápido.",
            },
          },
          ...(assignedBay
            ? {
                bayAssignments: {
                  create: {
                    bayId: assignedBay.id,
                    assignedById: adminUser.id,
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      });

      // Si se asignó una bahía, marcarla como OCUPADA
      if (assignedBay) {
        await tx.bay.update({
          where: { id: assignedBay.id },
          data: { status: "OCUPADA" },
        });
      }

      const orderNumber = `OT-${workOrder.id.slice(-6).toUpperCase()}`;

      const summary: ReceptionSummaryDto = {
        workOrderId: workOrder.id,
        workOrderNumber: orderNumber,
        trackingToken,
        trackingUrl: `/tracking/${encodeURIComponent(trackingToken)}`,
        status: "INGRESADO",
        vehicleId: vehicle.id,
        customerId: customer.id,
        customerName: customer.fullName,
        licensePlate: vehicle.licensePlate,
        odometerIn,
        fuelLevel,
        assignedBay,
        createdAt: workOrder.createdAt.toISOString(),
      };

      return summary;
    });

    return NextResponse.json(
      { success: true, data: result, meta: { requestId } },
      {
        status: 201,
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
