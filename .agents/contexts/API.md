# API Context — OS-CAR

## API Principles
- **Next.js Server Actions**: Utilizados primariamente para mutaciones de UI con revalidación instantánea (`revalidatePath`, `revalidateTag`).
- **RESTful Endpoints (`/api/v1/*`)**: Reservados para integraciones externas, webhooks, app móvil o consumo de pañol/lectores de código de barras.

## Unified Response Envelope
Todas las respuestas de API REST deben adherirse a la estructura canónica:

```typescript
type ApiResponse<T> =
  | { success: true; data: T; meta?: { page?: number; limit?: number; total?: number } }
  | { success: false; error: { code: string; message: string; details?: unknown } };
```

## Standard Status Codes
- `200 OK`: Operación de lectura o actualización exitosa.
- `201 Created`: Recurso creado exitosamente (ej. nueva OT, nuevo vehículo).
- `400 Bad Request`: Fallo en la validación Zod del payload.
- `401 Unauthorized`: Sesión ausente o expirada.
- `403 Forbidden`: Permisos insuficientes o intento de acceso a otro taller (`workshopId` ajeno).
- `404 Not Found`: Recurso no existente.
- `409 Conflict`: Conflicto de concurrencia o duplicación de patente/VIN en el mismo taller.
- `500 Internal Server Error`: Excepción no controlada (con ID de traza devuelto al cliente y stack trace privado en logs).

## Key Resource Endpoints
- `POST /api/v1/vehicles`: Alta o actualización de vehículos.
- `GET /api/v1/vehicles?search={plate}`: Búsqueda ágil por patente o VIN.
- `POST /api/v1/repair-orders`: Creación de Orden de Trabajo.
- `PATCH /api/v1/repair-orders/:id/status`: Transición de estado con auditoría.
- `POST /api/v1/repair-orders/:id/budget/approve`: Aprobación digital de presupuesto por cliente.
- `POST /api/v1/webhooks/whatsapp`: Recepción de eventos de mensajería.
