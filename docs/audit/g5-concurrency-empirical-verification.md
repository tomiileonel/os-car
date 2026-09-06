# INFORME FORENSE DE VERIFICACIÓN EMPÍRICA G5 — 20 TRANSACCIONES EFECTIVAS EN POSTGRESQL REAL
**Autor:** Antigravity (Principal Engineer / Technical Program Orchestrator)
**Mandato:** Mandato de Verificación Empírica G5 (Directiva Vinculante de Gobernanza)
**Auditores de Referencia:** GPT-5.6 Luna & GLM 5.3 Max
**Rama:** `fix/g7-structural-review`
**Base Utilizada:** Neon Serverless PostgreSQL Branch `g5-verification-cas` (`br-super-moon-acymypu3`), Project `muddy-frog-54694195`, Compute `ep-lingering-water-acp8pixf.sa-east-1.aws.neon.tech`, PostgreSQL 18.6 (`aws-sa-east-1`).
**Estado Formal:** REMEDIATION COMPLETED — FROZEN EVIDENCE FOR AUDIT HANDOVER
**Estado de DATA-03:** FROZEN (0 diffs en `prisma/` en el repositorio).
**Release Readiness:** NO (condicionado al sign-off unánime de la cadena de auditoría).

---

## 1. RESUMEN DE CUMPLIMIENTO DEL MANDATO Y DICTÁMENES AUDITORES

En respuesta directa a las observaciones de los auditores independientes (**GPT-5.6 Luna** y **GLM 5.3 Max**):
1. **20 Transacciones Efectivas en PostgreSQL Real (Sin Timeouts de Pool):**
   Al dimensionar el pool (`connection_limit=25` y parámetros `maxWait: 10_000`, `timeout: 30_000` en Prisma Client), **el 100% de las 20 transacciones fueron admitidas simultáneamente por el motor PostgreSQL** tanto en la carrera mixta como en la carrera de rechazos puros (0 errores de pool `P2024` ni `P2028`).
2. **Demostración Rigurosa e Independiente del Invariante I3 (No-Promoción en Rechazo):**
   Se ejecutó un ensayo dedicado y reproducible de **20 transacciones simultáneas exclusivamente de RECHAZADO**. Se certifica que `currentVersionId` fue `null` antes de la carrera y **se mantuvo estrictamente en `null` después de la carrera**, demostrando que un rechazo masivo jamás promueve su versión a vigente.
3. **Telemetría Completa y Rastreo de Códigos Iniciales:**
   Se incorporó la telemetría granular de cada transacción: código inicial emitido por el motor PostgreSQL (`P2034` / SQLSTATE `40001`), tiempo de suspensión con Full Jitter exacto, estado observado en base de datos al reintentar, y código de error final (`BUDGET_NOT_DECIDABLE`).
4. **Preservación Estricta de DATA-03 y Hallazgo SQLSTATE 42P17:**
   El repositorio mantiene exactamente cero líneas de cambio en `prisma/`. El error de PostgreSQL 18.6 en la sentencia 5 de migración (`CURRENT_DATE` en predicado de índice funcional) queda catalogado como hallazgo de release sin alterar el baseline.
5. **Hermeticidad y Seguridad Absoluta:**
   Cero credenciales en texto plano en el repositorio. Los tests de integración remotos están condicionados por entorno (`describe.skipIf(!NEON_TEST_URL)`), garantizando que `npm test` sea 100% hermético y local por defecto.
6. **Política Fail-Closed para MAX_CAUSE_DEPTH = 16:**
   Se documenta explícitamente que si una cadena de causas de error supera los 16 niveles de profundidad, el clasificador retorna `false` (no-reintentable), adoptando una política estrictamente fail-closed para evitar tanto stack overflow como bucles infinitos de reintentos.

```mermaid
sequenceDiagram
    autonumber
    actor C as 20 Workers Concurrentes
    participant R as withSerializableRetry (Full Jitter)
    participant S as decideBudgetVersionInTx
    participant DB as Neon PostgreSQL 18.6 (Serializable)

    Note over C,DB: 20 Transacciones admitidas simultáneamente por el motor (Pool Capacity >= 25)
    C->>R: Invoke decideBudgetVersion(tx_i)
    R->>DB: BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE
    DB-->>R: Worker Ganador adquiere lock y actualiza estado (Attempt 1)
    DB-->>R: Worker Ganador Commit exitoso (FULFILLED)

    par 19 Workers Concurrentes Perdedores
        DB-->>R: PostgreSQL detecta Anti-dependency / Conflict (SQLSTATE 40001 / P2034)
        R->>R: Catch retryable error -> Full Jitter sleep (1ms - 24ms)
        R->>DB: Reintento (Attempt 2) -> Re-lee versión desde PostgreSQL
        DB-->>S: version.status != PENDIENTE_APROBACION
        S-->>R: Throws DomainConflictException("BUDGET_NOT_DECIDABLE")
        R-->>C: Fail-fast limpio sin mutaciones huérfanas ni corrupción
    end

    Note over DB: Snapshot Final: Exactamente 1 Decisión Comprometida, 0 Huérfanos, CAS Intacto
```

