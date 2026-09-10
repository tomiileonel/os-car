import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveAdminApi } from "@/server/auth/active-admin";
import { resolveCorrelationId } from "@/shared/telemetry/correlation";
import {
  toErrorEnvelope,
  NotFoundException,
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

const DEFAULT_INVENTORY_ITEMS = [
  {
    sku: "FRAM-PH5949",
    description: "Filtro de Aceite Fram Blindado (Renault 1.6 / Fiat FireFly)",
    category: "Filtros",
    location: "Estante B-2",
    stockQuantity: 2,
    reorderPoint: 5,
    unitCost: 8500,
  },
  {
    sku: "MOTUL-8100-5W40",
    description: "Aceite Sintético Motul 8100 X-cess 5W-40 (Bidón 5L)",
    category: "Lubricantes",
    location: "Pallet L-01",
    stockQuantity: 8,
    reorderPoint: 4,
    unitCost: 45000,
  },
  {
    sku: "FRAS-LE-PD62",
    description: "Pastillas de Freno Delanteras Fras-le Cerámica (Peugeot / Citroën)",
    category: "Frenos",
    location: "Estante F-1",
    stockQuantity: 1,
    reorderPoint: 3,
    unitCost: 28000,
  },
  {
    sku: "NGK-BKR6E",
    description: "Juego Bujías de Encendido NGK V-Power x4 (VW / Chevrolet)",
    category: "Encendido",
    location: "Cajón E-4",
    stockQuantity: 12,
    reorderPoint: 6,
    unitCost: 16000,
  },
  {
    sku: "FRAM-CA1023",
    description: "Filtro de Aire Fram Panel Rectangular (Toyota Corolla / Yaris)",
    category: "Filtros",
    location: "Estante B-1",
    stockQuantity: 3,
    reorderPoint: 4,
    unitCost: 11200,
  },
];

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
    const category = url.searchParams.get("category")?.trim().toLowerCase();
    const criticalOnly = url.searchParams.get("critical") === "true";

    let items = await prisma.inventoryItem.findMany({
      where: {
        workshopId,
        deletedAt: null,
        active: true,
      },
      orderBy: { description: "asc" },
    });

    // Auto-inicialización si el taller aún no tiene ítems de inventario cargados
    if (items.length === 0) {
      await prisma.inventoryItem.createMany({
        data: DEFAULT_INVENTORY_ITEMS.map((item) => ({
          workshopId,
          sku: item.sku,
          description: item.description,
          category: item.category,
          location: item.location,
          stockQuantity: item.stockQuantity,
          reorderPoint: item.reorderPoint,
          unitCost: item.unitCost,
          active: true,
        })),
        skipDuplicates: true,
      });

      items = await prisma.inventoryItem.findMany({
        where: { workshopId, deletedAt: null, active: true },
        orderBy: { description: "asc" },
      });
    }

    interface InventoryItemRecord {
      id: string;
      workshopId: string;
      sku: string;
      description: string;
      category?: string | null;
      location?: string | null;
      unitCost?: unknown;
      stockQuantity: number;
      reorderPoint: number;
      active: boolean;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    }

    // Filtrado en memoria de búsqueda y condiciones críticas
    let filtered: InventoryItemRecord[] = items as unknown as InventoryItemRecord[];
    if (category && category !== "all") {
      filtered = filtered.filter(
        (i) => Boolean(i.category) && i.category!.toLowerCase().includes(category),
      );
    }
    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.sku.toLowerCase().includes(search) ||
          i.description.toLowerCase().includes(search) ||
          Boolean(i.location && i.location.toLowerCase().includes(search)),
      );
    }
    if (criticalOnly) {
      filtered = filtered.filter((i) => i.stockQuantity <= i.reorderPoint);
    }

    const data = filtered.map((item) => ({
      id: item.id,
      sku: item.sku,
      description: item.description,
      category: item.category,
      location: item.location,
      unitCost: item.unitCost ? Number(item.unitCost) : null,
      unitPrice: item.unitCost ? Number(item.unitCost) : 0,
      stockQuantity: item.stockQuantity,
      reorderPoint: item.reorderPoint,
      active: item.active,
      status:
        item.stockQuantity === 0
          ? "AGOTADO"
          : item.stockQuantity <= item.reorderPoint
            ? "CRITICO"
            : "NORMAL",
    }));

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
    const { workshopId, adminUser } = await requireActiveAdminApi({
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
    const action = typeof body.action === "string" ? body.action : "movement";

    if (action === "create") {
      const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!sku || !description) {
        throw new ValidationException("FIELDS_REQUIRED", "SKU y descripción son obligatorios.");
      }

      const existing = await prisma.inventoryItem.findFirst({
        where: { workshopId, sku, deletedAt: null },
      });
      if (existing) {
        throw new ValidationException("DUPLICATE_SKU", `Ya existe un ítem con el SKU ${sku}.`);
      }

      const newItem = await prisma.inventoryItem.create({
        data: {
          workshopId,
          sku,
          description,
          category: typeof body.category === "string" ? body.category.trim() : null,
          location: typeof body.location === "string" ? body.location.trim() : null,
          stockQuantity: Number(body.stockQuantity) || 0,
          reorderPoint: Number(body.reorderPoint) || 0,
          unitCost: typeof body.unitCost === "number" ? body.unitCost : null,
          active: true,
        },
      });

      return NextResponse.json(
        { success: true, data: newItem, meta: { requestId } },
        {
          headers: {
            "Cache-Control": "no-store",
            "x-correlation-id": requestId,
          },
        },
      );
    }

    // Acción de registro de movimiento (ingreso / consumo / ajuste)
    const inventoryItemId = typeof body.inventoryItemId === "string" ? body.inventoryItemId : "";
    const rawMovementType = typeof body.movementType === "string" ? body.movementType : "";
    const rawQty = Number(body.quantity);

    if (!inventoryItemId) {
      throw new ValidationException("ITEM_ID_REQUIRED", "ID de ítem de inventario es requerido.");
    }
    if (!Number.isInteger(rawQty) || rawQty === 0) {
      throw new ValidationException("INVALID_QUANTITY", "La cantidad debe ser un entero distinto de cero.");
    }

    const item = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, workshopId, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException("ITEM_NOT_FOUND", "Ítem de inventario no encontrado en el taller.");
    }

    let prismaMovementType: "INGRESO" | "RESERVA" | "CONSUMO" | "DEVOLUCION" | "AJUSTE" = "INGRESO";
    let delta = 0;

    if (rawMovementType === "INGRESO" || rawMovementType === "INFLOW") {
      prismaMovementType = "INGRESO";
      delta = Math.abs(rawQty);
    } else if (
      rawMovementType === "CONSUMO" ||
      rawMovementType === "OUTFLOW" ||
      rawMovementType === "OT_IMPUTATION"
    ) {
      prismaMovementType = "CONSUMO";
      delta = -Math.abs(rawQty);
    } else if (rawMovementType === "DEVOLUCION") {
      prismaMovementType = "DEVOLUCION";
      delta = Math.abs(rawQty);
    } else if (rawMovementType === "AJUSTE" || rawMovementType === "ADJUSTMENT") {
      prismaMovementType = "AJUSTE";
      delta = rawQty; // Puede ser positivo o negativo
    } else {
      throw new ValidationException("INVALID_MOVEMENT_TYPE", `Tipo de movimiento '${rawMovementType}' no válido.`);
    }

    if (item.stockQuantity + delta < 0) {
      throw new ValidationException(
        "INSUFFICIENT_STOCK",
        `Stock insuficiente: stock actual (${item.stockQuantity}) no cubre el egreso solicitado (${Math.abs(delta)}).`,
      );
    }

    const workOrderId = typeof body.workOrderId === "string" && body.workOrderId.trim() ? body.workOrderId.trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.inventoryMovement.create({
        data: {
          workshopId,
          inventoryItemId: item.id,
          movementType: prismaMovementType,
          quantity: Math.abs(delta),
          note: typeof body.note === "string" ? body.note.trim() : null,
          workOrderId,
          actorAdminId: adminUser.id,
        },
      });

      const updatedItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { stockQuantity: { increment: delta } },
      });

      return { movement, updatedItem };
    });

    return NextResponse.json(
      { success: true, data: result, meta: { requestId } },
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
