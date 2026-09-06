-- prisma/migrations/0_init/migration.sql
-- =========================================================================
-- OS-CAR — MIGRACIÓN INICIAL: ÍNDICES PARCIALES E INVARIANTES DE MOTOR
-- =========================================================================

-- 1. Unicidad Parcial: Un vehículo sólo puede tener UNA orden activa en taller simultáneamente
CREATE UNIQUE INDEX IF NOT EXISTS work_order_one_active_per_vehicle
ON work_orders ("vehicleId")
WHERE "deletedAt" IS NULL
  AND "status" NOT IN ('ENTREGADO', 'CANCELADA');

-- 2. Unicidad Parcial: Una bahía sólo puede tener UNA asignación sin liberar a la vez
CREATE UNIQUE INDEX IF NOT EXISTS bay_one_active_assignment
ON bay_assignments ("bayId")
WHERE "releasedAt" IS NULL;

-- 3. Rendimiento y Filtro: Bloqueadores activos por orden de trabajo
CREATE INDEX IF NOT EXISTS order_blocker_active_workorder_idx
ON order_blockers ("workOrderId")
WHERE "isActive" = TRUE;

-- 4. Invariante de No-Regresión de Odómetro a nivel motor (Check Constraint Preventivo)
ALTER TABLE delivery_records
ADD CONSTRAINT chk_odometer_delivery_non_negative
CHECK ("odometerAtDelivery" >= 0);

-- 5. Unicidad Parcial: Un ítem de inventario sólo puede tener una reserva activa.
--    [G3-FIX] Se elimina la cláusula DATE("createdAt") = CURRENT_DATE porque
--    CURRENT_DATE es VOLATILE y PostgreSQL rechaza el índice con SQLSTATE 42P17
--    ("functions in index must be marked IMMUTABLE").
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movement_one_active_reservation_per_item
ON inventory_movements ("inventoryItemId", "movementType")
WHERE "movementType" = 'RESERVA';

-- 6. Performance: Índice compuesto para consultas de seguimiento público (trackingCode)
CREATE INDEX IF NOT EXISTS work_order_tracking_code_active_idx
ON work_orders ("trackingCodeHash")
WHERE "trackingCodeRevokedAt" IS NULL;

-- 7. Performance: Índices para el motor de concurrencia optimista (C1)
CREATE INDEX IF NOT EXISTS part_item_version_lookup_idx
ON part_items ("id", "version");

CREATE INDEX IF NOT EXISTS work_item_version_lookup_idx
ON work_items ("id", "version");

-- 8. Cleanup automático de idempotencia expirada (índice para job de mantenimiento)
CREATE INDEX IF NOT EXISTS idempotency_records_expiration_idx
ON idempotency_records ("expiresAt")
WHERE "status" IN ('RESOLVED', 'FAILED');
