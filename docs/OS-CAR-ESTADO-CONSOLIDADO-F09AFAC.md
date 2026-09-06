# DICTAMEN DE AUDITORÍA ARQUITECTÓNICA Y DE SEGURIDAD — COMMIT f09afac

**Proyecto:** OS-CAR
**Fecha de verificación:** 2026-09-05
**Checkout auditado:** `fix/g7-structural-review`
**Commit local:** `f09afac96eeeea0140f20d7417e8f28e03ce7505`
**Referencia remota local:** `origin/fix/g7-structural-review` apunta al mismo commit
**Alcance:** estado consolidado del repositorio, remediaciones G7, seguridad, multitenancy, concurrencia, persistencia y preparación para staging/producción

## Resumen ejecutivo verificable

El commit auditado corrige parcialmente los cuatro hallazgos previos, pero el proyecto no está listo para staging ni producción.

| Verificación | Resultado observado |
|---|---|
| `npm run test` | **PASS:** 8 suites, 59 tests, 0 fallos |
| `npm run typecheck` | **PASS:** `tsc --noEmit` sin errores |
| `npm run prisma:validate` | **PASS parcial:** el datamodel Prisma es válido; no prueba la migración SQL |
| `npm run lint` | **NO VERIFICADO:** el script solo ejecuta `echo No lint errors` |
| `npm run build` | **FAIL:** Next/Webpack rechaza `node:diagnostics_channel` importado por `ioredis` desde Middleware |
| Migración inicial | **FAIL de release:** no contiene DDL de tablas, falta `migration_lock.toml` y contiene un predicado parcial con `CURRENT_DATE` |
| Tests contra PostgreSQL/Redis reales | **NO VERIFICADO:** las suites observadas usan mocks y stubs |
| Rutas funcionales | **INCOMPLETO:** existe `app/api/vehicles` y Better Auth; no están expuestos todavía los flujos completos de OT, tracking público, presupuesto, bahías y dashboard |

**Causa raíz:** el proyecto tiene una buena capa de servicios y pruebas unitarias de invariantes, pero el estado declarado como “100% verificado” confunde validación estática/local con validación de release. La formalización de concurrencia mejoró, pero quedan gaps entre contratos de servicio, esquema, migración, autorización y runtime de Next.js.

**Veredicto vinculante:** `REJECTED`.

El rechazo no invalida el trabajo del commit: significa que la remediación G7 es una base prometedora, no una certificación de producción.

## 1. TABLA DE EVALUACIÓN DE REMEDIACIONES PREVIAS

| ID Hallazgo | Componente | Diagnóstico Previo | Estado en f09afac | Certificación Técnica y Análisis de Efectos Secundarios |
|---|---|---|---|---|
| SEC-01 | `middleware.ts` | Rate limit bypass vía `x-workshop-id` | **RESUELTO CON RESIDUAL** | La clave ya no depende de una cabecera de tenant mutable: usa bucket, IP y entorno. El test adversarial de 11 rotaciones pasa. No se certifica eliminación total de evasión porque `clientIp()` confía directamente en el primer `x-forwarded-for`; además `djb2Hex` es un hash de 32 bits no criptográfico. El proxy debe sobrescribir/limpiar la cabecera y el código debe usar una identidad de red confiable o un hash criptográfico. |
| DATA-02 | `order-blocker.service.ts` | FK inválida por literal `system-automation` | **RESUELTO PARCIALMENTE** | Se eliminó el literal y el servicio exige un `AdminUser` existente, primero por actor explícito, luego por creador de la orden y finalmente por un admin activo del taller; si no existe, falla cerrado con `NO_ADMIN_ACTOR_AVAILABLE`. Eso evita la violación FK original. No garantiza integridad tenant/estado absoluta: `createdById` y `actorAdminId` no se validan siempre contra `workshopId` y `active`, y no existe FK compuesta que obligue a esa pertenencia. |
| CONC-02 | `order-calculation.service.ts` | Sesgo por `ROUND_HALF_UP` | **RESUELTO CONDICIONADO** | `roundMoney` usa `Decimal.ROUND_HALF_EVEN` y las pruebas `1.665 → 1.66` y `1.675 → 1.68` pasan. La decisión es matemáticamente coherente con Banker's Rounding. Falta fijar formalmente si el negocio redondea por línea, subtotal o total final: hoy se redondea cada línea y luego se suman las líneas. |
| CONC-03 | `withSerializableRetry` | Sin pruebas de `40001`/`40P01` | **RESUELTO A NIVEL UNITARIO; RESIDUAL EN RESILIENCIA** | Hay tests para `40001`, `40P01`, agotamiento y errores de dominio sin retry. No hay prueba contra PostgreSQL bajo contención real, no se verifica backoff temporal ni jitter, y el código usa `25 * attempt`, que es backoff lineal, no exponencial. |

