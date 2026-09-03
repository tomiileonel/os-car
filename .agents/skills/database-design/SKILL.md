---
name: database-design
description: Principios de diseño relacional, modelado de esquemas, claves foráneas, auditoría y concurrencia para OS-CAR.
---

# Database Design Skill — OS-CAR

Esta skill norma el diseño de bases de datos relacionales, integridad referencial y performance para OS-CAR.

## 1. Reglas de Integridad Referencial
- **Claves Foráneas Explícitas**: Toda relación relacional debe contar con `foreign key` y comportamiento ante borrado definido (`onDelete: Restrict` o `onDelete: Cascade` solo en entidades hijas dependientes como `LaborItem` respecto a `RepairOrder`).
- **Prohibido el Hard Delete en Registros Históricos**: Vehículos, órdenes de trabajo y facturas nunca se eliminan físicamente de la base de datos. Se utiliza soft-delete (`deletedAt DateTime?`) o anulación con motivo explícito.

## 2. Bloqueo Optimista (Optimistic Locking)
Dado que varios mecánicos y asesores pueden interactuar con una misma OT en paralelo desde diferentes tablets, la tabla `RepairOrder` incluye una columna `version Int @default(1)`. Toda actualización debe verificar que la versión en base de datos coincida con la que el cliente leyó:

```typescript
const updatedOrder = await prisma.repairOrder.updateMany({
  where: {
    id: orderId,
    version: expectedVersion, // Condición de concurrencia optimista
  },
  data: {
    status: newStatus,
    version: { increment: 1 },
  },
});

if (updatedOrder.count === 0) {
  throw new Error("CONCURRENT_UPDATE_CONFLICT");
}
```

## 3. Normalización y Desnormalización Estratégica
- Mantener la base de datos en 3FN (Tercera Forma Normal) para entidades maestras (`Vehicles`, `Customers`, `InventoryItems`).
- **Desnormalización Controlada en Presupuestos y Facturas**: Al momento de aprobar un presupuesto o emitir una orden, los precios de repuestos y las tarifas horarias deben copiarse como snapshots históricos inmutables dentro del registro del ítem (`unitPriceCharged`, `hourlyRateCharged`). Si el taller aumenta sus precios generales en el catálogo meses después, el presupuesto histórico aprobado no debe verse alterado jamás.

## 4. Auditoría y Trazabilidad (Audit Logs)
Cada mutación de alto impacto inserta un registro en `AuditLog` con la representación JSON previa y posterior (`diff`), usuario que ejecutó la operación, dirección IP y motivo del cambio.
