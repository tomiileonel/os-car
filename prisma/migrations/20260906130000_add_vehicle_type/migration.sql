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