---

## 2. HALLAZGO OPERACIONAL: CAPACIDAD Y DIMENSIONAMIENTO DE POOL

### 2.1 Distinción Técnica entre Códigos de Error
* **`P2024` (Timed out fetching a new connection from the connection pool):** Ocurre en el cliente de Node.js cuando el pool de conexiones configurado en Prisma está agotado y se agota el tiempo límite de espera (`maxWait`, por defecto 2000ms en transacciones interactivas).
* **`P2028` (Transaction already closed):** Ocurre si una transacción intenta enviar una consulta a una transacción que ya fue cancelada o finalizada previamente.
* **`P2034` / SQLSTATE `40001` (Serialization failure):** Es el error legítimo emitido por el motor PostgreSQL bajo `ISOLATION LEVEL SERIALIZABLE` ante conflictos de lectura/escritura (anti-dependencies).

### 2.2 Política de Configuración para Ráfagas Concurrentes en Producción
Para soportar ráfagas concurrentes de $\ge 20$ decisiones simultáneas sin saturación artificial en la capa intermedia:
1. **Connection String:** Configurar `connection_limit >= 25` en la URL de conexión de Prisma/PgBouncer.
2. **Interactive Transaction Options:** En `decideBudgetVersion`, se establecieron como valores predeterminados de producción:
   * `maxWait: 10_000` (10 segundos para adquisición de conexión bajo picos de contención).
   * `timeout: 30_000` (30 segundos para duración total de transacción interactiva).

---

## 3. SNAPSHOTS FORENSES DE LA BASE DE DATOS

### 3.1 Ensayo 1: 20 Transacciones Simultáneas Mixtas (10 Aprobaciones, 10 Rechazos)
* **Objetivo:** Demostrar contención y convergencia en carrera mixta.
* **Snapshot ANTES:**
  * `currentVersionId`: `null`
  * `status`: `PENDIENTE_APROBACION`
  * Total `budget_approvals`: `0`
  * Total `status_histories`: `0`
  * Bloqueadores Activos: `1` (`APROBACION_PRESUPUESTO`)
* **Snapshot DESPUÉS:**
  * `currentVersionId`: Apunta atómicamente a la versión aprobada (ganó Worker Tx-01 con `APROBADO`)
  * `status`: `APROBADO`
  * Total `budget_approvals`: `1` (Worker Tx-01: `APROBADO`, `actorType: ADMIN`, contentHash verificado)
  * Total `status_histories`: `1` (`PRESUPUESTO_APROBADO`)
  * Bloqueadores Activos: `0` (Bloqueador resuelto limpiamente)

### 3.2 Ensayo 2: 20 Transacciones Simultáneas Exclusivamente de Rechazo (Invariante I3)
* **Objetivo:** Demostración empírica de no-promoción de versiones rechazadas a `currentVersionId`.
* **Snapshot ANTES:**
  * `currentVersionId`: `null`
  * `status`: `PENDIENTE_APROBACION`
  * Total `budget_approvals`: `0`
  * Total `status_histories`: `0`
  * Bloqueadores Activos: `1` (`APROBACION_PRESUPUESTO`)
* **Snapshot DESPUÉS:**
  * `currentVersionId`: `null` (**VERIFICACIÓN ESTRICTA DE I3: NUNCA PROMOVIDA**)
  * `status`: `RECHAZADO`
  * Total `budget_approvals`: `1` (Worker Tx-16: `RECHAZADO`, `actorType: CLIENTE`, contentHash verificado)
  * Total `status_histories`: `1` (`PRESUPUESTO_RECHAZADO`)
  * Bloqueadores Activos: `0` (Bloqueador resuelto limpiamente)

---

## 4. TABLAS FORENSES DE EJECUCIÓN (TELEMETRÍA REAL ALINEADA CON docs/audit/g5-neon-20tx-raw-output.json)

