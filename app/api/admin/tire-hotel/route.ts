/**
 * OS-CAR — /api/admin/tire-hotel
 * GET  → sets en custodia/entregados con sus neumáticos.
 * POST → ingreso de un set nuevo (4 neumáticos) al hotel.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, parseBody, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import {
  PHONE_E164_RE,
  TIRE_SEASONS,
  WHEEL_POSITIONS,
  normalizePhone,
  normalizePlate,
  vehicleLabel,
} from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ─────────────────────────── GET (lista) ─────────────────────────── */

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();

    const sets = await db.tireSet.findMany({
      where: {
        workshopId: admin.workshopId,
        ...(status !== "" ? { status: status as any } : {}),
        ...(q !== ""
          ? {
              OR: [
                { brand: { contains: q } },
                { size: { contains: q } },
                { vehicle: { licensePlateNormalized: { contains: q.toUpperCase() } } },
              ],
            }
          : {}),
      },
      include: { vehicle: { include: { customer: { select: { fullName: true } } } }, tires: true },
    });

    const mapped = sets
      .map((set) => ({
        id: set.id,
        plate: set.vehicle.licensePlate,
        vehicle: vehicleLabel(set.vehicle),
        customer: set.vehicle.customer.fullName,
        brand: set.brand,
        size: set.size,
        season: set.season,
        status: set.status,
        rack: set.rack,
        level: set.level,
        position: set.position,
        notes: set.notes,
        checkInAt: set.checkInAt.toISOString(),
        checkOutAt: set.checkOutAt?.toISOString() ?? null,
        tires: set.tires.map((tire) => ({
          wheelPosition: tire.wheelPosition,
          treadDepthMm: Number(tire.treadDepthMm),
          condition: tire.condition,
        })),
      }))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "EN_CUSTODIA" ? -1 : 1;
        return new Date(b.checkInAt).getTime() - new Date(a.checkInAt).getTime();
      });

    return ok({ sets: mapped });
  } catch (error) {
    return handleApiError(error);
  }
}

/* ─────────────────────────── POST (ingreso) ─────────────────────────── */

const locationField = z
  .string()
  .trim()
  .min(1, "Ubicación requerida")
  .max(20, "Máximo 20 caracteres");

const tireSchema = z.object({
  wheelPosition: z.enum(WHEEL_POSITIONS),
  treadDepthMm: z.coerce.number().min(0, "Profundidad inválida").max(20, "Profundidad inválida"),
});

const createSetSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
    phoneE164: z.string().trim().regex(PHONE_E164_RE, "Teléfono inválido (formato E.164)"),
  }),
  vehicle: z.object({
    licensePlate: z.string().trim().min(1, "Ingresá la patente").max(20),
    make: z.string().trim().min(1, "Ingresá la marca").max(80),
    model: z.string().trim().min(1, "Ingresá el modelo").max(80),
  }),
  brand: z.string().trim().min(1, "Ingresá la marca de los neumáticos").max(80),
  size: z.string().trim().min(1, "Ingresá la medida").max(40),
  season: z.enum(TIRE_SEASONS).default("VERANO"),
  rack: locationField,
  level: locationField,
  position: locationField,
  notes: z.string().trim().max(500).optional(),
  tires: z.array(tireSchema).length(4, "Debés cargar los 4 neumáticos del set"),
});

function treadCondition(depthMm: number): string {
  if (depthMm < 3) return "CRITICO";
  if (depthMm < 4.5) return "SUGERIR_REEMPLAZO";
  return "OPTIMO";
}

export async function POST(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const body = await parseBody(request, createSetSchema);

    const workshopId = admin.workshopId;
    const phoneNormalized = normalizePhone(body.customer.phoneE164);
    const licensePlateNormalized = normalizePlate(body.vehicle.licensePlate);
    if (!/^[A-Z0-9]{5,10}$/.test(licensePlateNormalized)) {
      throw new HttpError(400, "VALIDATION_ERROR", "Patente inválida (5 a 10 caracteres alfanuméricos).");
    }

    const created = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { workshopId_phoneNormalized: { workshopId, phoneNormalized } },
        create: {
          workshopId,
          fullName: body.customer.fullName,
          phoneE164: body.customer.phoneE164,
          phoneNormalized,
        },
        update: { fullName: body.customer.fullName, phoneE164: body.customer.phoneE164 },
      });

      const vehicle = await tx.vehicle.upsert({
        where: { workshopId_licensePlateNormalized: { workshopId, licensePlateNormalized } },
        create: {
          workshopId,
          customerId: customer.id,
          vehicleType: "AUTO",
          licensePlate: licensePlateNormalized,
          licensePlateNormalized,
          make: body.vehicle.make,
          model: body.vehicle.model,
        },
        update: { make: body.vehicle.make, model: body.vehicle.model },
      });

      const set = await tx.tireSet.create({
        data: {
          workshopId,
          vehicleId: vehicle.id,
          customerId: customer.id,
          brand: body.brand,
          size: body.size,
          season: body.season as any,
          status: "EN_CUSTODIA",
          rack: body.rack,
          level: body.level,
          position: body.position,
          notes: body.notes ?? null,
        },
      });

      for (const tire of body.tires) {
        await tx.tireItem.create({
          data: {
            tireSetId: set.id,
            wheelPosition: tire.wheelPosition,
            treadDepthMm: tire.treadDepthMm,
            condition: treadCondition(tire.treadDepthMm) as any,
          },
        });
      }

      return set;
    });

    return ok({ id: created.id, status: created.status });
  } catch (error) {
    return handleApiError(error);
  }
}
