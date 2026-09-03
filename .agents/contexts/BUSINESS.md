# Business Context — OS-CAR

## Business Model
- **SaaS / Self-hosted para talleres automotrices**: Suscripción mensual/anual por taller según cantidad de puestos de trabajo (elevadores/bahías) y mecánicos activos.
- **Transparencia hacia el cliente final**: Incremento de retención y ticket promedio eliminando la desconfianza habitual del rubro mediante presupuestos auditables y fotos del estado de los repuestos reemplazados.

## Actors & Roles
1. **SUPER_ADMIN**: Administración global de la plataforma, tenants y facturación SaaS.
2. **WORKSHOP_OWNER**: Control total del taller, configuración de tarifas horarias, márgenes de repuestos, mecánicos y reportes financieros.
3. **SERVICE_ADVISOR**: Recepción de vehículos, comunicación directa con clientes, emisión de presupuestos y cobranzas.
4. **MECHANIC**: Visualización de OTs asignadas, registro de tareas realizadas, solicitud de piezas al pañol y fotos de evidencia técnica.
5. **CUSTOMER**: Visualización de estado de su vehículo, aprobación/rechazo de presupuestos y descarga de facturas/comprobantes.

## Core Outcomes
- Reducir el tiempo de check-in vehicular de 15 minutos a menos de 90 segundos.
- Reducir el rechazo de presupuestos al desglosar de forma transparente repuestos y mano de obra con fotos adjuntas.
- Cero pérdida de piezas o repuestos gracias al control de inventario vinculado a la OT.
- Historial clínico vehicular unificado por patente (VIN) para facilitar servicios futuros o reventa.

## Business Rules & Invariants
1. Una Orden de Trabajo no puede pasar a `IN_PROGRESS` sin la aprobación expresa del cliente (o bypass manual autorizado por `WORKSHOP_OWNER`).
2. La Mano de Obra y los Repuestos deben calcularse y presentarse en renglones contables separados en todo presupuesto y factura.
3. El kilometraje registrado en un nuevo ingreso debe ser igual o superior al último kilometraje histórico del vehículo en el taller.
4. Las piezas retiradas de inventario para una OT no pueden liberarse a stock sin un evento de devolución auditado.