### Observación específica sobre C1/C2 de la auditoría pegada

La versión del código auditada ya contiene `PartItem.version` en el schema y `updatePartItemInTx` valida `expectedVersion`, incrementa la versión y recalcula bloqueadores/totales dentro de una transacción Serializable. Por tanto, la afirmación “PartItem no tiene columna version” está desactualizada para este checkout.

La remediación sigue incompleta: no existe un servicio equivalente de mutación de `WorkItem`, el recálculo no verifica una versión del `WorkOrder` en el `update`, y no se demuestra que toda mutación futura de líneas pase por el caso de uso común.

## 2. AUDITORÍA PROFUNDA DE SEGURIDAD Y MULTITENANCY

### 2.1 Aislamiento cross-tenant

Hay buenas prácticas verificables:

- `app/api/vehicles/route.ts` toma `workshopId` de la sesión y lo usa en `findMany`, `count`, validación del cliente y creación.
- `order-blocker.service.ts` busca la orden con `id + workshopId + deletedAt: null`.
- `part-item.service.ts` busca y actualiza el repuesto con `id + workshopId + deletedAt: null`.
- `delivery.service.ts` busca y actualiza la orden con `id + workshopId`, estado y versión.
- `budget-approval.service.ts` comprueba que la versión pertenece a la orden y que la orden pertenece al `workshopId` recibido.

Persisten límites:

1. El tenant llega correctamente desde el caso de uso en varias rutas, pero no hay un guard central de autorización que garantice que cada actor administrativo sea una membresía `AdminUser` activa.
2. `app/api/vehicles` comprueba que exista `session.user.workshopId`, pero no comprueba rol, `AdminUser.active`, `deletedAt` ni capacidad específica. Una sesión autenticada con `workshopId` no equivale por sí sola a autorización RBAC.
3. Las relaciones Prisma usan claves simples. Por ejemplo, `WorkOrder.createdById → AdminUser.id` y `OrderBlocker.blockedByUserId → AdminUser.id` no obligan a que ambos registros compartan `workshopId`. La aplicación debe validar esa pertenencia o el schema debe introducir claves compuestas.
4. `OrderBlocker.workOrder` usa `onDelete: Cascade`, incompatible con la exigencia de conservar historial si se produce un hard delete directo en base de datos. El soft delete de aplicación no elimina el riesgo de una operación DDL/DML privilegiada.

### 2.2 SEC-01: clave de rate limit y frontera de confianza

La modificación en `middleware.ts` elimina el vector concreto de rotar `x-workshop-id`. El test integrado confirma que 11 valores distintos de esa cabecera desde la misma IP llegan al mismo bucket y reciben `429`.

La remediación no prueba todas las condiciones de despliegue:

