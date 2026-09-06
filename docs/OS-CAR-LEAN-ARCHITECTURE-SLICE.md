# OS-CAR — ESPECIFICACIÓN ARQUITECTÓNICA: TAJADA VERTICAL Y CONTRATOS G3

**Estado del artefacto:** especificación de auditoría para la primera tajada vertical implementada.

**Alcance:** alta pública de un vehículo, emisión de acceso privado de seguimiento, consulta pública desinfectada y shell inicial de acceso administrativo.

**Fuente de verdad:** el código y el esquema presentes en este árbol de trabajo. Este documento no convierte en implementado aquello que sólo queda definido como contrato de Gate G3.

## 1. RESUMEN DE LA TAJADA IMPLEMENTADA

La tajada implementada conecta el flujo mínimo de cliente con la persistencia operativa:

```text
/                         → tres accesos de entrada
/cliente/alta             → formulario público de ingreso
/api/public/intake       → validación Zod + transacción de alta
/seguimiento              → formulario de consulta
/api/public/tracking     → hash del token + proyección pública
/admin/login              → autenticación Better Auth
/admin                    → shell administrativo protegido server-side
```

El alta pública ejecuta una única transacción Prisma que:

1. Resuelve el `workshopId` desde `OSCAR_WORKSHOP_ID`.
2. Busca o crea `Customer` por teléfono normalizado dentro del taller.
3. Busca o crea `Vehicle` por patente normalizada dentro del taller.
4. Rechaza la patente si ya pertenece a otro cliente del mismo taller.
5. Crea `WorkOrder` en estado `INGRESADO`.
6. Crea `IntakeRecord` y el primer `StatusHistory` público.
7. Genera el token privado y sólo persiste su hash.

La consulta pública sólo permite localizar una orden cuyo hash coincida, cuyo acceso no esté revocado y cuyo registro no esté eliminado. El resultado se construye mediante `select` explícito; no se serializa la entidad Prisma completa.

### Código implementado y rutas reales

- Entrada tripartita: `app/page.tsx`.
- DTOs públicos: `src/shared/schemas/public.ts` y `src/shared/schemas/common.ts`.
- Alta pública: `app/api/public/intake/route.ts` y `src/server/services/public-intake.service.ts`.
- Seguimiento público: `app/api/public/tracking/route.ts` y `src/server/services/public-tracking.service.ts`.
- Token: `src/lib/tracking-token.ts`.
- Protección perimetral: `middleware.ts` y `src/lib/rate-limit.ts`.
- Modelo persistente: `prisma/schema.prisma`.
- Migración agregada por esta tajada: `prisma/migrations/20260906130000_add_vehicle_type/migration.sql`.

### Límites explícitos de esta entrega

- El dashboard administrativo es un shell protegido; todavía no es un CRUD completo de órdenes, bahías o líneas de costo.
- No se agregan inventario multi-almacén, facturación electrónica, AFIP, pagos, WhatsApp, planificación industrial ni snapshots multinivel.
- El alta pública todavía no consume `Idempotency-Key`, aunque existe el modelo histórico `IdempotencyRecord` en el esquema.
- No se ejecutó ninguna migración contra una base real como parte de la implementación de esta tajada.

## 2. CONTRATOS DE API PÚBLICA Y SEGURIDAD DEL TRACKING

### 2.1 Envelope común realmente implementado

Las rutas usan `toErrorEnvelope` de `src/shared/errors/index.ts`.

Respuesta exitosa:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Respuesta de error:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensaje accionable",
    "details": {}
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

Este envelope es compatible con el criterio operativo del proyecto, pero no es RFC 7807 estricto: no contiene simultáneamente `type`, `title`, `status` y `detail`. El middleware de rate limiting sí devuelve un objeto con forma de Problem Details para el rechazo 429. Esta diferencia debe permanecer visible durante el Gate G4; no debe auditarse el envelope de las rutas como RFC 7807 puro.

### 2.2 `POST /api/public/intake`

**Runtime:** Node.js.

**Headers de respuesta:** `Cache-Control: no-store` en éxito y error.

**Rate limiting perimetral:** regla `public`, máximo 20 solicitudes por 15 minutos por bucket de IP en `middleware.ts`. La implementación de memoria es isolate-local y bounded por LRU; no es una cuota distribuida global.

