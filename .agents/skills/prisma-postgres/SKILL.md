---
name: prisma-postgres
description: Modelado de datos relacional, queries de alto rendimiento, migraciones y Neon DB para OS-CAR.
---

# Prisma & PostgreSQL Skill — OS-CAR

Esta skill establece las normas de modelado, consulta y migración de base de datos con Prisma y PostgreSQL (Neon DB).

## 1. Conexión y Pooling en Neon
PostgreSQL en Neon opera mediante arquitectura serverless. Deben configurarse dos cadenas de conexión:
- `DATABASE_URL`: Conexión con pooling (`pgbouncer` en puerto 6543) para el runtime de la app y Server Actions.
- `DIRECT_URL`: Conexión directa (puerto 5432) exclusivamente para `prisma migrate` y operaciones DDL.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

## 2. Prevención de Consultas N+1
- **Regla Estricta**: Jamás ejecutar consultas Prisma dentro de bucles `map` o `forEach`.
- **Uso de `include` / `select`**: Siempre definir de forma explícita las relaciones requeridas en una sola consulta.

```typescript
// Correcto: Una sola consulta optimizada con join relacional
const orderWithDetails = await prisma.repairOrder.findUnique({
  where: { id: orderId },
  include: {
    vehicle: true,
    customer: { select: { id: true, name: true, phone: true, email: true } },
    laborItems: { include: { assignedMechanic: { select: { name: true } } } },
    partItems: true,
  },
});
```

## 3. Transacciones Interactivas y Consistencia
Operaciones que involucran múltiples cambios (ej. aprobar orden y descontar stock de repuestos) DEBEN ejecutarse dentro de una transacción atómica `prisma.$transaction`:

```typescript
export async function approveOrderAndDeductStock(orderId: string, workshopId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.repairOrder.findFirstOrThrow({
      where: { id: orderId, workshopId },
      include: { partItems: true },
    });

    if (order.status !== "PENDING_APPROVAL") {
      throw new Error("ORDER_NOT_IN_APPROVAL_STATE");
    }

    // Descontar stock de cada repuesto
    for (const part of order.partItems) {
      if (part.inventoryItemId) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: part.inventoryItemId },
        });

        if (item.stockQuantity < part.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: ${item.partNumber}`);
        }

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { stockQuantity: { decrement: part.quantity } },
        });
      }
    }

    // Actualizar estado de la orden
    return await tx.repairOrder.update({
      where: { id: orderId },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
  });
}
```

## 4. Política de Migraciones Seguras
- Toda migración debe ser compatible hacia atrás (estrategia Expand and Contract).
- Antes de ejecutar `prisma migrate dev` en ramas de trabajo, validar el esquema con `prisma validate` y `prisma format`.
- Nunca ejecutar `prisma migrate reset` en bases de datos con información real.