- `clientIp()` toma el primer valor de `x-forwarded-for`. Si el balanceador/CDN no elimina la cabecera entrante y la reemplaza por una cadena confiable, el cliente puede rotar la IP declarada y evadir el límite.
- `djb2Hex` no es criptográfico y tiene salida de 32 bits. No es una fuga de secreto, pero permite colisiones accidentales o provocadas con suficiente control de la entrada; el efecto esperado es contaminación/DoS de buckets, no autenticación.
- La clave no distingue tenant, lo cual es correcto solo si la política perimetral deliberadamente limita por IP global. Si se necesita cuota por taller, debe añadirse un tenant confiable obtenido del contexto autenticado, no de una cabecera libre.
- El camino de Redis se importa desde un módulo que dinámicamente carga `ioredis`, pero ese módulo se importa desde Middleware Edge. Esto impide el build actual y deja sin artefacto desplegable el rate limit real.

**Mitigación obligatoria:** usar un cliente compatible con Edge/REST para Middleware, o sacar el acceso a Redis Node-only del Middleware y ubicarlo en un handler Node con una barrera perimetral compatible. Definir explícitamente qué proxy es autoridad para la IP y reemplazar el hash 32-bit por SHA-256/HMAC truncado con longitud suficiente.

### 2.3 DATA-02: actor del bloqueador

La eliminación del literal inválido es correcta. El fail-closed también es correcto desde integridad: es preferible no crear el bloqueador a crear una fila con FK inexistente.

El comportamiento tiene dos riesgos operativos y de seguridad:

- Si `createdById` apunta a un admin desactivado, eliminado lógicamente o de otro taller por datos inconsistentes, el servicio lo utiliza antes de buscar un admin activo del taller.
- Si `actorAdminId` es suministrado por un caller no validado, el servicio puede asociar una acción a un ID que exista pero no corresponda al tenant. El presupuesto valida al admin en su propio flujo; el servicio de bloqueadores no lo garantiza autónomamente.

**Mitigación obligatoria:** resolver el actor con una consulta `id + workshopId + active + deletedAt: null`; si se necesita preservar un actor histórico desactivado, separar `createdByAdminId` histórico de `resolvedByAdminId` operativo o introducir un actor de sistema relacional por taller. No usar un fallback cross-tenant.

### 2.4 Rate limiting e idempotencia

`src/lib/redis.ts` tiene una ventana deslizante atómica en Lua y fallback en memoria. El fallback es seguro para continuidad local, pero no ofrece protección global entre réplicas. No puede aprobarse producción sin almacenamiento distribuido funcional o una política explícita de fail-closed para endpoints sensibles.

El schema de `IdempotencyRecord` tiene `expiresAt`, estado e índice, pero en el checkout no se verificó un job de purga ni un flujo completo que diferencie una clave `IN_PROGRESS`, `RESOLVED` o expirada. El TTL debe ser mayor que la ventana de retry del cliente y la purga debe ser un job de mantenimiento, no una operación que permita reejecutar ciegamente una creación crítica.

## 3. ANÁLISIS DE CONCURRENCIA, TRANSACCIONES Y RFC 7807

### 3.1 Concurrencia y transacciones

Aspectos positivos:

- `PartItem` tiene versión y su update usa condición `id + workshopId + version + deletedAt: null`.
- Recalcular totales desde `part-item.service.ts` ocurre después de modificar el ítem, dentro de la misma transacción.
- `delivery.service.ts` usa `expectedVersion`, estado `LISTO` y `updateMany` condicional antes de crear la entrega y liberar la bahía.
- `budget-approval.service.ts`, entrega y actualización de repuesto usan aislamiento `Serializable` y el retry compartido.

Gaps residuales:

