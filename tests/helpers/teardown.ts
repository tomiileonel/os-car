import type { PrismaClient } from "@prisma/client";

/**
 * AUD-030: Purga en orden estricto inverso de dependencias Foreign Key todos
 * los datos asociados a un taller de pruebas, evitando la acumulación de fixtures huérfanos.
 */
export async function teardownTestWorkshop(
  prisma: PrismaClient,
  workshopId: string
): Promise<void> {
  if (!workshopId) return;

  try {
    // 1. Tablas de trazabilidad y eventos que referencian entidades operativas y admin
    await prisma.auditLog.deleteMany({ where: { workshopId } });
    await prisma.outboxMessage.deleteMany({ where: { workshopId } });
    await prisma.idempotencyRecord.deleteMany({ where: { workshopId } });

    // 2. Líneas de presupuestos y aprobaciones
    await prisma.budgetLaborLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId } } } } });
    await prisma.budgetPartLine.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId } } } } });
    await prisma.budgetApproval.deleteMany({ where: { budgetVersion: { budget: { workOrder: { workshopId } } } } });
    await prisma.budgetVersion.deleteMany({ where: { budget: { workOrder: { workshopId } } } });
    await prisma.budget.deleteMany({ where: { workOrder: { workshopId } } });

    // 3. Entregas, registros de ingreso, control de calidad, bloqueos
    await prisma.deliveryRecord.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.qualityControl.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.orderBlocker.deleteMany({ where: { workshopId } });
    await prisma.statusHistory.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.workItem.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.partItem.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.intakeRecord.deleteMany({ where: { workOrder: { workshopId } } });
    await prisma.inventoryMovement.deleteMany({ where: { workshopId } });
    await prisma.inventoryItem.deleteMany({ where: { workshopId } });
    await prisma.tireSet.deleteMany({ where: { workshopId } });

    // 4. Bahías y asignaciones
    await prisma.bayAssignment.deleteMany({ where: { bay: { workshopId } } });
    await prisma.bay.deleteMany({ where: { workshopId } });

    // 5. Órdenes de trabajo
    await prisma.workOrder.deleteMany({ where: { workshopId } });

    // 6. Vehículos y clientes
    await prisma.vehicle.deleteMany({ where: { workshopId } });
    await prisma.customer.deleteMany({ where: { workshopId } });

    // 7. Administradores del taller de prueba (FKs previas ya liberadas)
    await prisma.adminUser.deleteMany({ where: { workshopId } });

    // 8. Taller raíz
    await prisma.workshop.deleteMany({ where: { id: workshopId } });
  } catch (err) {
    console.warn(`[TEARDOWN_WARNING] Limpieza parcial para workshop ${workshopId}:`, err);
  }
}
