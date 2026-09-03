# Observability Context — OS-CAR

## Telemetry Principles
- **Structured JSON Logging**: Uso de formato JSON con campos estandarizados (`timestamp`, `level`, `service`, `correlationId`, `userId`, `workshopId`, `message`, `error`).
- **Correlation IDs**: Cada petición HTTP o Server Action genera un UUID único (`x-correlation-id`) propagado en los headers y en todos los logs correspondientes.

## Key Metrics to Monitor
1. **Business Metrics**:
   - Cantidad de OTs ingresadas por día/semana.
   - Tiempo promedio de permanencia del vehículo en taller (`lead time`).
   - Tasa de aprobación de presupuestos (% aprobados vs rechazados).
   - Ingresos desglosados (Mano de Obra vs Repuestos).
2. **Technical Metrics**:
   - Latencia P95 de Server Actions y endpoints de búsqueda vehicular.
   - Conexiones activas y en espera en el pool de Neon DB.
   - Tasa de errores HTTP 4xx y 5xx.

## Audit Trail (Trazabilidad Operativa)
- La tabla `AuditLog` registra de forma inmutable:
  - Quién realizó el cambio (Usuario ID y Rol).
  - Qué entidad fue afectada (`RepairOrder`, `Budget`, `InventoryItem`).
  - Acción ejecutada (`CREATE`, `UPDATE_STATUS`, `EDIT_LABOR`, `ADJUST_STOCK`).
  - Snapshot de cambios (`previousState`, `newState`).
  - Timestamp con zona horaria.