1. `recalculateOrderTotalsInTx` actualiza los totales de `WorkOrder` por `id`, sin `version` ni incremento de la versión de la orden. Bajo el flujo actual Serializable esto reduce el riesgo, pero no convierte el contrato en una garantía verificable para callers futuros.
2. `WorkItem.version` existe en Prisma, pero no hay un servicio de actualización equivalente visible en el bundle auditado. No se puede certificar la invariancia “toda mutación de hijo exige versión”.
3. `OrderBlocker` no tiene un índice único parcial por `(workOrderId, reason)` con `isActive = true`. Dos recalculaciones concurrentes pueden leer el mismo conjunto y crear bloqueadores duplicados.
4. `withSerializableRetry` detecta códigos PostgreSQL, pero no valida que `maxAttempts` sea positivo, no usa backoff exponencial con jitter y no comprueba latencia/backoff con fake timers. Los tests prueban decisión y cantidad de intentos, no contención real.

### 3.2 C3: aprobación de versión vigente

El hallazgo de la auditoría es válido y permanece abierto.

`decideBudgetVersionInTx` busca la versión por `budgetVersionId`, valida que pertenece a la orden y al tenant y comprueba que su estado es `PENDIENTE_APROBACION`. Pero no carga `Budget.currentVersionId` ni verifica que sea igual a `command.budgetVersionId`.

Escenario:

1. El cliente abre V2.
2. El taller publica V3 y la convierte en versión vigente.
3. V2 continúa pendiente por un estado de datos o una carrera.
4. El cliente envía una aprobación de V2.
5. El servicio puede marcar V2 como aprobada sin comprobar que V3 es la versión actual.

**Severidad:** `CRITICAL` para integridad financiera y autorización del trabajo.

**Corrección:** leer `Budget.currentVersionId` dentro de la transacción, exigir igualdad con `budgetVersionId` y devolver `BUDGET_VERSION_SUPERSEDED` con `409`; luego reconsultar la versión actual. Esta comprobación debe estar acompañada de una prueba de carrera, no solo de un unit test de estado.

### 3.3 Prueba matemática de HALF_EVEN

Los ejemplos del commit son correctos:

```text
0.5 × 3.33 = 1.665 → 1.66  (6 es par)
0.5 × 3.35 = 1.675 → 1.68  (8 es par)
```

La certificación debe limitarse a la función implementada. `ROUND_HALF_EVEN` no decide por sí solo la política contable completa: hay que documentar si se redondean líneas, subtotales o el total final, y probar impuestos/descuentos si se incorporan después.

### 3.4 RFC 7807 y errores

El proyecto tiene `ProblemDetails.ts` y una taxonomía `DomainError`, pero el contrato efectivo usado por `app/api/vehicles` es un envelope propio:

```text
{ success: false, error: { code, message, details }, meta: { requestId } }
```

Esto puede ser una decisión válida de API, pero no es RFC 7807 puro porque `type`, `title`, `status`, `detail` e `instance` no están en el nivel estándar de la respuesta. Además, existen clases `ForbiddenException`/`UnauthorizedException` en archivos separados que heredan de `ProblemDetails`, mientras que el índice exporta clases distintas basadas en `DomainError`; la dualidad puede producir serializaciones distintas según el import.

**Condición:** elegir un único contrato. O se adopta RFC 7807 plano en todos los handlers, o se declara formalmente el envelope `success/error/meta` como contrato de OS-CAR y se elimina la implementación duplicada de `ProblemDetails`. Deben existir tests para 400, 401, 403, 404, 409, 422, 429 y 500.

### 3.5 Fail-fast de Better Auth

