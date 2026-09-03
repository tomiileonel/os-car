---
name: typescript-reliability
description: Reglas estrictas de tipado, validación runtime y confiabilidad en TypeScript para OS-CAR.
---

# TypeScript Reliability Skill — OS-CAR

Esta skill define los estándares de confiabilidad, tipado estricto y manejo de errores en TypeScript para todo el código de OS-CAR.

## 1. Configuración de Compilación Estricta
El proyecto debe compilar siempre bajo las opciones más rigurosas de `tsconfig.json`:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`

## 2. Prohibición Absoluta de `any` y Type Assertions Inseguras
- **Prohibido**: Uso del tipo `any`. Debe usarse `unknown` cuando el tipo no se conozca de antemano, y validarlo mediante un schema Zod o Type Guard antes de su consumo.
- **Prohibido**: El uso de `as unknown as T` o casts forzados para eludir el sistema de tipos.
- **Excepción única**: Type Assertions controladas solo permitidas en tests unitarios para simular errores de infraestructura.

## 3. Discriminated Unions para Estados del Dominio
Todo modelo de estado o respuesta debe utilizar Uniones Discriminadas para garantizar cobertura exhaustiva en tiempo de compilación:

```typescript
export type RepairOrderStatus =
  | { state: "DRAFT"; draftCreatedAt: Date }
  | { state: "PENDING_APPROVAL"; budgetId: string; sentToCustomerAt: Date }
  | { state: "APPROVED"; approvedAt: Date; approvalSignature: string }
  | { state: "IN_PROGRESS"; assignedMechanicId: string; startedAt: Date }
  | { state: "QUALITY_CONTROL"; completedAt: Date; inspectorNotes?: string }
  | { state: "READY_FOR_PICKUP"; readyAt: Date }
  | { state: "DELIVERED"; deliveredAt: Date; recipientName: string }
  | { state: "CANCELLED"; cancelledAt: Date; reason: string };

export function formatOrderStatusBadge(status: RepairOrderStatus): { label: string; variant: string } {
  switch (status.state) {
    case "DRAFT":
      return { label: "Borrador", variant: "secondary" };
    case "PENDING_APPROVAL":
      return { label: "Por Aprobar", variant: "warning" };
    case "APPROVED":
      return { label: "Aprobado", variant: "info" };
    case "IN_PROGRESS":
      return { label: "En Reparación", variant: "primary" };
    case "QUALITY_CONTROL":
      return { label: "Control de Calidad", variant: "accent" };
    case "READY_FOR_PICKUP":
      return { label: "Listo para Entrega", variant: "success" };
    case "DELIVERED":
      return { label: "Entregado", variant: "muted" };
    case "CANCELLED":
      return { label: "Cancelado", variant: "destructive" };
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}
```

## 4. Patrón Result para Manejo de Errores de Negocio
No lanzar excepciones (`throw new Error`) para condiciones esperadas de negocio (ej. vehículo no encontrado, repuesto sin stock suficiente). Emplear el patrón `Result`:

```typescript
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```
