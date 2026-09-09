-- CreateEnum
CREATE TYPE "TireSetStatus" AS ENUM ('EN_CUSTODIA', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "TireSeason" AS ENUM ('VERANO', 'INVIERNO', 'TODO_CLIMA');

-- CreateEnum
CREATE TYPE "TireCondition" AS ENUM ('OPTIMO', 'SUGERIR_REEMPLAZO', 'CRITICO', 'DANADO');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "category" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "location" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "unitCost" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN "workOrderId" TEXT;

-- CreateTable
CREATE TABLE "tire_sets" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "dot" TEXT,
    "season" "TireSeason" NOT NULL DEFAULT 'VERANO',
    "status" "TireSetStatus" NOT NULL DEFAULT 'EN_CUSTODIA',
    "rack" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "notes" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "deliveredTo" TEXT,
    "signatureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tire_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_items" (
    "id" TEXT NOT NULL,
    "tireSetId" TEXT NOT NULL,
    "wheelPosition" TEXT NOT NULL,
    "treadDepthMm" DECIMAL(4,1) NOT NULL,
    "condition" "TireCondition" NOT NULL DEFAULT 'OPTIMO',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tire_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_workshopId_category_idx" ON "inventory_items"("workshopId", "category");

-- CreateIndex
CREATE INDEX "inventory_movements_workOrderId_idx" ON "inventory_movements"("workOrderId");

-- CreateIndex
CREATE INDEX "tire_sets_workshopId_status_idx" ON "tire_sets"("workshopId", "status");

-- CreateIndex
CREATE INDEX "tire_sets_workshopId_rack_level_position_idx" ON "tire_sets"("workshopId", "rack", "level", "position");

-- CreateIndex
CREATE INDEX "tire_items_tireSetId_idx" ON "tire_items"("tireSetId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_sets" ADD CONSTRAINT "tire_sets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_items" ADD CONSTRAINT "tire_items_tireSetId_fkey" FOREIGN KEY ("tireSetId") REFERENCES "tire_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
