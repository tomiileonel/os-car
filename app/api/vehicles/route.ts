import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createVehicleSchema, vehicleQuerySchema } from "@/shared/schemas";
import type { VehicleQuery } from "@/shared/schemas";
import {
  DomainConflictException,
  NotFoundException,
  toErrorEnvelope,
} from "@/shared/errors";
import { BadRequestException } from "@/shared/errors";
import { requireActiveAdminApi } from "@/server/auth/active-admin";

interface VehicleDto {
  id: string;
  workshopId: string;
  customerId: string;
  licensePlate: string;
  licensePlateNormalized: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VEHICLE_SELECT = {
  id: true,
  workshopId: true,
  customerId: true,
  licensePlate: true,
  licensePlateNormalized: true,
  vin: true,
  make: true,
  model: true,
  modelYear: true,
  color: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

function ok<T>(data: T): { success: true; data: T; meta: { requestId: string } } {
  return { success: true, data, meta: { requestId: crypto.randomUUID() } };
}

function failResponse(error: unknown, request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID();
  const { status, body } = toErrorEnvelope(error, {
    requestId,
    instance: request.nextUrl.pathname,
  });
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestException("INVALID_JSON_BODY", "El cuerpo de la solicitud no es JSON válido.");
  }
}

function toVehicleDto(vehicle: VehicleDto): VehicleDto {
  return {
    id: vehicle.id,
    workshopId: vehicle.workshopId,
    customerId: vehicle.customerId,
    licensePlate: vehicle.licensePlate,
    licensePlateNormalized: vehicle.licensePlateNormalized,
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    color: vehicle.color,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

function buildVehicleWhere(workshopId: string, query: VehicleQuery): Prisma.VehicleWhereInput {
  const where: Prisma.VehicleWhereInput = { workshopId, deletedAt: null };
  if (query.licensePlate !== undefined) {
    where.licensePlateNormalized = query.licensePlate;
  }
  if (query.q !== undefined && query.q.length > 0) {
    where.OR = [
      { licensePlateNormalized: { contains: query.q.toUpperCase() } },
      { make: { contains: query.q, mode: "insensitive" } },
      { model: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { workshopId } = await requireActiveAdminApi();

    const params = request.nextUrl.searchParams;
    const query = vehicleQuerySchema.parse({
      q: params.get("q") ?? undefined,
      licensePlate: params.get("licensePlate") ?? undefined,
      page: params.get("page") ?? 1,
      pageSize: params.get("pageSize") ?? 20,
    });

    const where = buildVehicleWhere(workshopId, query);

    const [items, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: VEHICLE_SELECT,
      }),
      prisma.vehicle.count({ where }),
    ]);

    return NextResponse.json(
      ok({ items: items.map(toVehicleDto), total, page: query.page, pageSize: query.pageSize }),
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return failResponse(error, request);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { workshopId } = await requireActiveAdminApi();
    const body = await readJsonBody(request);
    const input = createVehicleSchema.parse(body);

    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, workshopId: workshopId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException("CUSTOMER_NOT_FOUND", "El cliente no existe dentro del tenant.");
    }

    const duplicate = await prisma.vehicle.findFirst({
      where: {
        workshopId: workshopId,
        licensePlateNormalized: input.licensePlate,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new DomainConflictException(
        "LICENSE_PLATE_EXISTS",
        `La patente ${input.licensePlate} ya está registrada en el taller.`,
        { licensePlate: input.licensePlate }
      );
    }

    try {
      const vehicle = await prisma.vehicle.create({
        data: {
          workshopId: workshopId,
          customerId: customer.id,
          licensePlate: input.licensePlate,
          licensePlateNormalized: input.licensePlate,
          vin: input.vin ?? null,
          make: input.make ?? null,
          model: input.model ?? null,
          modelYear: input.modelYear ?? null,
          color: input.color ?? null,
        },
        select: VEHICLE_SELECT,
      });

      return NextResponse.json(ok({ vehicle: toVehicleDto(vehicle) }), { status: 201 });
    } catch (createError) {
      if ((createError as { code?: string })?.code === "P2002") {
        throw new DomainConflictException(
          "LICENSE_PLATE_EXISTS",
          `La patente ${input.licensePlate} ya está registrada en el taller.`,
          { licensePlate: input.licensePlate }
        );
      }
      throw createError;
    }
  } catch (error) {
    return failResponse(error, request);
  }
}
