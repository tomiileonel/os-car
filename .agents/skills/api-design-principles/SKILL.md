---
name: api-design-principles
description: Estándares de diseño de APIs REST y Server Actions, contratos DTO, envelopes y códigos HTTP.
---

# API Design Principles Skill — OS-CAR

Esta skill estandariza la arquitectura y diseño de interfaces de programación (APIs) y Server Actions en OS-CAR.

## 1. Patrón Envelope Unificado
Todas las respuestas de endpoints RESTful bajo `/api/v1/*` deben usar la estructura estándar:

```typescript
// Exitoso
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}

// Con Error (basado en RFC 7807 Problem Details)
{
  "success": false,
  "error": {
    "code": "VEHICLE_NOT_FOUND",
    "message": "No vehicle registered with license plate AB123CD in this workshop.",
    "details": { "licensePlate": "AB123CD" }
  }
}
```

## 2. Convenciones de Nomenclatura y Rutas
- Recursos en plural y en minúsculas: `/api/v1/repair-orders`, `/api/v1/vehicles`, `/api/v1/customers`.
- Subrecursos anidados para pertenencia directa: `/api/v1/repair-orders/:id/labor-items`.
- Operaciones no CRUD expresadas como acciones semánticas: `POST /api/v1/repair-orders/:id/approve`.

## 3. Manejo de Errores y Códigos HTTP
- `200 OK`: Operación exitosa (lectura o actualización).
- `201 Created`: Recurso creado exitosamente (incluir header `Location` o entidad en `data`).
- `400 Bad Request`: Error de validación sintáctica o de esquema Zod en el payload recibido.
- `401 Unauthorized`: Usuario no autenticado o token ausente/inválido.
- `403 Forbidden`: Usuario autenticado pero sin rol o intentando acceder a recursos de otro taller.
- `404 Not Found`: El identificador solicitado no existe en la base de datos del taller.
- `409 Conflict`: Violación de unicidad (ej. registrar dos veces la misma patente) o conflicto de concurrencia optimista.
- `422 Unprocessable Entity`: La sintaxis es válida pero viola una regla de negocio del dominio (ej. intentar cerrar una orden que no pasó por control de calidad).
- `500 Internal Server Error`: Fallo no recuperable del servidor (enmascarando siempre detalles de base de datos o stack traces hacia el cliente).

## 4. Idempotencia en Pagos y Creación de OTs
Para evitar duplicados por cortes de red o doble click del usuario, las peticiones mutables deben aceptar un encabezado `Idempotency-Key: <UUID>`. Si la clave ya fue procesada, el servidor devuelve la respuesta almacenada previamente sin re-ejecutar la lógica.
