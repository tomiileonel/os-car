---
name: project-context
description: Directrices normativas del contexto operativo, modelo de negocio y arquitectura de OS-CAR.
---

# Project Context — OS-CAR Workshop OS

Esta skill define el marco de referencia obligatorio para todo agente o desarrollador que interactúe con el código de OS-CAR.

## 1. Identidad y Misión del Sistema
**OS-CAR** es el Sistema Operativo para Talleres Mecánicos y Centros Automotrices. Su diseño prioriza:
- **Agilidad Operativa**: Captura ultra-rápida desde tablets en el taller (recepción en menos de 90 segundos).
- **Transparencia Financiera**: Separación estricta e inmutable entre Mano de Obra (MO) y Repuestos en presupuestos, órdenes y facturas.
- **Trazabilidad Pericial**: Checklist visual de daños con registro de fotos, kilometraje y combustible al ingresar.

## 2. Invariantes de Dominio
1. **Unicidad Vehicular por Taller**: La combinación `[workshopId, licensePlate]` es única. La patente se normaliza sin espacios ni guiones en mayúsculas (ej: `AB123CD`).
2. **Máquina de Estados de la Orden de Trabajo (OT)**:
   - `DRAFT` ➔ `PENDING_APPROVAL` ➔ `APPROVED` ➔ `IN_PROGRESS` ➔ `QUALITY_CONTROL` ➔ `READY_FOR_PICKUP` ➔ `DELIVERED` ➔ `INVOICED`.
   - Transiciones reversibles o cancelaciones (`CANCELLED`) exigen motivo documentado y rol `WORKSHOP_OWNER`.
3. **Cálculo de Presupuestos**:
   - Total = Subtotal Mano de Obra + Subtotal Repuestos + Impuestos (IVA) - Descuentos autorizados.
   - Subtotal MO = $\sum (Horas Estimadas \times Tarifa Horaria)$.
   - Subtotal Repuestos = $\sum (Cantidad \times Precio Venta Unitario)$.
   - Está prohibido fusionar mano de obra y repuestos en un solo ítem genérico.

## 3. Roles del Taller y Matriz de Permisos
- `WORKSHOP_OWNER`: Acceso total, definición de tarifas, márgenes de ganancia, alta de mecánicos, bypass de aprobaciones.
- `SERVICE_ADVISOR`: Check-in, emisión de presupuestos, comunicación con cliente, cobranza y entrega.
- `MECHANIC`: Visualización de OTs asignadas, registro de horas reales, solicitud de repuestos al pañol, checklist técnico.
- `CUSTOMER`: Vista pública de su OT vía token seguro de lectura; aprobación/rechazo de presupuestos con firma digital/click auditado.

## 4. Estructura de Directorios Estándar
```text
os-car/
├── src/
│   ├── app/                 # Next.js App Router (Páginas, layouts, rutas protegidas)
│   ├── actions/             # Server Actions tipadas para mutaciones
│   ├── components/          # Componentes UI (ui, forms, layout, workshop)
│   ├── domain/              # Modelos y entidades de dominio puras
│   ├── lib/                 # Utilidades (db, auth, utils, formatters)
│   ├── modules/             # Módulos de negocio (vehicles, orders, inventory)
│   └── types/               # Definiciones de tipos TypeScript globales
├── prisma/
│   ├── schema.prisma        # Modelo de datos relacional
│   └── migrations/          # Historial de migraciones SQL
├── public/                  # Assets estáticos
└── tests/                   # Suites de tests (unit, integration, e2e)
```
