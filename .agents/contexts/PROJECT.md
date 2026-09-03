# Project Context — OS-CAR

## Product
- **Name**: OS-CAR (Automotive Workshop Operating System)
- **Purpose**: Sistema operativo integral de control operativo, presupuestario y administrativo para talleres mecánicos, centros de servicio automotriz y gestión de flotas vehiculares.
- **Primary Users**:
  - **Dueños y Gerentes de Taller (Owner/Manager)**: Supervisión financiera, métricas de taller, facturación, márgenes en repuestos y mano de obra.
  - **Jefes de Taller y Mecánicos (Lead Mechanic / Technician)**: Recepción de órdenes de trabajo (OT), diagnóstico técnico, imputación de horas, pedido de repuestos al pañol y checklists de control de calidad.
  - **Recepcionistas / Asesores de Servicio (Service Advisor)**: Check-in de vehículos con checklist visual de daños, captura de kilometraje/combustible, contacto con clientes y envío de presupuestos.
  - **Clientes Particulares y Gestores de Flota (Client / Fleet Customer)**: Aprobación remota de presupuestos, seguimiento en vivo del avance y acceso al historial de mantenimiento.

## Critical Flows
1. **Recepción Vehicular (Check-in)**: Registro ágil de patente, VIN, kilometraje, nivel de combustible y checklist pericial de carrocería y pertenencias.
2. **Presupuestación Transparente**: Desglose estricto entre Mano de Obra (horas estimadas x tarifa) y Repuestos (precios unitarios, marcas y recargo comercial), con cálculo automático de impuestos y totales.
3. **Flujo de Orden de Trabajo (OT)**: Transición de estados de máquina finita (`DRAFT` ➔ `PENDING_APPROVAL` ➔ `APPROVED` ➔ `IN_PROGRESS` ➔ `QUALITY_CONTROL` ➔ `READY_FOR_PICKUP` ➔ `DELIVERED` ➔ `INVOICED`).
4. **Control de Inventario de Repuestos**: Descuento automático de stock al aprobar la orden, alertas de punto de reposición y gestión de proveedores.
5. **Notificaciones Omnicanal**: Enlace único de seguimiento enviado al cliente por WhatsApp y correo electrónico con visualización móvil optimizada.

## Scale & Performance Targets
- **Target Response Time**: P95 < 200ms en endpoints de consulta y Server Actions.
- **High Concurrency Readiness**: Soporte para múltiples mecánicos actualizando tareas simultáneamente con bloqueo optimista en órdenes.
- **Availability Target**: 99.9% uptime.
