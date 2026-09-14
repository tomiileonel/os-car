-- AlterTable
ALTER TABLE "tire_sets" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tire_sets_customerId_idx" ON "tire_sets"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tire_sets_vehicleId_idx" ON "tire_sets"("vehicleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_orders_createdById_idx" ON "work_orders"("createdById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bay_assignments_assignedById_idx" ON "bay_assignments"("assignedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_movements_actorAdminId_idx" ON "inventory_movements"("actorAdminId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "budget_labor_lines_budgetVersionId_idx" ON "budget_labor_lines"("budgetVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "budget_part_lines_budgetVersionId_idx" ON "budget_part_lines"("budgetVersionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_actorAdminId_idx" ON "audit_logs"("actorAdminId");