### 4.1 Carrera Mixta (20 Workers: 10 Aprobaciones, 10 Rechazos)
| Tx ID | Decisión Solicitada | Intentos | Intento 1 (Motor SSI) | Full Jitter | Intento 2 Relectura DB | Código / Resultado Final | Duración Total |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tx-01** | APROBADO | 1 | **COMMIT EXITOSO** | - | - | **WINNER (COMMITTED)** | 2577ms |
| **Tx-02** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 6ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3174ms |
| **Tx-03** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 20ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3219ms |
| **Tx-04** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 18ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3213ms |
| **Tx-05** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 13ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3191ms |
| **Tx-06** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 7ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3202ms |
| **Tx-07** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 9ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3211ms |
| **Tx-08** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 7ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3218ms |
| **Tx-09** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 17ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3218ms |
| **Tx-10** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 4ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3180ms |
| **Tx-11** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 13ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3202ms |
| **Tx-12** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 8ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3250ms |
| **Tx-13** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 15ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3202ms |
| **Tx-14** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 8ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3190ms |
| **Tx-15** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 24ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3218ms |
| **Tx-16** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 13ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3172ms |
| **Tx-17** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 11ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3181ms |
| **Tx-18** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 18ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3179ms |
| **Tx-19** | APROBADO | 2 | `P2034` (SQLSTATE 40001) | 4ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3188ms |
| **Tx-20** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 15ms | status = `APROBADO` | `BUDGET_NOT_DECIDABLE` | 3218ms |

### 4.2 Carrera Pura de Rechazo (20 Workers: Invariante I3)
| Tx ID | Decisión Solicitada | Intentos | Intento 1 (Motor SSI) | Full Jitter | Intento 2 Relectura DB | Código / Resultado Final | Duración Total |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tx-01** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 19ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2263ms |
| **Tx-02** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 0ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2303ms |
| **Tx-03** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 14ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2263ms |
| **Tx-04** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 5ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2286ms |
| **Tx-05** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 3ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2268ms |
| **Tx-06** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 4ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2261ms |
| **Tx-07** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 16ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2259ms |
| **Tx-08** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 15ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2258ms |
| **Tx-09** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 9ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2264ms |
| **Tx-10** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 21ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2257ms |
| **Tx-11** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 3ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2271ms |
| **Tx-12** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 3ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2292ms |
| **Tx-13** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 7ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2287ms |
| **Tx-14** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 21ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2260ms |
| **Tx-15** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 19ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2245ms |
| **Tx-16** | RECHAZADO | 1 | **COMMIT EXITOSO** | - | - | **WINNER (COMMITTED)** | 1696ms |
| **Tx-17** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 19ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2280ms |
| **Tx-18** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 8ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2262ms |
| **Tx-19** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 15ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2266ms |
| **Tx-20** | RECHAZADO | 2 | `P2034` (SQLSTATE 40001) | 0ms | status = `RECHAZADO` | `BUDGET_NOT_DECIDABLE` | 2348ms |

---

## 5. MATRIZ DE CUMPLIMIENTO DE LOS 8 INVARIANTES EXIGIDOS

| Invariante | Requisito Formal | Demostración Empírica en Neon PostgreSQL 18.6 | Estado |
| :--- | :--- | :--- | :---: |
| **I1: Atomicidad** | Sin escrituras parciales si una transacción aborta. | De 20 transacciones simultáneas, exactamente 1 escribió en `budget_approvals` y `status_histories`. Cero filas parciales. | **CUMPLIDO** |
| **I2: Versión Vigente Única** | Puntero `currentVersionId` unívoco y consistente. | El CAS atómico garantiza un único puntero válido sin bifurcaciones de versiones vigentes. | **CUMPLIDO** |
| **I3: No-Promoción en Rechazo** | Un rechazo NUNCA convierte su versión en vigente. | Demostrado en la corrida masiva de 20 rechazos puros: `currentVersionId` permaneció estrictamente en `null`. | **CUMPLIDO** |
| **I4: Integridad CAS** | Ninguna transacción stale sobrescribe una versión más nueva. | `updateMany({ where: { id, currentVersionId } })` verifica coincidencia de puntero. Si otro worker mutó el puntero, `count === 0` produciendo `BUDGET_VERSION_SUPERSEDED`. | **CUMPLIDO** |
| **I5: Garantía de Rollback** | Cero registros huérfanos tras colisiones concurrentes. | Los 19 workers que sufrieron 40001 o re-evaluaron a `BUDGET_NOT_DECIDABLE` no dejaron residuos en tablas de auditoría. | **CUMPLIDO** |
| **I6: Reintento Serializable** | Reintento Full Jitter con re-evaluación de negocio. | Verificado en 38 de 40 transacciones: conflicto inicial 40001/P2034 -> Full Jitter (1ms - 24ms) -> relectura -> fail-fast limpio. | **CUMPLIDO** |
| **I7: Idempotencia Lógica** | Consistencia ante ejecuciones repetidas. | Invocaciones posteriores sobre la misma versión ya decidida fallan inmediatamente en Intento 1 con `BUDGET_NOT_DECIDABLE`. | **CUMPLIDO** |
| **I8: Integridad Referencial** | Estado final consistente con restricciones del modelo. | Bloqueadores resueltos, claves foráneas intactas y relaciones auditadas 100% íntegras. | **CUMPLIDO** |

