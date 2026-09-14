-- OS-CAR: Script de Purga Controlada de Fixtures de Prueba (AUD-030)
-- --------------------------------------------------------------------------
-- Este script elimina de forma segura y en orden estricto inverso de FKs
-- todos los talleres y registros de prueba creados por suites de integración.
--
-- PRESERVA EXCLUSIVAMENTE:
-- 1. El taller del propietario (ws-crit-1789331359270), renombrado a 'OS-CAR Taller Central'.
-- 2. El usuario administrador legítimo: tomasleonelramon@gmail.com (id: cmu0azvzh0001v7aktncia9f5).

BEGIN;

-- 1. Eliminar el fixture admin residual del taller real
DELETE FROM "admin_users"
WHERE "workshopId" = 'ws-crit-1789331359270'
  AND "email" IS NULL;

-- 2. Renombrar el taller real a un nombre de producción formal
UPDATE "workshops"
SET "name" = 'OS-CAR Taller Central'
WHERE "id" = 'ws-crit-1789331359270';

-- 3. Identificar y purgar todos los talleres fixture que NO sean el taller real
-- A. Auditoría y eventos outbox de talleres fixture
DELETE FROM "audit_logs"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "outbox_messages"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "idempotency_records"
WHERE "workshopId" != 'ws-crit-1789331359270';

-- B. Presupuestos de talleres fixture
DELETE FROM "budget_labor_lines"
WHERE "budgetVersionId" IN (
  SELECT bv.id FROM "budget_versions" bv
  JOIN "budgets" b ON b.id = bv."budgetId"
  JOIN "work_orders" wo ON wo.id = b."workOrderId"
  WHERE wo."workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "budget_part_lines"
WHERE "budgetVersionId" IN (
  SELECT bv.id FROM "budget_versions" bv
  JOIN "budgets" b ON b.id = bv."budgetId"
  JOIN "work_orders" wo ON wo.id = b."workOrderId"
  WHERE wo."workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "budget_approvals"
WHERE "budgetVersionId" IN (
  SELECT bv.id FROM "budget_versions" bv
  JOIN "budgets" b ON b.id = bv."budgetId"
  JOIN "work_orders" wo ON wo.id = b."workOrderId"
  WHERE wo."workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "budget_versions"
WHERE "budgetId" IN (
  SELECT b.id FROM "budgets" b
  JOIN "work_orders" wo ON wo.id = b."workOrderId"
  WHERE wo."workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "budgets"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders"
  WHERE "workshopId" != 'ws-crit-1789331359270'
);

-- C. Registros operativos de talleres fixture
DELETE FROM "delivery_records"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "quality_controls"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "order_blockers"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "status_history"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "work_items"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "part_items"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "intake_records"
WHERE "workOrderId" IN (
  SELECT id FROM "work_orders" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "inventory_movements"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "inventory_items"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "tire_sets"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "bay_assignments"
WHERE "bayId" IN (
  SELECT id FROM "bays" WHERE "workshopId" != 'ws-crit-1789331359270'
);

DELETE FROM "bays"
WHERE "workshopId" != 'ws-crit-1789331359270';

-- D. Órdenes de trabajo, vehículos y clientes de talleres fixture
DELETE FROM "work_orders"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "vehicles"
WHERE "workshopId" != 'ws-crit-1789331359270';

DELETE FROM "customers"
WHERE "workshopId" != 'ws-crit-1789331359270';

-- E. Administradores fixture (todos excepto Tomás Ramón)
DELETE FROM "admin_users"
WHERE "id" != 'cmu0azvzh0001v7aktncia9f5';

-- F. Talleres fixture
DELETE FROM "workshops"
WHERE "id" != 'ws-crit-1789331359270';

COMMIT;
