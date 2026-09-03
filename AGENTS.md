# AGENTS.md — OS-CAR (Automotive Workshop Operating System)

## Resumen del proyecto

**OS-CAR** es un sistema integral de gestión operativa y administrativa de talleres mecánicos y flotas automotrices. El sistema centraliza la recepción vehicular con checklist digital, generación y aprobación transparente de presupuestos (desglose estricto de mano de obra y repuestos), asignación y seguimiento de órdenes de reparación en tiempo real, gestión de inventario de repuestos y portal de cliente para seguimiento de estado e historial de servicios.

La arquitectura de referencia está construida sobre TypeScript de extremo a extremo, Next.js App Router (React 19, Server Components y Server Actions), Tailwind CSS v4, Prisma ORM con PostgreSQL (NeonDB), Zod para validación de contratos y Better Auth para autenticación y autorización por roles.

## Equipo de ingeniería

La entrada operativa única es `fullstack-orchestrator`, definido en `.agents/agents/fullstack-orchestrator.md`. Se dispone del equipo completo de 19 roles de ingeniería especializados:

- **Análisis**: `product-requirements`, `domain-architect`, `software-architect`
- **Construcción**: `database-prisma`, `auth-policy`, `backend-application`, `frontend-architect`, `ui-ux`, `integration-specialist`, `async-jobs-engineer`, `migration-refactoring`
- **Verificación**: `qa-test`, `accessibility-specialist`, `observability-engineer`, `performance-engineer`, `security-review`, `code-review`
- **Operaciones**: `devops`, `release-manager`

### Skills prioritarias para OS-CAR:
`automotive-workshop-domain`, `nextjs-architecture`, `typescript-reliability`, `prisma-postgres`, `auth-security`, `ui-system`, `testing-quality`, `api-design-principles`, `database-design`, `devops-cicd`, `release-engineering`.

## Setup, desarrollo y validación

Desde la raíz del proyecto:

- Instalación: `pnpm install` (o `npm install`)
- Desarrollo: `pnpm dev`
- Verificación estática / Lint: `pnpm lint`
- Comprobación de tipos TypeScript: `pnpm exec tsc --noEmit`
- Tests automatizados: `pnpm test`
- Build de producción: `pnpm build`
- Base de datos / Migraciones: `pnpm prisma migrate dev` (requiere aprobación explícita según policy)
- Generación de cliente Prisma: `pnpm prisma generate`

## Arquitectura y reglas de código

1. **Separación de capas**: Presentación (UI/Components) → Aplicación (Casos de uso/Server Actions) → Dominio (Entidades de taller, invariantes y reglas de negocio) → Infraestructura (Prisma, PostgreSQL, servicios externos).
2. **Tipado estricto**: Sin uso de `any` ni type assertions inseguras (`as unknown as T`). Validación en runtime obligatoria en todos los bordes (inputs de usuario, queries de API, webhooks) mediante Zod.
3. **Manejo de errores**: Uso de tipos de retorno explícitos (`Result<T, E>`) o errores de dominio estructurados. Sin bloques `catch` vacíos ni errores en silencio.
4. **Persistencia y consultas**: Todas las consultas Prisma deben seleccionar campos necesarios (`select`) o incluir relaciones explícitas (`include`) para prevenir problemas N+1. Modificaciones de esquema requieren evaluación de `database-prisma`.
5. **UI y Diseño**: Interfaz orientada al ritmo operativo del taller (modo oscuro de alto contraste y legibilidad para tablets en fosa/mostrador, feedback visual inmediato, estados de órdenes claramente diferenciados por colorimetría semántica).

## Seguridad y políticas

1. **Autorización estricta**: La autenticación confirma identidad; la autorización valida permisos. Cada Server Action o endpoint API debe comprobar sesión, rol (Owner, Mecánico, Recepción, Cliente) y pertenencia al taller (`workshopId`) en el servidor.
2. **Límites de confianza**: Ningún dato de cliente o vehículo debe mutarse sin validación de ownership.
3. **Manejo de secretos**: Nunca versionar ni registrar en consola variables `.env`, tokens JWT, claves privadas ni credenciales de base de datos.
4. **Operaciones protegidas**: Migraciones destructivas de base de datos, comandos `prisma migrate reset`, force push o despliegues productivos exigen aprobación humana explícita mediante los hooks de seguridad de Antigravity.

## Flujo de contribución y Quality Gates

Todo cambio o funcionalidad debe seguir la secuencia formal de gates:

```text
G0 (Requirements) -> G1 (Domain) -> G2 (Architecture) -> G3 (Data) ->
G4 (Security) -> G5 (Implementation) -> G6 (Verification) -> G7 (Review) -> G8 (Release)
```

Antes de cerrar cualquier tarea:
- Inspeccionar `git diff --check` y el diff completo.
- Ejecutar y verificar `pnpm lint`, `pnpm exec tsc --noEmit` y suite de tests.
- Asegurar que ningún builder aprueba su propio trabajo sin pasar por los gates independientes (`qa-test`, `security-review`, `code-review`).