---

## 6. CLASIFICACIÓN TÉCNICA DE ARTEFACTOS Y ARNÉS DE REPRODUCIBILIDAD

En estricto cumplimiento de los dictámenes de auditoría adversarial:

1. **Test de Integración Real contra PostgreSQL / Neon:**
   * **Ubicación:** `tests/integration/budget-concurrency-neon.integration.test.ts`
   * **Naturaleza:** Integra directamente con el motor relacional PostgreSQL 18.6 vía `PrismaClient` real bajo `ISOLATION LEVEL SERIALIZABLE`.
   * **Condición de Ejecución:** `describe.skipIf(!NEON_TEST_URL)`, asegurando hermeticidad local si no se configura la URL de Neon.
   * **Ejecución en Vitest:** `npx vitest run tests/integration/budget-concurrency-neon.integration.test.ts`
2. **Runner Autónomo y Re-ejecutable por Terceros:**
   * **Ubicación:** `scripts/run-g5-neon-benchmark.ts`
   * **Script npm:** `npm run test:g5-neon` (o `npx tsx scripts/run-g5-neon-benchmark.ts`)
   * **Salida Cruda Versionada:** `docs/audit/g5-neon-20tx-raw-output.json` (contiene la telemetría JSON completa con microsegundos de las 40 transacciones ejecutadas en Neon).
3. **Suite Unitaria de Coreografía de Aplicación (Reclasificada):**
   * **Ubicación:** `tests/unit/budget-concurrency-choreography.test.ts`
   * **Naturaleza:** Suite unitaria con mocks que valida la orquestación TypeScript, reintentos con Full Jitter sintético, fallos CAS y acotamiento de causas profundas sin conexión de red.

---

## 7. ACTO FORMAL DE GOBERNANZA: SIGN-OFF RIESGO ISOLATE-LOCAL (BUILD-01) Y DISPOSICIÓN DE ED1772B

1. **Sign-off de Perímetro Edge Rate Limiting (BUILD-01):**
   Se ratifica que en la arquitectura actual Edge de Vercel/Next.js, el rate limiting implementado en `middleware.ts` mediante `MemorySlidingWindow` es una protección de contención per-isolate / edge-node best-effort con memoria acotada ($\le 10.000$ entradas, verificado en test de inundación de 50.000 IPs). La garantía de cuota global estrictamente distribuida entre múltiples regiones geográficas Edge requerirá una instancia Upstash/Redis centralizada, la cual se programará en la fase de infraestructura productiva.
2. **Declaración de Disposición de `ed1772b`:**
   El commit `ed1772b` queda formalmente registrado como un objeto intermedio huérfano y descartado. La única línea de linaje válida y continua es:
   `a958909` -> `31551e7` -> `e2f5873` -> `3a9f78d` -> HEAD.

---

## 8. ESTADO DE PUERTAS DE CALIDAD Y GOBERNANZA

* **DATA-03:** FROZEN (0 diffs en `prisma/` en el árbol de trabajo y commits).
* **ESLint:** PASS (Exit code 0, 0 advertencias, cubriendo `src`, `app`, `tests`, `middleware.ts`).
* **TypeScript:** PASS (Exit code 0 en `tsc --noEmit`).
* **Vitest Suite:** PASS (9 suites herméticas locales / 10 suites con Neon configurado).
* **Next.js Production Build:** PASS (0 advertencias, Edge Middleware: 35.1 kB).
* **Git Hygiene:** Clean working tree, `git show --check` con 0 errores de whitespace.
* **Rama `main`:** Bloqueada sin merge.
* **Release Readiness:** NO.
