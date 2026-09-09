import { NextRequest, NextResponse } from "next/server";
import type { TireSetStatus, TireSeason, TireCondition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import {
  toErrorEnvelope,
  ValidationException,
} from "@/shared/errors";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = resolveCorrelationId(request);
  try {
    const { workshopId } = await requireActiveAdminApi({
      roles: [
        "OWNER",
        "TALLER_SUPERVISOR",
        "ADMIN",
        "SUPER_ADMIN",
        "ADMIN_TALLER",
        "RECEPCIONISTA",
        "MECANICO",
      ],
    });

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().toLowerCase();
    const statusParam = url.searchParams.get("status") as TireSetStatus | null;

    let sets = await prisma.tireSet.findMany({
      where: {
        workshopId,
        deletedAt: null,
        ...(statusParam ? { status: statusParam } : {}),
      },
      include: {
        customer: true,
        vehicle: true,
        tires: {
          orderBy: { wheelPosition: "asc" },
        },
      },
      orderBy: { checkInAt: "desc" },
    });

    // Auto-inicialización si el taller aún no tiene custodias cargadas
    if (sets.length === 0) {
      // Intentamos vincular con vehículos y clientes existentes o crearlos
      let customer = await prisma.customer.findFirst({ where: { workshopId } });
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            workshopId,
            fullName: "Mauricio Benítez",
            phoneE164: "+543764490129",
            phoneNormalized: "543764490129",
          },
        });
      }

      let vehicle = await prisma.vehicle.findFirst({ where: { workshopId } });
      if (!vehicle) {
        vehicle = await prisma.vehicle.create({
          data: {
            workshopId,
            customerId: customer.id,
            licensePlate: "AF 419 LK",
            licensePlateNormalized: "AF419LK",
            make: "Volkswagen",
            model: "Amarok V6",
            modelYear: 2023,
          },
        });
      }

      await prisma.tireSet.create({
        data: {
          workshopId,
          vehicleId: vehicle.id,
          customerId: customer.id,
          brand: "Bridgestone Dueler A/T",
          size: "255/60 R18",
          season: "VERANO",
          status: "EN_CUSTODIA",
          rack: "Rack Aéreo N-14",
          level: "Nivel 2",
          position: "Posición 14",
          notes: "Funda termocontraíble colocada. Póliza TR-9941",
          tires: {
            create: [
              { wheelPosition: "DELANTERO_IZQUIERDO", treadDepthMm: 5.8, condition: "OPTIMO" },
              { wheelPosition: "DELANTERO_DERECHO", treadDepthMm: 5.7, condition: "OPTIMO" },
              { wheelPosition: "TRASERO_IZQUIERDO", treadDepthMm: 6.0, condition: "OPTIMO" },
              { wheelPosition: "TRASERO_DERECHO", treadDepthMm: 5.9, condition: "OPTIMO" },
            ],
          },
        },
      });

      sets = await prisma.tireSet.findMany({
        where: { workshopId, deletedAt: null },
        include: {
          customer: true,
          vehicle: true,
          tires: true,
        },
        orderBy: { checkInAt: "desc" },
      });
    }

    // Filtrado en memoria si hay término de búsqueda
    let filtered = sets;
    if (search) {
      filtered = filtered.filter((s) => {
        const plate = s.vehicle.licensePlateNormalized.toLowerCase();
        const client = s.customer.fullName.toLowerCase();
        const brand = s.brand.toLowerCase();
        const rack = s.rack.toLowerCase();
        return (
          plate.includes(search) ||
          client.includes(search) ||
          brand.includes(search) ||
          rack.includes(search)
        );
      });
    }

    const data = filtered.map((s) => {
      const depths = s.tires.map((t) => Number(t.treadDepthMm));
      const minTread = depths.length > 0 ? Math.min(...depths) : 0;
      return {
        id: s.id,
        vehicleId: s.vehicleId,
        customerId: s.customerId,
        vehiclePlate: s.vehicle.licensePlateNormalized,
        vehicleLabel: [s.vehicle.make, s.vehicle.model, s.vehicle.modelYear]
          .filter(Boolean)
          .join(" ") || "S/D",
        customerName: s.customer.fullName,
        customerPhone: s.customer.phoneE164,
        brand: s.brand,
        size: s.size,
        dot: s.dot,
        season: s.season,
        status: s.status,
        rack: s.rack,
        level: s.level,
        position: s.position,
        notes: s.notes,
        checkInAt: s.checkInAt.toISOString(),
        checkOutAt: s.checkOutAt ? s.checkOutAt.toISOString() : null,
        deliveredTo: s.deliveredTo,
        minTreadDepthMm: minTread,
        suggestReplacement: minTread <= 2.0,
        tires: s.tires.map((t) => ({
          id: t.id,
          wheelPosition: t.wheelPosition,
          treadDepthMm: Number(t.treadDepthMm),
          condition: t.condition,
          notes: t.notes,
        })),
      };
    });

    return NextResponse.json(
      { success: true, data, meta: { requestId, total: data.length } },
      {
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
    const { workshopId } = await requireActiveAdminApi({
      roles: [
        "OWNER",
        "TALLER_SUPERVISOR",
        "ADMIN",
        "SUPER_ADMIN",
        "ADMIN_TALLER",
        "RECEPCIONISTA",
        "MECANICO",
      ],
    });

    const body = (await request.json()) as Record<string, unknown>;

    const licensePlate = typeof body.licensePlate === "string" ? body.licensePlate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const size = typeof body.size === "string" ? body.size.trim() : "";
    const rack = typeof body.rack === "string" ? body.rack.trim() : "Rack General";
    const level = typeof body.level === "string" ? body.level.trim() : "Nivel 1";
    const position = typeof body.position === "string" ? body.position.trim() : "Posición 1";
    const season = (typeof body.season === "string" ? body.season : "VERANO") as TireSeason;
    const dot = typeof body.dot === "string" && body.dot.trim() ? body.dot.trim() : null;
    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

    if (!licensePlate || !customerName || !brand || !size) {
      throw new ValidationException(
        "REQUIRED_FIELDS",
        "Patente, cliente, marca y medida del neumático son obligatorios.",
      );
    }

    // Resolución o creación de cliente
    let customer = await prisma.customer.findFirst({
      where: { workshopId, fullName: { equals: customerName, mode: "insensitive" } },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          workshopId,
          fullName: customerName,
          phoneE164: customerPhone || "+5491100000000",
          phoneNormalized: (customerPhone || "5491100000000").replace(/\D/g, ""),
        },
      });
    }

    // Resolución o creación de vehículo
    let vehicle = await prisma.vehicle.findFirst({
      where: { workshopId, licensePlateNormalized: licensePlate },
    });
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          workshopId,
          customerId: customer.id,
          licensePlate,
          licensePlateNormalized: licensePlate,
          make: typeof body.make === "string" ? body.make.trim() : null,
          model: typeof body.model === "string" ? body.model.trim() : null,
        },
      });
    }

    const rawTires = Array.isArray(body.tires) ? body.tires : [];
    const defaultPositions = [
      "DELANTERO_IZQUIERDO",
      "DELANTERO_DERECHO",
      "TRASERO_IZQUIERDO",
      "TRASERO_DERECHO",
    ];

    const tireItemsData =
      rawTires.length > 0
        ? rawTires.map((t: Record<string, unknown>, idx: number) => ({
            wheelPosition: typeof t.wheelPosition === "string" ? t.wheelPosition : defaultPositions[idx] || `RUEDA_${idx + 1}`,
            treadDepthMm: Number(t.treadDepthMm) || 6.0,
            condition: ((Number(t.treadDepthMm) <= 2.0 ? "SUGERIR_REEMPLAZO" : "OPTIMO") as TireCondition),
            notes: typeof t.notes === "string" ? t.notes.trim() : null,
          }))
        : defaultPositions.map((pos) => ({
            wheelPosition: pos,
            treadDepthMm: Number(body.avgTreadDepthMm) || 5.5,
            condition: "OPTIMO" as TireCondition,
            notes: null,
          }));

    const newSet = await prisma.tireSet.create({
      data: {
        workshopId,
        vehicleId: vehicle.id,
        customerId: customer.id,
        brand,
        size,
        season,
        dot,
        status: "EN_CUSTODIA",
        rack,
        level,
        position,
        notes,
        tires: {
          create: tireItemsData,
        },
      },
      include: {
        customer: true,
        vehicle: true,
        tires: true,
      },
    });

    return NextResponse.json(
      { success: true, data: newSet, meta: { requestId } },
      {
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
