# Database Context — OS-CAR

## Engine & Infrastructure
- **Engine**: PostgreSQL 16+
- **Host**: Neon Serverless Postgres con pooling integrado (`pgbouncer` en puerto 6543 / directo en 5432).
- **ORM**: Prisma ORM con tipado autogenerado en `@prisma/client`.

## Core Entities & Relational Design
1. `Workshop`: Tenant / Taller mecánico (soporte multi-tenant con aislamiento de datos).
2. `User`: Usuarios del sistema con roles (`WORKSHOP_OWNER`, `SERVICE_ADVISOR`, `MECHANIC`, `CUSTOMER`).
3. `Customer`: Cliente del taller (persona física o empresa de flota).
4. `Vehicle`: Vehículo registrado (patente, VIN, marca, modelo, año, color, motor).
5. `RepairOrder`: Orden de Trabajo principal (código de OT, estado, kilometraje, combustible, observaciones).
6. `InspectionChecklist`: Inspección visual pericial al ingresar el auto (rayas, abolladuras, nivel de aceite, pertenencias).
7. `LaborItem`: Ítem de mano de obra asociado a la OT (descripción, horas trabajadas, tarifa horaria, mecánico asignado).
8. `PartItem`: Ítem de repuesto/pieza asociado a la OT (código pieza, descripción, cantidad, costo unitario, precio de venta, proveedor).
9. `InventoryItem`: Catálogo de stock del taller con control de existencias y precio de reposición.
10. `Invoice`: Comprobante fiscal/comercial generado al completar la OT.
11. `AuditLog`: Registro de auditoría de cada cambio de estado, edición de presupuestos y movimientos de stock.

## Indexing Strategy
- Índices únicos compuestos por `[workshopId, licensePlate]` y `[workshopId, vin]`.
- Índice B-Tree en `RepairOrder(status, createdAt)` para listados ágiles y tableros kanban.
- Índice en `RepairOrder(customerId)` y `RepairOrder(vehicleId)`.
- Índice en `InventoryItem(workshopId, partNumber)`.

## Migration & Data Safety Rules
- Cero migraciones destructivas sin aprobación explícita de `database-prisma` y confirmación humana.
- Todo campo nuevo debe ser opcional o contar con valor por defecto antes de ser requerido.
- Uso mandatorio de transacciones interactivas (`prisma.$transaction`) al crear o actualizar OTs con sus ítems y descuentos de stock.