`lib/auth.ts` valida presencia de `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y `DATABASE_URL`, rechaza secretos cortos/triviales y los tests de arranque pasan. Esta parte está correctamente orientada.

No obstante, el fail-fast de configuración no certifica autorización runtime. La ruta de vehículos no exige rol ni consulta de membresía activa, y no se observó invalidación de sesiones cuando un `AdminUser` se desactiva. Ambas condiciones deben resolverse antes de declarar RBAC completo.

## 4. HALLAZGOS NUEVOS O RESIDUALES

| ID | Severidad | Vector de falla | Evidencia | Remediación obligatoria |
|---|---|---|---|---|
| BUILD-01 | **CRITICAL** | El artefacto de producción no compila: Middleware Edge arrastra `ioredis` y Webpack falla en `node:diagnostics_channel` | `npm run build` falla en `src/lib/redis.ts` importado por `middleware.ts` | Separar cliente Edge/Node o mover el rate limit a una capa compatible; agregar build al gate y test de runtime desplegable |
| DATA-03 | **CRITICAL** | La migración inicial no crea tablas, falta `migration_lock.toml` y el índice con `CURRENT_DATE` no es válido como predicado inmutable de PostgreSQL | `prisma/migrations/0_init/migration.sql`; `prisma migrate diff` no puede determinar connector | Regenerar baseline/migraciones con DDL completo, agregar lock file y reemplazar la unicidad temporal por un modelo transaccional válido; probar `prisma migrate deploy` en una base vacía |
| BUDGET-01 | **CRITICAL** | Se puede aprobar una versión pendiente que ya no es `Budget.currentVersionId` | `src/server/services/budget-approval.service.ts` no lee ni compara `currentVersionId` | Validación atómica de versión vigente, error `BUDGET_VERSION_SUPERSEDED`, test de carrera y actualización de bloqueadores solo para la versión actual |
| AUTH-01 | **HIGH** | Sesión con `workshopId` no equivale a rol/capacidad `AdminUser` activa | `app/api/vehicles/route.ts:99-105` y `:138-144` | Guard server-side central que resuelva membresía, `active`, `deletedAt`, rol y capacidad; aplicar a cada handler |
| SEC-02 | **HIGH** | `x-forwarded-for` puede ser spoofeable si el proxy no lo sanea; `djb2Hex` permite colisiones de 32 bits | `middleware.ts:28-46` | Contrato de proxy confiable, origen de IP validado, hash criptográfico y prueba detrás del proxy real |
| DATA-04 | **HIGH** | Actor de bloqueador no obliga pertenencia y estado activo del admin; no hay FK compuesta tenant+actor | `order-blocker.service.ts:229-253`, schema `OrderBlocker` | Validar actor en la misma transacción y/o usar relación compuesta; preservar historial sin usar actor inactivo como actor operativo |
| CONC-04 | **HIGH** | Recalculo concurrente puede duplicar bloqueadores activos | `order_blocker_active_workorder_idx` es índice no único | Índice único parcial por orden/razón activa o upsert con constraint; prueba concurrente contra PostgreSQL |
| BUDGET-02 | **HIGH** | `actorType` y `phoneHash` son campos de comando; la prueba de teléfono+código no está implementada en el servicio mostrado y `phoneHash` es opcional para cliente | `budget-approval.service.ts:12-20`, `:174-185` | Autenticar la capacidad pública antes del caso de uso, exigir evidencia para `CLIENTE`, no aceptar `actorType` arbitrario desde el cliente |
| PRODUCT-01 | **HIGH** | La superficie funcional aún no implementa el producto completo: solo hay API de vehículos y Auth visibles | árbol `app/api`, `src/server/services` y `tests` | Completar OT, tracking público, presupuesto, bahías, dashboard y E2E; no confundir bundle de dominio con producto operativo |
| CONC-03-R | **MEDIUM** | Retry implementado con backoff lineal, sin jitter ni validación de `maxAttempts`; no hay contención real | `order-calculation.service.ts:7-28` | Exponencial acotado con jitter, parámetros validados, tests con fake timers y test PostgreSQL de `40001`/`40P01` |
| API-01 | **MEDIUM** | El endpoint de vehículos responde `409` para ausencia de sesión y el contrato no es RFC 7807 plano | `app/api/vehicles/route.ts:99-103`, `src/shared/errors/index.ts:63-137` | Usar `401`, documentar envelope único y cubrir todos los códigos HTTP |
| QUALITY-01 | **MEDIUM** | `npm run lint` no ejecuta lint real | `package.json` script `lint: echo No lint errors` | Configurar ESLint/biome y convertirlo en gate bloqueante |
| RELEASE-01 | **HIGH** | No existe evidencia de tests E2E, integración con DB real, Redis real, deploy staging, health check o rollback ejecutado | 8 suites observadas son unit/mocked/integration de handlers mockeados | Añadir pipeline G6-G8 real y bloquear release sin migración, build, health, smoke y rollback probados |

### Declaración formal

No corresponde declarar “0 vulnerabilidades y 0 inconsistencias de concurrencia”. Se detectan vulnerabilidades/residuales de severidad crítica y alta, además de fallos de release reproducibles.

## 5. VEREDICTO VINCULANTE Y CERTIFICACIÓN

- **Veredicto:** `REJECTED`

### Justificación ejecutiva

El commit `f09afac` demuestra una remediación técnica real: elimina el literal FK inválido, desacopla el rate limit de `x-workshop-id`, adopta HALF_EVEN, introduce versión en `PartItem`, usa transacciones Serializable y añade cobertura unitaria relevante. Los 59 tests y el typecheck local pasan.

La certificación se detiene por cuatro razones de release:

1. El build de producción falla de forma reproducible.
2. La migración inicial no es una base desplegable y contiene SQL inválido para PostgreSQL.
3. La aprobación de presupuesto no comprueba la versión vigente, dejando una ruta de aprobación stale.
4. El RBAC real y el producto completo aún no están expuestos de manera verificable; además, el rate limiting depende de una frontera proxy no formalizada.

### Condiciones de pase a staging

1. `npm run build` verde en entorno limpio.
2. Migración completa, lock file, `prisma migrate deploy` sobre base vacía y base con datos de prueba.
3. Validación atómica de `Budget.currentVersionId` y prueba de carrera.
4. Guard central de sesión, tenant, rol y capacidad aplicado a cada endpoint.
5. Rate limit compatible con el runtime real y probado detrás del proxy elegido.
6. Constraint/upsert para evitar bloqueadores activos duplicados.
7. Contrato único de errores con tests de todos los códigos relevantes.
8. Tests de integración contra PostgreSQL/Redis y al menos un E2E del flujo completo.
9. Lint real, health check, logs estructurados, métricas y rollback de migración verificado.

### Estado G0-G8

| Gate | Estado | Dictamen |
|---|---|---|
| G0 Requirements | Parcial | Especificación maestra disponible, pero debe actualizarse con los hallazgos de este informe |
| G1 Domain | Parcial | Estados y bloqueadores existen; falta contrato completo de mutaciones de hijos |
| G2 Architecture | Parcial | Capas iniciales correctas; Middleware Edge/Redis y API pública aún no cerrados |
| G3 Data | **REJECTED** | Migración inicial y constraints no desplegables |
| G4 Security | **REJECTED** | RBAC efectivo, actor tenant-safe y rate limit de producción no certificados |
| G5 Implementation | Parcial | Servicios núcleo existen; superficie de producto incompleta |
| G6 Verification | Parcial | 59 tests pasan, pero faltan DB real, E2E, build y lint real |
| G7 Review | **REJECTED** | Hay hallazgos críticos residuales |
| G8 Release | **REJECTED** | No hay artefacto de producción verificable |

### Referencias técnicas auditadas

- `middleware.ts`
- `src/lib/redis.ts`
- `src/server/services/order-blocker.service.ts`
- `src/server/services/order-calculation.service.ts`
- `src/server/services/part-item.service.ts`
- `src/server/services/budget-approval.service.ts`
- `app/api/vehicles/route.ts`
- `lib/auth.ts`
- `src/shared/errors/`
- `prisma/schema.prisma`
- `prisma/migrations/0_init/migration.sql`
- `tests/` 

La rama puede avanzar a una remediación G7.1/G8-pre, pero no debe publicarse ni etiquetarse como release productivo.