#### DTO de entrada exacto

El body debe ser JSON y debe cumplir `publicIntakeSchema` en `src/shared/schemas/public.ts`. El objeto es `.strict()`: campos extra son inválidos.

| Campo | Tipo recibido | Reglas efectivas |
|---|---|---|
| `fullName` | `string` | `trim`, longitud 2–120 |
| `phoneE164` | `string` | `trim`, regex E.164 `^\\+[1-9][0-9]{7,14}$` |
| `email` | `string` opcional | email válido, máximo 254 caracteres |
| `vehicleType` | enum | `AUTO`, `CAMIONETA` o `CAMION` |
| `licensePlate` | `string` | `trim`, uppercase, elimina espacios/guiones, 5–10 caracteres alfanuméricos |
| `make` | `string` | `trim`, longitud 1–80 |
| `model` | `string` | `trim`, longitud 1–80 |
| `modelYear` | número coercible | entero entre 1886 y año actual + 1 |
| `odometerAtIntake` | número | entero no negativo |
| `fuelLevel` | enum | `VACIO`, `CUARTO`, `MITAD`, `TRES_CUARTOS` o `LLENO` |
| `customerComplaint` | `string` | `trim`, longitud 5–2000 |

Ejemplo válido:

```json
{
  "fullName": "Ana Pérez",
  "phoneE164": "+5491112345678",
  "email": "ana@example.com",
  "vehicleType": "AUTO",
  "licensePlate": "AB123CD",
  "make": "Toyota",
  "model": "Etios",
  "modelYear": 2018,
  "odometerAtIntake": 85000,
  "fuelLevel": "MITAD",
  "customerComplaint": "Hace ruido al frenar."
}
```

#### Respuesta `201 Created`

