-- OS-CAR: tipo operativo de vehículo requerido por el alta pública.
-- Cambio backward-compatible: columna nullable durante el despliegue lógico,
-- materializada con AUTO para los registros históricos existentes.

DO $$
BEGIN
  CREATE TYPE "VehicleType" AS ENUM ('AUTO', 'CAMIONETA', 'CAMION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "vehicleType" "VehicleType" NOT NULL DEFAULT 'AUTO';

-- H-1: backstop de motor contra dos órdenes activas para el mismo vehículo.
-- Los nombres quoted respetan las columnas físicas generadas por Prisma.
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_one_active_per_vehicle
ON "work_orders" ("workshopId", "vehicleId")
WHERE "deletedAt" IS NULL
  AND "status" NOT IN ('ENTREGADO', 'CANCELADA');
