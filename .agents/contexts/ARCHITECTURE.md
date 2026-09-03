# Architecture Context — OS-CAR

## Architectural Style
- **Modular Monolith con Clean Architecture**: Diseñado para evolucionar sin sobrecostes operativos.
- **Capas del Sistema**:
  1. **Presentation**: Next.js App Router (`/app`), React 19 Server & Client Components, Tailwind CSS v4 con componentes accesibles.
  2. **Application**: Server Actions y Handlers de API (`/actions`, `/api`), validadores Zod, coordinación de casos de uso y transacciones.
  3. **Domain**: Entidades puras (`Vehicle`, `RepairOrder`, `Budget`, `InventoryItem`), Value Objects (`LicensePlate`, `VIN`, `Currency`), invariantes y reglas de transición de estados.
  4. **Infrastructure**: Prisma Client, PostgreSQL (Neon Serverless), clientes de mensajería (Resend, WhatsApp) y almacenamiento de imágenes (S3 / Cloudinary).

## Module Boundaries
- `modules/vehicles`: Registro, búsqueda por patente, VIN decoder y ficha técnica histórica.
- `modules/customers`: CRM liviano, gestión de datos fiscales, contactos y flotas corporativas.
- `modules/repair-orders`: Máquina de estados de la OT, checklist de recepción, fotos, asignación a mecánicos y control de tiempos.
- `modules/budgeting`: Generador de presupuestos, desglose de mano de obra y repuestos, cálculos impositivos y flujo de aprobación.
- `modules/inventory`: Catálogo de repuestos, proveedores, alertas de stock mínimo y trazabilidad de movimientos.
- `modules/billing`: Facturación, pagos y reportes de rentabilidad por orden.
- `modules/auth`: Autenticación multi-tenant y middleware de autorización RBAC server-side.

## Data Flow
```text
User Action (UI Form / Button)
   ↓ (Client-side validation)
Server Action / API Endpoint
   ↓ (Zod DTO Validation & Auth Session Check)
Application Service / Use Case
   ↓ (Business Logic & Domain Invariants)
Prisma Repository / Transaction
   ↓ (SQL execution with Connection Pooling)
PostgreSQL (Neon DB)
```

## Architectural Decision Records (ADRs)
- **ADR-001**: Adopción de Next.js App Router con Server Actions como patrón primario de mutación.
- **ADR-002**: Desacoplamiento estricto de Mano de Obra y Repuestos en el modelo relacional y DTOs.
- **ADR-003**: Control de concurrencia optimista en Órdenes de Trabajo mediante campo `version` / `updatedAt`.