```json
{
  "success": true,
  "data": {
    "trackingToken": "43 caracteres base64url",
    "trackingUrl": "/seguimiento?token=43-caracteres-base64url",
    "workOrderId": "cuid"
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

El token crudo se entrega sólo en esta respuesta. El servicio no lo persiste; persiste `trackingCodeHash`.

#### Errores observables

| HTTP | `code` | Condición |
|---:|---|---|
| 400 | `VALIDATION_FAILED` | JSON válido pero DTO inválido; `details.issues` contiene `path` y `message` |
| 400 | `INVALID_JSON_BODY` | Body que no puede parsearse como JSON |
| 409 | `LICENSE_PLATE_EXISTS` | La patente ya pertenece a otro cliente del taller |
| 409 | `CONFLICT` | Violación de unicidad Prisma `P2002` no traducida antes |
| 422 | `WORKSHOP_NOT_CONFIGURED` | Falta `OSCAR_WORKSHOP_ID` |
| 429 | `RATE_LIMITED` | Límite del middleware perimetral |
| 500 | `INTERNAL_ERROR` | Error no clasificado; se devuelve `requestId`, no stack trace |

Todos los errores producidos por la ruta llevan `Cache-Control: no-store`. El 429 del middleware agrega `Retry-After` y `X-RateLimit-*` cuando la solicitud alcanza esa frontera.

### 2.3 `POST /api/public/tracking`

**Runtime:** Node.js.

**Headers de respuesta:** `Cache-Control: no-store` en éxito, error y rate limit. El rate limit del handler agrega `Retry-After` en segundos.

**Rate limiting:**

- Middleware: 20 solicitudes cada 15 minutos para `/api/public/*`.
- Handler: 10 solicitudes cada 10 minutos por IP derivada de `x-vercel-forwarded-for`, `cf-connecting-ip`, `x-forwarded-for` o `unresolved_ip`.
- Ambos límites usan memoria isolate-local; el límite no es distribuido entre réplicas.

#### DTO de búsqueda exacto

```json
{
  "trackingToken": "^[A-Za-z0-9_-]{43}$"
}
```

El objeto es estricto. El token no se acepta por teléfono, patente, `workOrderId`, email ni combinación de datos personales.

#### Respuesta `200 OK`

```json
{
  "success": true,
  "data": {
    "vehicle": {
      "make": "Toyota",
      "model": "Etios",
      "modelYear": 2018,
      "licensePlateMasked": "****3CD"
    },
    "status": "INGRESADO",
    "costs": {
      "laborSubtotal": "0.00",
      "partsSubtotal": "0.00",
      "totalEstimated": "0.00",
      "totalFinal": "0.00"
    },
    "workItems": [
      {
        "description": "Diagnóstico inicial",
        "status": "PENDIENTE"
      }
    ],
    "partItems": [
      {
        "description": "Filtro de aceite",
        "quantity": 1,
        "status": "PENDIENTE"
      }
    ],
    "timeline": [
      {
        "eventType": "INGRESO",
        "description": "Ingreso registrado. El taller recibió los datos del vehículo.",
        "createdAt": "2026-09-06T13:00:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

El código no expone en esta proyección:

- teléfono, email, nombre del cliente ni identificadores internos;
- patente completa: sólo los últimos tres caracteres, con el resto enmascarado;
- `internalNote`, `internalCostAmount`, `unitCost`, actores administrativos, `workshopId` o relaciones Prisma;
- `trackingCodeHash` ni token crudo;
- historial marcado `publicVisible = false`.

Los costos mostrados son los totales comerciales de la orden: mano de obra, repuestos, estimado y final. No se exponen costos internos de adquisición ni notas internas.

#### Errores observables

| HTTP | `code` | Condición |
|---:|---|---|
| 400 | `VALIDATION_FAILED` | Token ausente, con formato incorrecto o campos extra |
| 404 | `TRACKING_NOT_FOUND` | Hash inexistente, acceso revocado o orden eliminada |
| 429 | `RATE_LIMITED` | Se superó el límite del handler o middleware |
| 500 | `INTERNAL_ERROR` | Error no clasificado |

La respuesta 404 es deliberadamente indistinguible entre token inexistente, revocado o eliminado para evitar enumeración del estado de una orden.

### 2.4 Especificación criptográfica del tracking

#### Lo que está implementado

| Propiedad | Implementación real |
|---|---|
| Entropía | `randomBytes(32)` de `node:crypto`: 256 bits CSPRNG |
| Codificación de entrega | `base64url`, sin padding; 43 caracteres para 32 bytes |
| Hash persistido | SHA-256 del token UTF-8, representado como hex lowercase de 64 caracteres |
| Persistencia | `WorkOrder.trackingCodeHash`, con `@unique` |
| Revocación | `trackingCodeRevokedAt`; la consulta exige `null` |
| Comparación de consulta | El handler calcula SHA-256 y filtra por igualdad exacta del hash en PostgreSQL |

La generación y el hash están en `src/lib/tracking-token.ts`. La consulta no realiza una búsqueda por identificador secuencial: usa únicamente el hash derivado del secreto presentado.

#### Controles que no están implementados y no deben declararse como cumplidos

El código actual no usa HMAC ni `crypto.timingSafeEqual`. Por lo tanto:

- no existe un `TRACKING_TOKEN_PEPPER` o secreto HMAC configurado;
- no existe comparación byte-a-byte en tiempo constante en la aplicación;
- la igualdad del índice PostgreSQL no puede describirse como comparación constante controlada por Node.js.

La defensa actual se basa en 256 bits de entropía, formato no enumerable, respuesta 404 uniforme, revocación y rate limiting. Esto es una postura práctica para la tajada, pero deja una brecha formal si G4 exige literalmente HMAC y comparación constante. La remediación de G4 deberá decidir entre HMAC-SHA-256 con secreto de servidor y una estrategia de verificación de longitud constante compatible con la consulta indexada; no se debe ocultar esa decisión dentro de G3.

## 3. MODELO DE DOMINIO Y MÁQUINA DE ESTADOS (GATE G3)

### 3.1 Entidades lean

#### `Customer`

Representa a la persona que solicita el servicio.

- Identidad: `id` CUID.
- Tenant: `workshopId` obligatorio.
- Datos: `fullName`, `phoneE164`, `phoneNormalized`, `email` opcional.
- Ciclo de baja: `deletedAt` soft-delete.
- Invariante actual: `@@unique([workshopId, phoneNormalized])`.

#### `Vehicle`

Representa el vehículo asociado al cliente.

- Identidad: `id` CUID.
- Tenant y propietario: `workshopId`, `customerId`.
- Datos: `vehicleType`, `licensePlate`, `licensePlateNormalized`, `make`, `model`, `modelYear`.
- Invariante actual: `@@unique([workshopId, licensePlateNormalized])`.
- Baja: `deletedAt` soft-delete.

#### `WorkOrder`

Es la unidad operativa central.

- Identidad: `id` CUID.
- Pertenencia: `workshopId`, `customerId`, `vehicleId`.
- Seguimiento: `trackingCodeHash`, `trackingCodeIssuedAt`, `trackingCodeRevokedAt`.
- Estado: `OrderStatus`.
- Concurrencia: `version` para optimistic locking.
- Totales: `laborSubtotal`, `partsSubtotal`, `totalEstimated`, `totalFinal`.
- Auditoría temporal: timestamps por etapa y `deletedAt`.

#### `WorkItem`

Línea comercial de mano de obra.

- Descripción y ejecución: `description`, `estimatedMinutes`, `actualMinutes`, `status`.
- Precio: `hourlyRateCharged Decimal(12,2)`.
- Datos internos no públicos: `internalNote`, `internalCostAmount`.
- Relación: pertenece a una `WorkOrder`.

#### `PartItem`

Línea comercial de repuesto.

- Descripción: `partNumber` opcional, `description`, `quantity`.
- Precio público: `unitPriceCharged Decimal(12,2)`.
- Costo interno: `unitCost Decimal(12,2)` opcional; nunca se expone al cliente.
- Estado: `PartStatus`.
- Relación: pertenece a una `WorkOrder`; el vínculo a `InventoryItem` es opcional y no activa un diseño de inventario multi-almacén.

#### `Bay`

Recurso físico de capacidad binaria.

- Identidad: `id` CUID.
- Tenant: `workshopId`.
- Identificación: `code`, `ordinal`.
- Ocupación: `status` (`LIBRE` o `OCUPADA`).
- Disponibilidad administrativa: `isEnabled`, `deletedAt`.
- Invariantes actuales: código y ordinal únicos dentro del taller.

#### Entidades de soporte de la tajada

- `IntakeRecord`: odómetro, combustible y motivo de consulta; relación uno a uno con `WorkOrder`.
- `StatusHistory`: historial público e interno; `publicVisible` controla la proyección del tracking.
- `BayAssignment`: intervalo de ocupación de una bahía; `releasedAt = null` significa asignación activa.

### 3.2 Máquina de estados lean

Los valores implementados en `OrderStatus` son:

```text
INGRESADO
DIAGNOSTICO
ESPERANDO_REPARACION
EN_REPARACION
CONTROL
LISTO
ENTREGADO
CANCELADA
```

La transición inicial implementada por el alta pública es:

```text
∅ → INGRESADO
```

El contrato operativo G3 para el flujo administrativo es:

| Estado actual | Transiciones válidas | Condición principal |
|---|---|---|
| `INGRESADO` | `DIAGNOSTICO`, `CANCELADA` | Cancelación requiere motivo |
| `DIAGNOSTICO` | `ESPERANDO_REPARACION`, `EN_REPARACION`, `CANCELADA` | Diagnóstico registrado; bloqueadores aplican al avance |
| `ESPERANDO_REPARACION` | `EN_REPARACION`, `DIAGNOSTICO`, `CANCELADA` | Debe resolverse el motivo de espera correspondiente |
| `EN_REPARACION` | `ESPERANDO_REPARACION`, `CONTROL`, `CANCELADA` | No avanzar si existen bloqueadores de aprobación, repuesto o datos |
| `CONTROL` | `EN_REPARACION`, `LISTO`, `CANCELADA` | `LISTO` requiere control aprobado |
| `LISTO` | `ENTREGADO`, `CONTROL` | Entrega física sólo desde `LISTO` |
| `ENTREGADO` | ninguna | Terminal; revoca tracking y libera bahía |
| `CANCELADA` | ninguna | Terminal |

La entrada de transición existente en `src/shared/schemas/order.ts` exige `workOrderId`, `expectedVersion`, `targetStatus` y un `reason` de al menos 5 caracteres cuando el objetivo es `CANCELADA`.

#### Bloqueadores operativos

El código de `src/server/services/order-blocker.service.ts` define estas reglas de avance:

- A `EN_REPARACION`: bloquean `APROBACION_CLIENTE`, `REPUESTO_PENDIENTE` y `DATOS_INCOMPLETOS`.
- A `LISTO`: bloquean `CONTROL_OBSERVADO` y `APROBACION_CLIENTE`.
- Un bloqueador activo debe impedir la transición con `BLOCKED_TRANSITION`.

La entrega implementada en `src/server/services/delivery.service.ts` valida además:

- estado actual `LISTO`;
- `expectedVersion` coincidente;
- el comando tipado exige `keysHandedOver = true` y `conformityAccepted = true`;
- odómetro no regresivo salvo override de supervisor válido;
- actualización de `WorkOrder`, revocación del tracking, liberación de bahía, `DeliveryRecord` y `StatusHistory` dentro de la misma transacción serializable.

La tabla anterior es el contrato de dominio G3. La tajada pública no implementa todavía un endpoint genérico de transición administrativa; esa ausencia debe permanecer como trabajo posterior, no como supuesto de que la matriz ya está ejecutada en producción.

### 3.3 Aislamiento por taller e integridad referencial

La regla de aplicación es: toda operación administrativa debe resolver la sesión, extraer su `workshopId` server-side y filtrar cada consulta y mutación por ese tenant. El alta pública usa el único `OSCAR_WORKSHOP_ID` configurado para el despliegue actual.

El esquema ya tiene relaciones directas con `Workshop` para `Customer`, `Vehicle`, `WorkOrder` y `Bay`, además de `onDelete: Restrict` para preservar historia. Sin embargo, `WorkItem` y `PartItem` contienen `workshopId` pero no declaran una relación directa a `Workshop`, y las relaciones de `WorkOrder` hacia `Customer` y `Vehicle` no usan claves compuestas tenant-aware. Por eso el aislamiento estricto queda parcialmente garantizado por servicios y parcialmente pendiente de cierre relacional en G3.

El cierre G3 recomendado es imponer una de estas alternativas, a decidir antes de migrar:

1. claves compuestas `(workshopId, id)` y FKs compuestas en todas las relaciones operativas —mayor integridad de base, migración más amplia—;
2. quitar `workshopId` redundante de las líneas hijas y derivar siempre el tenant desde `WorkOrder` —modelo más simple, consultas administrativas con joins—;
3. mantener columnas redundantes y agregar triggers/checks de consistencia —menor refactor, mayor complejidad operacional.

Para esta tajada se conserva el esquema existente y se deja la decisión como evidencia explícita de G3; no se introduce una migración destructiva.

## 4. SISTEMA DE BAHÍAS Y CÁLCULO DE COSTOS

### 4.1 Ocupación y asignación de bahías

La semántica lean es binaria:

```text
LIBRE   → puede recibir una asignación activa
OCUPADA → tiene una asignación activa
```

`BayAssignment` conserva el intervalo de asignación:

- asignación activa: `releasedAt IS NULL`;
- liberación: se informa `releasedAt` y `releaseReason`;
- reasignación: liberar la asignación anterior y crear la nueva dentro de la misma transacción;
- entrega: liberar toda asignación activa de la orden con motivo `ENTREGA`.

El índice parcial `bay_one_active_assignment` garantiza que una bahía no pueda tener dos asignaciones activas aun cuando dos operadores intenten ocuparla simultáneamente. La operación de negocio debe además actualizar `Bay.status` de forma atómica y comprobar `workshopId` server-side.

Secuencia mínima de asignación G3:

```text
BEGIN
  bloquear/verificar Bay(id, workshopId, status = LIBRE, isEnabled = true)
  marcar Bay.status = OCUPADA
  insertar BayAssignment(releasedAt = NULL)
COMMIT
```

Si el `INSERT` viola la unicidad parcial o la actualización condicional afecta cero filas, se devuelve conflicto de concurrencia y no se deja una asignación parcial.

### 4.2 Separación contable

La separación comercial es estricta:

```text
Mano de obra = Σ round_half_even(estimatedMinutes / 60 × hourlyRateCharged)
Repuestos    = Σ round_half_even(quantity × unitPriceCharged)
Total        = Mano de obra + Repuestos
```

Implementación actual en `src/server/services/order-calculation.service.ts`:

- `Decimal.js` con precisión 24;
- redondeo `ROUND_HALF_EVEN` a dos decimales;
- valores persistidos como `Decimal(12,2)`;
- líneas con estado `CANCELADO` excluidas;
- minutos y cantidades deben ser enteros positivos;
- tarifas y precios unitarios no pueden ser negativos;
- salida serializada como string con dos decimales.

Campos de orden:

```text
laborSubtotal  = subtotal de WorkItem
partsSubtotal  = subtotal de PartItem
totalEstimated = laborSubtotal + partsSubtotal
totalFinal     = campo persistido para el cierre comercial final
```

La función de recálculo actual actualiza `laborSubtotal`, `partsSubtotal` y `totalEstimated`. `totalFinal` se expone en el tracking porque existe en el modelo, pero su proceso de cierre no forma parte de esta tajada pública y no debe confundirse con un total final ya liquidado.

No se mezclan `internalCostAmount` ni `unitCost` con el precio cobrado. Los costos internos quedan en el perímetro administrativo.

## 5. DDL Y ESQUEMA PRISMA PROPUESTO

### 5.1 Anclas ya presentes en `prisma/schema.prisma`

La tajada usa los modelos existentes y agrega `VehicleType` mediante `prisma/migrations/20260906130000_add_vehicle_type/migration.sql`:

```prisma
enum VehicleType {
  AUTO
  CAMIONETA
  CAMION
}

model Vehicle {
  id                     String      @id @default(cuid())
  workshopId             String
  customerId             String
  vehicleType            VehicleType @default(AUTO)
  licensePlate           String
  licensePlateNormalized String
  make                   String?
  model                  String?
  modelYear              Int?
  deletedAt              DateTime?

  workshop   Workshop    @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  customer   Customer    @relation(fields: [customerId], references: [id], onDelete: Restrict)
  workOrders WorkOrder[]

  @@unique([workshopId, licensePlateNormalized])
  @@map("vehicles")
}

model WorkOrder {
  id                   String      @id @default(cuid())
  workshopId           String
  customerId           String
  vehicleId            String
  trackingCodeHash     String      @unique
  trackingCodeRevokedAt DateTime?
  status               OrderStatus @default(INGRESADO)
  version              Int         @default(1)
  laborSubtotal        Decimal     @default(0) @db.Decimal(12, 2)
  partsSubtotal        Decimal     @default(0) @db.Decimal(12, 2)
  totalEstimated       Decimal     @default(0) @db.Decimal(12, 2)
  totalFinal           Decimal     @default(0) @db.Decimal(12, 2)
  deletedAt            DateTime?

  workshop     Workshop      @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  customer     Customer      @relation(fields: [customerId], references: [id], onDelete: Restrict)
  vehicle      Vehicle       @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  intakeRecord IntakeRecord?
  workItems    WorkItem[]
  partItems    PartItem[]
  bayAssignments BayAssignment[]
  statusHistory StatusHistory[]

  @@map("work_orders")
}

model WorkItem {
  id                 String         @id @default(cuid())
  workshopId         String
  workOrderId        String
  description        String
  estimatedMinutes   Int
  hourlyRateCharged  Decimal        @db.Decimal(12, 2)
  internalCostAmount Decimal?       @db.Decimal(12, 2)
  status             WorkItemStatus @default(PENDIENTE)
  deletedAt          DateTime?

  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Restrict)

  @@index([workshopId, workOrderId, status])
  @@map("work_items")
}

model PartItem {
  id               String     @id @default(cuid())
  workshopId       String
  workOrderId      String
  partNumber       String?
  description      String
  quantity         Int
  unitCost         Decimal?   @db.Decimal(12, 2)
  unitPriceCharged Decimal    @db.Decimal(12, 2)
  status           PartStatus @default(PENDIENTE)
  deletedAt        DateTime?

  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Restrict)

  @@index([workshopId, workOrderId, status])
  @@map("part_items")
}

model Bay {
  id         String    @id @default(cuid())
  workshopId String
  code       String
  ordinal    Int
  status     BayStatus @default(LIBRE)
  isEnabled  Boolean   @default(true)
  deletedAt  DateTime?

  workshop    Workshop        @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  assignments BayAssignment[]

  @@unique([workshopId, code])
  @@unique([workshopId, ordinal])
  @@map("bays")
}

model BayAssignment {
  id          String    @id @default(cuid())
  bayId       String
  workOrderId String
  assignedAt  DateTime  @default(now())
  releasedAt  DateTime?
  releaseReason String?

  bay       Bay       @relation(fields: [bayId], references: [id], onDelete: Restrict)
  workOrder WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Restrict)

  @@index([bayId, releasedAt])
  @@index([workOrderId, releasedAt])
  @@map("bay_assignments")
}
```

El fragmento anterior es el contrato de los campos usados por la tajada; el archivo real contiene además módulos heredados de presupuesto, inventario, auditoría y entrega que no se reintroducen en el diseño lean.

### 5.2 Índices parciales PostgreSQL requeridos

Los dos índices siguientes ya existen en `prisma/migrations/0_init/migration.sql` y son invariantes de motor:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS work_order_one_active_per_vehicle
ON work_orders ("vehicleId")
WHERE "deletedAt" IS NULL
  AND "status" NOT IN ('ENTREGADO', 'CANCELADA');

CREATE UNIQUE INDEX IF NOT EXISTS bay_one_active_assignment
ON bay_assignments ("bayId")
WHERE "releasedAt" IS NULL;
```

El primer índice garantiza como máximo una orden activa por vehículo. El segundo garantiza como máximo una asignación no liberada por bahía. Ambos son necesarios aunque el servicio aplique validaciones previas, porque el índice es la última barrera contra carreras concurrentes.

Índice de soporte para tracking:

```sql
CREATE INDEX IF NOT EXISTS work_order_tracking_code_active_idx
ON work_orders ("trackingCodeHash")
WHERE "trackingCodeRevokedAt" IS NULL;
```

La unicidad global de `WorkOrder.trackingCodeHash @unique` evita colisiones de acceso entre talleres.

### 5.3 Restricciones de datos que G3 debe cerrar

El contrato de aplicación ya valida los valores monetarios y cantidades, pero el esquema actual no expresa todos esos límites como `CHECK` de PostgreSQL. Antes de declarar G3 completo, evaluar agregar, sin alterar la semántica lean:

```sql
ALTER TABLE work_items
  ADD CONSTRAINT work_items_estimated_minutes_positive
  CHECK ("estimatedMinutes" > 0),
  ADD CONSTRAINT work_items_hourly_rate_non_negative
  CHECK ("hourlyRateCharged" >= 0);

ALTER TABLE part_items
  ADD CONSTRAINT part_items_quantity_positive
  CHECK (quantity > 0),
  ADD CONSTRAINT part_items_unit_price_non_negative
  CHECK ("unitPriceCharged" >= 0);

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_totals_non_negative
  CHECK (
    "laborSubtotal" >= 0 AND
    "partsSubtotal" >= 0 AND
    "totalEstimated" >= 0 AND
    "totalFinal" >= 0
  );
```

Estos `CHECK` son una propuesta de cierre G3, no una afirmación de que ya estén desplegados.

### 5.4 Hallazgo de migración que bloquea una certificación de base real

`prisma/migrations/0_init/migration.sql` también contiene un índice parcial de inventario que usa:

```sql
DATE("createdAt") = CURRENT_DATE
```

PostgreSQL rechaza esa expresión en un índice parcial porque `CURRENT_DATE` es `STABLE`, no `IMMUTABLE`. El hallazgo no pertenece al flujo lean de alta/tracking, pero impide afirmar que el baseline completo sea desplegable en PostgreSQL sin remediación. No se modifica aquí para preservar el alcance y la invariancia de la rama; debe resolverse en una migración de release separada.

### 5.5 Criterio de aceptación G3

G3 puede considerarse cerrado para esta tajada únicamente cuando exista evidencia de que:

1. los DTOs y envelopes documentados coinciden con los handlers;
2. la transacción de alta preserva `workshopId`, FK y estado inicial;
3. los dos índices parciales se crean correctamente en PostgreSQL real;
4. la máquina de estados y sus bloqueadores se ejecutan server-side, con `expectedVersion`;
5. los totales se calculan con `Decimal`, `ROUND_HALF_EVEN` y separación laboral/repuestos;
6. la asignación y liberación de bahías son atómicas y dejan una sola ocupación activa;
7. los límites pendientes —idempotencia pública, tenant FKs compuestas y hardening HMAC/constant-time— están aceptados formalmente por el gate correspondiente o remediados antes de release.
