---
name: auth-security
description: Autenticación, autorización RBAC server-side, sesiones y protección perimetral para OS-CAR.
---

# Authentication & Security Skill — OS-CAR

Esta skill define la implementación de control de acceso, seguridad y protección perimetral para el sistema OS-CAR.

## 1. Principio de Autorización Server-Side
La autenticación solo verifica la identidad de un usuario. La autorización determina qué puede hacer.
- **Regla Inviolable**: La autorización debe ejecutarse siempre en el servidor (en Server Actions o Handlers de API). La UI condicional en cliente solo mejora la experiencia de usuario pero no provee seguridad.

## 2. Aislamiento Multi-Tenant
OS-CAR soporta múltiples talleres independientes. Toda consulta y mutación debe filtrar obligatoriamente por el `workshopId` del usuario autenticado:

```typescript
// Patrón de consulta obligatoria con verificación de tenant
const userWorkshopId = session.user.workshopId;

const vehicle = await prisma.vehicle.findFirst({
  where: {
    id: vehicleId,
    workshopId: userWorkshopId, // Evita fugas IDOR (Insecure Direct Object Reference)
  },
});
```

## 3. Jerarquía y Funciones de Roles (RBAC)
```typescript
export const UserRole = {
  SUPER_ADMIN: "SUPER_ADMIN",
  WORKSHOP_OWNER: "WORKSHOP_OWNER",
  SERVICE_ADVISOR: "SERVICE_ADVISOR",
  MECHANIC: "MECHANIC",
  CUSTOMER: "CUSTOMER",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export function hasPermission(role: UserRole, action: "VIEW_FINANCES" | "EDIT_ORDER" | "APPROVE_BUDGET" | "LOG_LABOR"): boolean {
  switch (action) {
    case "VIEW_FINANCES":
      return role === "SUPER_ADMIN" || role === "WORKSHOP_OWNER";
    case "EDIT_ORDER":
      return role === "SUPER_ADMIN" || role === "WORKSHOP_OWNER" || role === "SERVICE_ADVISOR";
    case "APPROVE_BUDGET":
      return role === "SUPER_ADMIN" || role === "WORKSHOP_OWNER" || role === "CUSTOMER";
    case "LOG_LABOR":
      return role === "SUPER_ADMIN" || role === "WORKSHOP_OWNER" || role === "MECHANIC";
    default:
      return false;
  }
}
```

## 4. Prácticas Perimetrales
- Cookies de sesión con flags `HttpOnly`, `SameSite=Lax` y `Secure: true`.
- Tokens de acceso único (magic links) para clientes que aprueban presupuestos, firmados con HMAC y con expiración de 48h.
- Rate limiting en endpoints públicos de login y búsqueda de órdenes para mitigar ataques de fuerza bruta.
