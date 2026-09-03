---
name: observability
description: Telemetría, logs estructurados JSON, trazabilidad de auditoría y monitoreo para OS-CAR.
---

# Observability Skill — OS-CAR

Esta skill establece los lineamientos de monitoreo, métricas y trazabilidad técnica y de negocio en OS-CAR.

## 1. Logs Estructurados en Formato JSON
Todos los logs deben emitirse como objetos JSON estructurados para permitir su ingestión e indexación en herramientas de monitoreo:

```typescript
// lib/logger.ts
export interface LogPayload {
  level: "info" | "warn" | "error";
  message: string;
  correlationId?: string;
  workshopId?: string;
  userId?: string;
  orderId?: string;
  error?: { name: string; message: string; stack?: string };
  context?: Record<string, unknown>;
}

export function logInfo(message: string, meta?: Partial<LogPayload>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    message,
    ...meta,
  }));
}
```

## 2. Correlation ID en Cada Request
- Un middleware de Next.js (`src/middleware.ts`) adjunta a cada petición entrante un encabezado `x-correlation-id` (generando un UUIDv4 si no viene provisto).
- Este ID se incluye en cada log de servidor y se devuelve en los headers de respuesta para permitir la correlación entre incidentes reportados por usuarios y trazas de servidor.

## 3. Puntos de Auditoría de Negocio Obligatorios
La tabla `AuditLog` debe registrar de forma inmutable:
1. Cualquier cambio de estado en una Orden de Trabajo (`RepairOrder`).
2. Toda modificación de importes o ítems en un presupuesto emitido.
3. Descuentos, incrementos o ajustes manuales en el inventario de repuestos.
4. Altas, bajas o cambios de rol de usuarios dentro del taller.

## 4. Endpoint de Health Check
El sistema expone un endpoint `/api/health` que valida:
- Conexión activa con PostgreSQL (Neon DB).
- Estado del pool de conexiones.
- Tiempo de respuesta menor a 150ms.
Devuelve `200 OK` si todos los subsistemas están sanos o `503 Service Unavailable` ante degradación.
