/**
 * OS-CAR — GET /api/admin/search?q=
 * Búsqueda global: clientes, vehículos y órdenes (q mínimo 2 caracteres).
 */
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, handleApiError, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { formatOrderNumber, vehicleLabel } from "@/lib/server/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(2, "Ingresá al menos 2 caracteres para buscar").max(80);

export async function GET(request: Request) {
  try {
    const { admin } = await requireAdmin();
    const url = new URL(request.url);
    const raw = url.searchParams.get("q") ?? "";
    const q = querySchema.parse(raw);
    const qUpper = q.toUpperCase();
    const workshopId = admin.workshopId;

    const [customers, vehicles, orders] = await Promise.all([
      db.customer.findMany({
        where: {
          workshopId,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { phoneE164: { contains: q } },
          ],
        },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      db.vehicle.findMany({
        where: {
          workshopId,
          OR: [
            { licensePlateNormalized: { contains: qUpper } },
            { make: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        },
        include: { customer: { select: { id: true, fullName: true } } },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      db.workOrder.findMany({
        where: {
          workshopId,
          OR: [{ id: { contains: q } }, { vehicle: { licensePlateNormalized: { contains: qUpper } } }],
        },
        include: { vehicle: { select: { licensePlate: true } } },
        take: 5,
        orderBy: { openedAt: "desc" },
      }),
    ]);

    return ok({
      customers: customers.map((customer) => ({
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phoneE164,
      })),
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.licensePlate,
        label: vehicleLabel(vehicle),
        customerId: vehicle.customer.id,
        customerName: vehicle.customer.fullName,
      })),
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: formatOrderNumber(order.id),
        plate: order.vehicle?.licensePlate ?? "S/P",
        status: order.status,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
