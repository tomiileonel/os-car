# OS-CAR — ESPECIFICACIÓN MAESTRA

**Versión:** 1.0.0
**Estado:** Baseline de producto y arquitectura para implementación
**Fecha:** 2026-09-03
**Ámbito:** MVP operativo de un taller por tenant, preparado para aislamiento multi-taller
**Fuente de verdad:** Este documento define el contrato funcional, de dominio, datos, seguridad y verificación. Toda implementación que se aparte de él requiere un ADR aprobado.

## 01. Visión del producto

OS-CAR es el sistema operativo liviano de un taller mecánico: registra el ingreso del vehículo, organiza diagnóstico y reparación, mantiene separados los importes de mano de obra y repuestos, administra las bahías físicas y expone al cliente un seguimiento web verificable.

El producto optimiza tres resultados simultáneos:

1. **Velocidad operativa:** la recepción debe poder completarse desde una tablet en menos de 90 segundos cuando el cliente y el vehículo ya existen.
2. **Transparencia:** cada presupuesto muestra mano de obra y repuestos en bloques independientes, con cantidad, tiempo, tarifa, precio unitario y total de cada línea.
3. **Trazabilidad:** toda modificación relevante conserva actor, fecha, motivo, estado anterior, estado posterior y una explicación legible para el cliente cuando corresponda.

### Decisiones rectoras

- El flujo de orden canónico es `INGRESADO → DIAGNÓSTICO → ESPERANDO_REPARACIÓN → EN_REPARACIÓN → CONTROL → LISTO → ENTREGADO`, con `CANCELADA` como terminal alternativa.
- `ADMIN` es el rol operativo agregado del MVP. La futura separación en propietario, recepción, mecánico y control de calidad debe conservar los mismos casos de uso y restringir permisos, nunca ampliar el acceso por defecto.
- El cliente final no crea una cuenta ni mantiene una sesión. Se autentica por combinación de teléfono normalizado y código de seguimiento, enviada en cada consulta.
- Los estados y las líneas comerciales no se reconstruyen destruyendo datos: los estados se registran en `StatusHistory` y los importes aprobados se congelan en versiones de presupuesto.

## 02. Alcance

El MVP debe cubrir:

- Pantalla inicial tripartita: alta rápida de cliente, acceso administrativo y seguimiento externo.
- Alta y reutilización de clientes y vehículos, con patente normalizada y control de duplicados.
- Check-in con kilometraje, combustible, notas, inventario declarado y checklist visual de daños con fotografías.
- Creación, asignación y seguimiento de órdenes de trabajo.
- Máquina de estados lean con transiciones controladas y bloqueo por aprobación, repuestos o capacidad.
- Definición de un número variable de bahías y asignación exclusiva de una bahía activa por orden.
- Catálogo operativo de trabajos de mano de obra y repuestos, sin fusionar ambas categorías.
- Presupuestos versionados, totales automáticos y aprobación/rechazo trazable.
- Estado logístico individual de cada repuesto y reflejo inmediato del bloqueo en la orden.
- Registro de horas estimadas y reales de mano de obra.
- Control de calidad, preparación para entrega y registro de entrega física.
- Portal público de seguimiento de solo lectura mientras la orden sea consultable.
- Historial de eventos legible para cliente y auditoría técnica detallada para el taller.
- Autenticación administrativa con Better Auth, RBAC server-side, aislamiento por `workshopId`, rate limiting e idempotencia.
- Tests unitarios, de integración y E2E para los flujos críticos.

## 03. Exclusiones

Queda fuera del MVP y no debe introducirse como dependencia implícita:

- WhatsApp, bots o mensajería conversacional.
- Pasarelas de pago, cobranzas online o conciliación bancaria.
- Facturación electrónica, IVA configurable por jurisdicción o regímenes fiscales.
- Marketplace, cotización automática de proveedores externos o compras online.
- Multiempresa complejo con jerarquías corporativas; sí se conserva `Workshop` como límite de tenant.
- Registro de clientes finales con usuario y contraseña.
- Seguimiento público de órdenes entregadas o canceladas.
- Inventario avanzado de múltiples depósitos, lotes, números de serie o trazabilidad contable de almacén.

Los costos internos, movimientos de stock y notas de cancelación pueden registrarse para operación y auditoría, pero no constituyen un módulo de facturación.

## 04. Actores

| Actor | Identidad | Acceso | Responsabilidad |
|---|---|---|---|
| Cliente de alta | Persona en recepción o formulario inicial | Sin sesión persistente | Provee datos de contacto, vehículo y motivo de consulta; recibe el código |
| `ADMIN` | Usuario interno autenticado por Better Auth | Sesión administrativa | Opera clientes, vehículos, órdenes, bahías, presupuestos, repuestos, calidad y entrega |
| `CLIENTE_SEGUIMIENTO` | Actor lógico público, no usuario persistente | Teléfono + tracking code | Consulta únicamente el estado y la vista pública autorizada de su orden |
| Sistema | Proceso confiable del backend | Cuenta de servicio o ejecución interna | Genera códigos, recalcula totales, valida invariantes y registra eventos |

El MVP no expone al cliente permisos de edición. Si más adelante se agregan roles internos (`OWNER`, `RECEPTION`, `MECHANIC`, `QUALITY`), `ADMIN` seguirá siendo el permiso agregado de compatibilidad y deberá degradarse explícitamente por capacidad.

## 05. Flujos principales

### 5.1 Entrada tripartita

```text
                    ┌──────────────┐
                    │  Pantalla    │
                    │  de entrada  │
                    └──────┬───────┘
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
   SOY CLIENTE       SOY ADMIN      SEGUIR VEHÍCULO
          │               │                │
  Cliente + vehículo   Better Auth   Teléfono + código
          │               │                │
          └──────► OT INGRESADA       Vista pública
```

### 5.2 Flujo operativo completo

```text
Alta/check-in
    ↓
INGRESADO
    ↓ diagnóstico completado
DIAGNÓSTICO
    ↓ presupuesto listo; puede bloquear aprobación o repuestos
ESPERANDO_REPARACIÓN
    ↓ aprobación y condiciones satisfechas
EN_REPARACIÓN ──┐
    │            │ repuesto pendiente / trabajo adicional
    │            └──── continúa EN_REPARACIÓN con bloqueador visible
    ↓ reparación finalizada
CONTROL
    ↓ control aprobado
LISTO
    ↓ entrega física verificada
ENTREGADO

Cualquier estado no terminal ── motivo obligatorio ──► CANCELADA
```

### 5.3 Regla de consistencia del flujo

Cada comando de negocio debe ejecutar, dentro de la misma transacción, validación de autorización, validación de versión optimista, validación de estado, modificación de entidades, recalculo de totales/ocupación y escritura del evento. No se permite actualizar la orden y registrar el historial en transacciones independientes.

## 06. Flujo del cliente

### 6.1 Alta rápida (`SOY CLIENTE`)

1. El formulario solicita nombre, teléfono, patente, datos mínimos del vehículo y motivo de consulta.
2. El borde normaliza teléfono y patente antes de buscar o escribir.
3. Si el teléfono ya existe en el taller, se ofrece seleccionar un vehículo existente o registrar uno nuevo.
4. Si la patente existe, se reutiliza el vehículo solo si pertenece al mismo cliente; de lo contrario la operación queda en revisión administrativa y no cambia el propietario automáticamente.
5. El sistema crea o recupera `Customer`, crea o recupera `Vehicle`, crea `WorkOrder` en `INGRESADO` y genera un nuevo tracking code.
6. La respuesta muestra el código una sola vez con acciones de copiar, imprimir y descargar como texto; no se lo incluye en logs ni en una URL.
7. La pantalla confirma que el código es la llave necesaria para el seguimiento y que el taller puede regenerarlo invalidando el anterior.

La alta no crea una sesión de cliente. El teléfono no se muestra completo en la respuesta y el código no vuelve a ser recuperable públicamente.

### 6.2 Seguimiento (`SEGUIR MI VEHÍCULO`)

- Método preferente: `POST` HTTPS con teléfono y código; nunca aceptar la combinación únicamente por query string.
- Se normalizan ambos valores y se compara el teléfono normalizado con el teléfono de la orden y el hash HMAC del código.
- Una coincidencia válida devuelve solo la proyección pública de la orden: patente parcialmente enmascarada, estado, bloqueador traducido, progreso, eventos públicos, importes aprobados si fueron publicados y próximos pasos.
- La respuesta se entrega con `Cache-Control: no-store`, `Vary: *` y sin cookies de sesión.
- Los errores de teléfono incorrecto, código incorrecto, orden inexistente, código revocado y orden no consultable se presentan con el mismo mensaje externo.
- En `ENTREGADO` y `CANCELADA` el seguimiento se rechaza aunque el código histórico sea correcto.

### 6.3 Aprobación de presupuesto

La aprobación pública es opcional para una orden marcada `NO_REQUIERE_APROBACIÓN`, pero obligatoria para cualquier aumento de precio o trabajo adicional cobrable. Se realiza desde la vista de seguimiento con teléfono + código, sobre una versión concreta del presupuesto.

La decisión almacena `budgetVersionId`, fecha, hash del teléfono, hash del contenido aprobado, IP anonimizada y user-agent resumido. La firma es una evidencia de click auditado, no una firma electrónica fiscal.

## 07. Flujo del administrador

### 7.1 Autenticación y contexto

1. Better Auth autentica al usuario interno.
2. El servidor carga la membresía `AdminUser` activa y su `workshopId`.
3. Toda query y mutación filtra el tenant desde la sesión, nunca desde un `workshopId` enviado por el navegador.
4. Si no hay sesión, se devuelve `401`; si la sesión existe pero no tiene capacidad, `403`.

### 7.2 Recepción

- Buscar cliente por teléfono o nombre normalizado.
- Buscar vehículo por patente/VIN.
- Capturar odómetro, combustible, motivo de consulta, objetos declarados y daños.
- Tomar fotografías desde la cámara de la tablet y asociarlas al check-in.
- Crear la orden y entregar el código.

### 7.3 Diagnóstico y presupuesto

- Avanzar a `DIAGNÓSTICO`.
- Añadir trabajos de mano de obra con tiempo, tarifa y técnico.
- Añadir repuestos con cantidad, costo, precio y estado logístico.
- Publicar una versión de presupuesto.
- Aprobar/rechazar internamente la preparación y esperar aprobación del cliente cuando sea requerida.

### 7.4 Reparación, bahía y control

- Asignar o reasignar bahía.
- Iniciar trabajo solo con condiciones satisfechas.
- Registrar horas reales y avance.
- Marcar repuestos como `CONSEGUIDO` o `INSTALADO`.
- Finalizar reparación y pasar a `CONTROL` incluso si la orden no tuvo bahía.
- Aprobar o rechazar control con notas y evidencia fotográfica opcional.

### 7.5 Entrega

Solo se habilita desde `LISTO`. El administrador registra identidad mínima del receptor, conformidad, llaves/documentación entregadas y fecha/hora. La orden pasa a `ENTREGADO`, se revoca el tracking público y se libera cualquier asignación residual de bahía en la misma transacción.

## 08. Ciclo de vida del vehículo

El vehículo es un maestro reutilizable dentro de un taller:

```text
NO_EXISTE → REGISTRADO → EN_SERVICIO → HISTÓRICO
```

`EN_SERVICIO` e `HISTÓRICO` son proyecciones de uso, no reemplazan el estado de la orden. Un vehículo puede tener muchas órdenes históricas, pero como máximo una orden no terminal (`INGRESADO`, `DIAGNÓSTICO`, `ESPERANDO_REPARACIÓN`, `EN_REPARACIÓN`, `CONTROL` o `LISTO`) por taller.

### Identidad

- `licensePlateNormalized` es obligatorio, se transforma a mayúsculas y elimina espacios/guiones.
- Unicidad: `[workshopId, licensePlateNormalized]`.
- VIN, si existe, se almacena normalizado y con índice; no sustituye la unicidad de patente local.
- La relación principal es `[workshopId, customerId]`; transferencias de titularidad requieren operación administrativa y evento.

### Kilometraje

El check-in conserva `odometerAtIntake` original. Una corrección no lo sobrescribe silenciosamente: mantiene valor previo, valor corregido, actor, motivo y evidencia. Por defecto se rechaza un valor inferior al último registro; un `ADMIN` puede autorizar una corrección inferior con motivo obligatorio y el sistema debe marcarla como excepción.

## 09. Ciclo de vida de la orden

### Estados canónicos

| Estado | Significado | Entrada | Salida normal |
|---|---|---|---|
| `INGRESADO` | Vehículo recibido; check-in mínimo completo | Alta/check-in | Iniciar diagnóstico |
| `DIAGNÓSTICO` | Se inspecciona y define alcance | `INGRESADO` | Diagnóstico cerrado |
| `ESPERANDO_REPARACIÓN` | Alcance definido, pero todavía no se puede ejecutar | Diagnóstico cerrado | Condiciones satisfechas |
| `EN_REPARACIÓN` | Trabajo operativo iniciado | Aprobación/condiciones | Reparación finalizada |
| `CONTROL` | Verificación técnica y checklist final | Reparación finalizada | Control aprobado |
| `LISTO` | Preparado para retiro | Control aprobado | Entrega física |
| `ENTREGADO` | Vehículo retirado; seguimiento público revocado | Entrega validada | Terminal |
| `CANCELADA` | Flujo abortado con motivo | Cualquier no terminal | Terminal |

### Condiciones de transición

- `INGRESADO → DIAGNÓSTICO`: check-in completo y orden no cancelada.
- `DIAGNÓSTICO → ESPERANDO_REPARACIÓN`: existe diagnóstico legible; toda línea comercial está en una versión de presupuesto.
- `ESPERANDO_REPARACIÓN → EN_REPARACIÓN`: presupuesto aprobado o no requerido, trabajos adicionales aprobados, y no hay repuesto bloqueante pendiente para el primer trabajo.
- `EN_REPARACIÓN → CONTROL`: no quedan trabajos cobrables en estado pendiente/en curso; los repuestos utilizados están conciliados.
- `CONTROL → LISTO`: checklist de calidad aprobado y no hay defecto crítico abierto.
- `LISTO → ENTREGADO`: identidad/conformidad de entrega registrada.
- Cualquier transición ilegal devuelve `422 INVALID_STATE_TRANSITION` y no modifica nada.
- `CANCELADA` y `ENTREGADO` son terminales; no se reabren. Un nuevo servicio crea una nueva orden.

### Bloqueadores

`blockReason` es un campo derivado pero persistido para lectura rápida: `NINGUNO`, `APROBACION_CLIENTE`, `REPUESTO_PENDIENTE`, `CAPACIDAD_TALLER`, `DATOS_INCOMPLETOS`, `CONTROL_OBSERVADO` u `OTRO`. Si existe más de uno, `blockReason` toma la prioridad `APROBACION_CLIENTE > REPUESTO_PENDIENTE > CONTROL_OBSERVADO > DATOS_INCOMPLETOS > CAPACIDAD_TALLER > OTRO`; el resto se conserva en `blockReasons` o se identifica en los ítems.

Una orden `EN_REPARACIÓN` con un repuesto pendiente mantiene su estado principal, pero exhibe el subestado `BLOQUEADA — ESPERANDO REPUESTO`. No se falsea el estado a `ESPERANDO_REPARACIÓN` porque el trabajo ya comenzó.

## 10. Sistema de bahías

### Modelo operativo

El administrador define bahías numeradas `Bahía 1 ... Bahía N`. `Bay.status` es una proyección de la asignación activa:

- `LIBRE`: no existe `BayAssignment` sin `releasedAt`.
- `OCUPADA`: existe exactamente una asignación activa y la orden no es terminal.

La fuente histórica es `BayAssignment`, que conserva asignación, reasignación y liberación.

### Reglas

- Una bahía no puede tener dos asignaciones activas.
- Una orden no puede tener dos asignaciones activas.
- Una bahía deshabilitada no admite nuevas asignaciones.
- Asignar una bahía es una transacción con lock lógico/versión y creación de evento.
- Reasignar libera la anterior y crea la nueva; no edita la fila histórica.
- `ENTREGADO` y `CANCELADA` liberan automáticamente la bahía dentro de la misma transacción.
- Finalizar reparación sin bahía es válido: `bayId` puede ser nulo y el evento explica `SERVICIO_SIN_BAHÍA`.

### Reducción de capacidad

Al cambiar la capacidad objetivo, el sistema no borra bahías. Las de ordinal superior al nuevo límite se marcan `isEnabled=false`. Si alguna está ocupada:

1. Se conserva la asignación existente.
2. La bahía queda `RETIRADA_PENDIENTE` operacionalmente: no acepta nuevos vehículos.
3. La capacidad disponible se calcula solo con bahías habilitadas y libres.
4. El panel lista las órdenes que deben reasignarse.
5. Al liberar o reasignar la bahía, se completa su retiro lógico.

No se mueve un vehículo automáticamente porque la decisión física puede ser insegura. La reducción se confirma como “capacidad objetivo pendiente de reubicación” hasta que no queden bahías retirables ocupadas.

## 11. Sistema de mano de obra

`WorkItem` representa una tarea/servicio, nunca un repuesto.

Campos funcionales mínimos:

- Descripción clara para cliente y nota técnica interna separada.
- Tiempo estimado en minutos, positivo.
- Tarifa horaria cobrada congelada en el presupuesto publicado.
- Técnico asignado opcional, horas/minutos reales y estado operacional.
- `isAdditional` y `requiresApproval` para trabajos descubiertos después del diagnóstico.
- Importe de línea: `estimatedMinutes / 60 × hourlyRateCharged`, redondeado a centavos solo al final de la línea.

La tarifa o costo actual del catálogo no cambia una orden publicada. Antes de publicar puede editarse mediante una nueva versión; después de aprobarse solo se genera una revisión de presupuesto. Las horas reales sirven para eficiencia y auditoría, pero no modifican automáticamente el importe aprobado.

## 12. Sistema de repuestos

`PartItem` representa un insumo de la orden. Sus campos incluyen SKU/OEM opcional, descripción, cantidad entera positiva, costo interno, precio de venta unitario congelado, origen y estado logístico.

### Estados

| Estado | Regla |
|---|---|
| `PENDIENTE` | Necesario pero aún no confirmado/conseguido; puede bloquear reparación |
| `CONSEGUIDO` | Disponible físicamente para la orden; no implica instalado |
| `INSTALADO` | Aplicado al vehículo; requiere trazabilidad de movimiento |
| `DEVOLUCION_PENDIENTE` | La orden se canceló o la pieza debe devolverse |
| `DEVUELTO` | Retorno conciliado en inventario |
| `CANCELADO` | Línea anulada con motivo; nunca se elimina físicamente |

Un repuesto `PENDIENTE` añadido mientras la orden está `EN_REPARACIÓN` activa `REPUESTO_PENDIENTE` y exige conseguirlo antes de continuar con el trabajo dependiente. Marcarlo `CONSEGUIDO` elimina ese bloqueo únicamente si no quedan otros repuestos pendientes bloqueantes.

El descuento, reserva, devolución y ajuste de stock se ejecutan en transacciones. El MVP no promete sincronización con proveedores externos.

## 13. Sistema de costos

### Fórmulas

```text
subtotalManoDeObra = Σ (minutosEstimados / 60 × tarifaHorariaCobrada)
subtotalRepuestos  = Σ (cantidad × precioUnitarioCobrado)
totalEstimado      = subtotalManoDeObra + subtotalRepuestos
totalFinal         = suma de importes finales aprobados y no anulados
```

No se incluye IVA ni descuento fiscal en el MVP. Si el negocio requiere descuentos comerciales, se incorporan en una futura versión de presupuesto como línea explícita y con permisos, nunca ocultos dentro del precio unitario.

### Inmutabilidad comercial

`WorkItem` y `PartItem` son registros operativos. `BudgetVersion`, `BudgetLaborLine` y `BudgetPartLine` son snapshots comerciales inmutables. Una aprobación siempre apunta a una versión concreta. Cambiar una tarifa o precio aprobado crea una versión nueva y, si modifica el total, deja la orden esperando nueva aprobación.

### Precisión

- Persistir dinero en `Decimal(12,2)`, nunca `float`.
- Persistir tiempo en minutos enteros.
- Validar importes no negativos y cantidades positivas en el borde.
- Recalcular en servidor; el total enviado por cliente es informativo y no confiable.

## 14. Seguimiento del cliente

### Código de seguimiento

El código se genera con un CSPRNG del runtime, no con un contador ni con patente/teléfono. Formato visual MVP: `AAA-9999`, usando un alfabeto humano sin `I`, `L`, `O`, `0`, `1` y separador no significativo. La entropía mínima del código normalizado es la del alfabeto definido y debe quedar documentada en tests.

La forma corta solo es aceptable junto con capas defensivas:

- combinación obligatoria con teléfono normalizado;
- hash HMAC-SHA-256 con pepper del servidor en base de datos, nunca plaintext;
- comparación en tiempo constante;
- rate limiting distribuido por IP, teléfono hash, fingerprint de dispositivo y tenant;
- respuesta genérica y tiempo de respuesta comparable;
- expiración/revocación al entregar, cancelar o regenerar.

Si una medición de seguridad demuestra que el formato corto no alcanza el riesgo aceptado, se amplía a `AAA-999999` sin cambiar el contrato semántico. No se reduce la seguridad para preservar una estética de siete caracteres.

### Vista pública

La proyección incluye:

- Estado actual y fecha de última actualización.
- Patente parcialmente enmascarada y marca/modelo solo si la política del taller lo permite.
- Progreso visual por etapas.
- Bloqueador traducido en lenguaje no técnico.
- Historial de eventos marcados como públicos.
- Resumen comercial publicado y decisión de aprobación, si aplica.

Nunca expone IDs internos, nombres de empleados, notas internas, costo de adquisición, hash de código, otros vehículos del cliente ni datos de otros talleres.

## 15. Historial y eventos

### `StatusHistory`

Es inmutable y user-facing. Cada cambio de estado y cada evento relevante genera una fila con:

- `fromStatus`, `toStatus` cuando haya transición;
- `eventType` estable;
- fecha/hora UTC;
- actor `ADMIN`, `CUSTOMER` o `SYSTEM`;
- descripción pública legible y detalle interno separado;
- metadata estructurada sin secretos;
- `publicVisible` explícito.

Eventos mínimos: ingreso, diagnóstico iniciado/finalizado, presupuesto publicado, aprobación/rechazo, trabajo agregado, trabajo iniciado/finalizado, repuesto solicitado/conseguido/instalado, bloqueo/desbloqueo, asignación/reasignación/liberación de bahía, control iniciado/aprobado/observado, listo, entrega, cancelación, corrección de kilometraje y regeneración de código.

### Event sourcing acotado

OS-CAR no reconstruye todo el estado ejecutando eventos históricos. El estado actual vive en tablas transaccionales y `StatusHistory` es el registro append-only de trazabilidad. Esta decisión mantiene consultas simples y conserva auditoría sin introducir la complejidad operativa de event sourcing completo.

## 16. Modelo de permisos (RBAC)

La autorización se ejecuta en el servidor después de autenticar la sesión y resolver `workshopId`. El cliente público no tiene una fila de usuario ni permisos mutables: solo posee una capacidad de lectura temporal derivada de una coincidencia teléfono+código.

### Capacidades

- `VIEW_WORKSHOP_DASHBOARD`
- `MANAGE_CUSTOMERS`
- `MANAGE_VEHICLES`
- `CREATE_ORDER`
- `EDIT_INTAKE`
- `CORRECT_ODOMETER`
- `TRANSITION_ORDER`
- `MANAGE_BAYS`
- `ASSIGN_BAY`
- `EDIT_LABOR`
- `LOG_ACTUAL_LABOR`
- `EDIT_PARTS`
- `CHANGE_PART_STATUS`
- `MANAGE_BUDGET`
- `APPROVE_BUDGET_INTERNAL`
- `VIEW_INTERNAL_COSTS`
- `VIEW_AUDIT`
- `CANCEL_ORDER`
- `DELIVER_ORDER`
- `REGENERATE_TRACKING_CODE`
- `VIEW_PUBLIC_ORDER`

### Matriz MVP

| Capacidad | `ADMIN` | `CLIENTE_SEGUIMIENTO` |
|---|:---:|:---:|
| Ver dashboard del taller | Sí | No |
| Crear/editar cliente | Sí | No |
| Crear/editar vehículo | Sí | No |
| Crear orden/check-in | Sí | No |
| Corregir kilometraje | Sí, motivo | No |
| Cambiar estado operativo | Sí, con reglas | No |
| Crear/reasignar/deshabilitar bahías | Sí | No |
| Asignar bahía | Sí | No |
| Editar mano de obra | Sí | No |
| Registrar horas reales | Sí | No |
| Ver costo interno de mano de obra | Sí | No |
| Editar repuestos y logística | Sí | No |
| Ver costo de adquisición | Sí | No |
| Publicar nueva versión de presupuesto | Sí | No |
| Aprobar presupuesto | Sí internamente; cliente aprueba su versión | Solo su orden |
| Ver auditoría completa | Sí | No |
| Ver historial público | Sí | Solo su orden válida |
| Cancelar orden | Sí, motivo obligatorio | No |
| Entregar vehículo | Sí | No |
| Regenerar tracking code | Sí | No |

`ADMIN` nunca puede saltarse ownership del tenant. Un permiso funcional no sustituye la comprobación de `workshopId`, existencia, estado y versión.

## 17. Modelo de datos (Entidades, Atributos, Restricciones)

### Núcleo

| Entidad | Propósito | Restricciones esenciales |
|---|---|---|
| `Workshop` | Límite de tenant y configuración | `id` único; timezone válida |
| `AdminUser` | Identidad interna enlazada a Better Auth | `authUserId` único; membresía activa por taller |
| `Customer` | Persona dueña/contacto | teléfono normalizado único por taller |
| `Vehicle` | Maestro del vehículo | patente normalizada única por taller |
| `WorkOrder` | Orden central | una activa por vehículo; tracking hash único |
| `Bay` | Bahía física configurable | código/ordinal único por taller |
| `BayAssignment` | Ocupación histórica | una activa por bahía y por orden |
| `WorkItem` | Mano de obra operativa | minutos y tarifa no negativos |
| `PartItem` | Repuesto operativo | cantidad positiva; estado válido |
| `InventoryItem` | Stock local opcional | SKU único por taller |
| `InventoryMovement` | Movimiento auditable de stock | cantidad no cero y actor |

### Comercial y auditoría

| Entidad | Propósito |
|---|---|
| `Budget` | Contenedor de versiones de presupuesto por orden |
| `BudgetVersion` | Snapshot aprobable e inmutable |
| `BudgetLaborLine` / `BudgetPartLine` | Líneas comerciales congeladas |
| `BudgetApproval` | Evidencia de decisión interna o pública |
| `StatusHistory` | Timeline legible e inmutable |
| `AuditLog` | Diff técnico, motivo, request e IP anonimizada |
| `IdempotencyRecord` | Repetición segura de comandos mutables |

### Check-in y entrega

| Entidad | Propósito |
|---|---|
| `IntakeRecord` | Estado de ingreso, odómetro y combustible |
| `VehicleInventoryCheck` | Objetos y accesorios declarados |
| `DamageMark` | Punto/tipo de daño en diagrama |
| `MediaAsset` | Fotografía o evidencia asociada |
| `QualityControl` | Resultado del control final |
| `DeliveryRecord` | Entrega física y conformidad |

Todas las entidades de negocio tienen `createdAt`, `updatedAt`; las que puedan quedar obsoletas tienen `deletedAt`. Historial, auditoría, aprobaciones y movimientos no se borran físicamente.

## 18. Schema Prisma Completo (Código schema.prisma para PostgreSQL)

El siguiente esquema es el contrato de persistencia de la primera implementación. Las tablas de Better Auth se mantienen en el esquema generado por Better Auth; `AdminUser.authUserId` las enlaza sin duplicar credenciales.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum AdminRole {
  ADMIN
}

enum OrderStatus {
  INGRESADO
  DIAGNOSTICO
  ESPERANDO_REPARACION
  EN_REPARACION
  CONTROL
  LISTO
  ENTREGADO
  CANCELADA
}

enum BlockReason {
  NINGUNO
  APROBACION_CLIENTE
  REPUESTO_PENDIENTE
  CAPACIDAD_TALLER
  DATOS_INCOMPLETOS
  CONTROL_OBSERVADO
  OTRO
}

enum BayStatus {
  LIBRE
  OCUPADA
}

enum WorkItemStatus {
  PENDIENTE
  EN_CURSO
  COMPLETADO
  CANCELADO
}

enum PartStatus {
  PENDIENTE
  CONSEGUIDO
  INSTALADO
  DEVOLUCION_PENDIENTE
  DEVUELTO
  CANCELADO
}

enum BudgetStatus {
  BORRADOR
  PENDIENTE_APROBACION
  APROBADO
  RECHAZADO
  SUPERSEDED
}

enum ApprovalDecision {
  APROBADO
  RECHAZADO
}

enum FuelLevel {
  VACIO
  CUARTO
  MITAD
  TRES_CUARTOS
  LLENO
}

enum DamageType {
  RAYON
  ABOLLADURA
  ROTURA
  CRISTAL
  OTRO
}

enum MediaKind {
  FOTO_INGRESO
  FOTO_DANO
  FOTO_CONTROL
  FOTO_ENTREGA
}

enum InventoryMovementType {
  INGRESO
  RESERVA
  CONSUMO
  DEVOLUCION
  AJUSTE
}

enum ActorType {
  ADMIN
  CLIENTE
  SYSTEM
}

enum HistoryEventType {
  INGRESO
  DIAGNOSTICO_INICIADO
  DIAGNOSTICO_FINALIZADO
  PRESUPUESTO_PUBLICADO
  PRESUPUESTO_APROBADO
  PRESUPUESTO_RECHAZADO
  TRABAJO_AGREGADO
  TRABAJO_INICIADO
  TRABAJO_FINALIZADO
  REPUESTO_SOLICITADO
  REPUESTO_CONSEGUIDO
  REPUESTO_INSTALADO
  BLOQUEO_ACTIVADO
  BLOQUEO_RESUELTO
  BAHIA_ASIGNADA
  BAHIA_REASIGNADA
  BAHIA_LIBERADA
  CONTROL_INICIADO
  CONTROL_APROBADO
  CONTROL_OBSERVADO
  LISTO_PARA_ENTREGA
  ENTREGA_REALIZADA
  ORDEN_CANCELADA
  KILOMETRAJE_CORREGIDO
  CODIGO_REGENERADO
  OTRO
}

model Workshop {
  id              String   @id @default(cuid())
  name            String
  timezone        String   @default("America/Argentina/Buenos_Aires")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  admins          AdminUser[]
  customers       Customer[]
  vehicles        Vehicle[]
  workOrders      WorkOrder[]
  bays            Bay[]
  inventoryItems  InventoryItem[]
  auditLogs       AuditLog[]
  idempotencyKeys IdempotencyRecord[]
}

model AdminUser {
  id                    String       @id @default(cuid())
  workshopId            String
  authUserId            String       @unique
  displayName           String
  email                 String?
  role                  AdminRole    @default(ADMIN)
  active                Boolean      @default(true)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  createdOrders         WorkOrder[]  @relation("OrderCreatedBy")
  assignedWorkItems     WorkItem[]   @relation("WorkItemAssignee")
  createdWorkItems      WorkItem[]   @relation("WorkItemCreatedBy")
  createdPartItems      PartItem[]   @relation("PartItemCreatedBy")
  assignedBays          BayAssignment[] @relation("BayAssignedBy")
  createdBudgets        BudgetVersion[] @relation("BudgetCreatedBy")
  decidedApprovals      BudgetApproval[] @relation("ApprovalAdmin")
  statusEvents          StatusHistory[] @relation("StatusEventActor")
  auditLogs             AuditLog[]  @relation("AuditActor")
  inventoryMovements    InventoryMovement[] @relation("InventoryMovementActor")
  qualityControls       QualityControl[] @relation("QualityInspector")
  deliveryRecords       DeliveryRecord[] @relation("DeliveryActor")

  @@index([workshopId, active])
  @@index([workshopId, email])
}

model Customer {
  id                    String       @id @default(cuid())
  workshopId            String
  fullName              String
  phoneE164             String
  phoneNormalized       String
  email                 String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  vehicles              Vehicle[]
  workOrders            WorkOrder[]

  @@unique([workshopId, phoneNormalized])
  @@index([workshopId, fullName])
}

model Vehicle {
  id                    String       @id @default(cuid())
  workshopId            String
  customerId            String
  licensePlate          String
  licensePlateNormalized String
  vin                   String?
  make                  String?
  model                 String?
  modelYear             Int?
  color                 String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  customer              Customer     @relation(fields: [customerId], references: [id], onDelete: Restrict)
  workOrders            WorkOrder[]

  @@unique([workshopId, licensePlateNormalized])
  @@index([workshopId, vin])
  @@index([customerId, createdAt])
}

model WorkOrder {
  id                    String       @id @default(cuid())
  workshopId            String
  customerId            String
  vehicleId             String
  createdById           String?
  trackingCodeHash      String       @unique
  trackingCodeIssuedAt  DateTime     @default(now())
  trackingCodeRevokedAt DateTime?
  status                OrderStatus  @default(INGRESADO)
  blockReason           BlockReason  @default(NINGUNO)
  blockNote             String?
  version               Int          @default(1)
  openedAt              DateTime     @default(now())
  diagnosedAt           DateTime?
  repairStartedAt       DateTime?
  qualityControlAt      DateTime?
  readyAt               DateTime?
  deliveredAt           DateTime?
  cancelledAt           DateTime?
  cancellationReason    String?
  laborSubtotal         Decimal      @default(0) @db.Decimal(12, 2)
  partsSubtotal         Decimal      @default(0) @db.Decimal(12, 2)
  totalEstimated        Decimal      @default(0) @db.Decimal(12, 2)
  totalFinal            Decimal      @default(0) @db.Decimal(12, 2)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  customer              Customer     @relation(fields: [customerId], references: [id], onDelete: Restrict)
  vehicle               Vehicle      @relation(fields: [vehicleId], references: [id], onDelete: Restrict)
  createdBy             AdminUser?   @relation("OrderCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  intakeRecord          IntakeRecord?
  workItems             WorkItem[]
  partItems             PartItem[]
  bayAssignments        BayAssignment[]
  budget                Budget?
  statusHistory         StatusHistory[]
  auditLogs             AuditLog[]
  qualityControl        QualityControl?
  deliveryRecord        DeliveryRecord?

  @@index([workshopId, status, updatedAt])
  @@index([workshopId, vehicleId, status])
  @@index([customerId, createdAt])
}

model Bay {
  id                    String       @id @default(cuid())
  workshopId            String
  code                  String
  ordinal               Int
  status                BayStatus    @default(LIBRE)
  isEnabled             Boolean      @default(true)
  decommissionRequestedAt DateTime?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  assignments           BayAssignment[]

  @@unique([workshopId, code])
  @@unique([workshopId, ordinal])
  @@index([workshopId, isEnabled, status])
}

model BayAssignment {
  id                    String       @id @default(cuid())
  bayId                 String
  workOrderId           String
  assignedById          String?
  assignedAt            DateTime     @default(now())
  releasedAt            DateTime?
  releaseReason         String?

  bay                   Bay          @relation(fields: [bayId], references: [id], onDelete: Restrict)
  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  assignedBy            AdminUser?   @relation("BayAssignedBy", fields: [assignedById], references: [id], onDelete: Restrict)

  @@index([bayId, releasedAt])
  @@index([workOrderId, releasedAt])
}

model WorkItem {
  id                    String         @id @default(cuid())
  workshopId            String
  workOrderId           String
  assignedAdminId       String?
  createdById           String?
  description           String
  internalNote          String?
  estimatedMinutes      Int
  hourlyRateCharged     Decimal        @db.Decimal(12, 2)
  internalCostAmount    Decimal?       @db.Decimal(12, 2)
  actualMinutes         Int            @default(0)
  status                WorkItemStatus @default(PENDIENTE)
  isAdditional          Boolean        @default(false)
  requiresApproval      Boolean        @default(false)
  version               Int            @default(1)
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt
  deletedAt             DateTime?

  workOrder             WorkOrder      @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  assignedAdmin         AdminUser?     @relation("WorkItemAssignee", fields: [assignedAdminId], references: [id], onDelete: Restrict)
  createdBy             AdminUser?     @relation("WorkItemCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  budgetLines           BudgetLaborLine[]

  @@index([workshopId, workOrderId, status])
  @@index([assignedAdminId, status])
}

model PartItem {
  id                    String       @id @default(cuid())
  workshopId            String
  workOrderId           String
  inventoryItemId       String?
  createdById            String?
  partNumber            String?
  description           String
  quantity              Int
  unitCost               Decimal?    @db.Decimal(12, 2)
  unitPriceCharged       Decimal     @db.Decimal(12, 2)
  status                PartStatus   @default(PENDIENTE)
  isAdditional           Boolean      @default(false)
  requiresApproval       Boolean      @default(false)
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
  deletedAt              DateTime?

  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  inventoryItem         InventoryItem? @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
  createdBy             AdminUser?  @relation("PartItemCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  budgetLines           BudgetPartLine[]
  inventoryMovements    InventoryMovement[]

  @@index([workshopId, workOrderId, status])
  @@index([inventoryItemId, status])
}

model InventoryItem {
  id                    String       @id @default(cuid())
  workshopId            String
  sku                   String
  description           String
  stockQuantity         Int          @default(0)
  reorderPoint          Int          @default(0)
  active                Boolean      @default(true)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  deletedAt             DateTime?

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  partItems             PartItem[]
  movements             InventoryMovement[]

  @@unique([workshopId, sku])
  @@index([workshopId, active, stockQuantity])
}

model InventoryMovement {
  id                    String       @id @default(cuid())
  inventoryItemId       String
  partItemId            String?
  actorAdminId          String?
  movementType          InventoryMovementType
  quantityDelta         Int
  reason                String
  createdAt             DateTime     @default(now())

  inventoryItem         InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
  partItem              PartItem?     @relation(fields: [partItemId], references: [id], onDelete: Restrict)
  actorAdmin            AdminUser?    @relation("InventoryMovementActor", fields: [actorAdminId], references: [id], onDelete: Restrict)

  @@index([inventoryItemId, createdAt])
  @@index([partItemId, createdAt])
}

model Budget {
  id                    String       @id @default(cuid())
  workOrderId           String       @unique
  currentVersionId      String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  currentVersion        BudgetVersion? @relation("CurrentBudgetVersion", fields: [currentVersionId], references: [id], onDelete: Restrict)
  versions              BudgetVersion[] @relation("BudgetVersions")
}

model BudgetVersion {
  id                    String       @id @default(cuid())
  budgetId              String
  versionNumber         Int
  createdById            String?
  status                BudgetStatus @default(BORRADOR)
  subtotalLabor         Decimal      @db.Decimal(12, 2)
  subtotalParts         Decimal      @db.Decimal(12, 2)
  totalEstimated        Decimal      @db.Decimal(12, 2)
  publishedAt           DateTime?
  approvedAt            DateTime?
  rejectedAt            DateTime?
  rejectionReason       String?
  createdAt             DateTime     @default(now())

  budget                Budget       @relation("BudgetVersions", fields: [budgetId], references: [id], onDelete: Restrict)
  currentFor            Budget?      @relation("CurrentBudgetVersion")
  createdBy             AdminUser?   @relation("BudgetCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  laborLines            BudgetLaborLine[]
  partLines             BudgetPartLine[]
  approvals             BudgetApproval[]

  @@unique([budgetId, versionNumber])
  @@index([budgetId, status])
}

model BudgetLaborLine {
  id                    String       @id @default(cuid())
  budgetVersionId       String
  workItemId            String?
  description           String
  estimatedMinutes      Int
  hourlyRateCharged     Decimal      @db.Decimal(12, 2)
  lineTotal             Decimal      @db.Decimal(12, 2)

  budgetVersion         BudgetVersion @relation(fields: [budgetVersionId], references: [id], onDelete: Restrict)
  workItem              WorkItem?     @relation(fields: [workItemId], references: [id], onDelete: Restrict)
}

model BudgetPartLine {
  id                    String       @id @default(cuid())
  budgetVersionId       String
  partItemId            String?
  partNumber            String?
  description           String
  quantity              Int
  unitPriceCharged      Decimal      @db.Decimal(12, 2)
  lineTotal             Decimal      @db.Decimal(12, 2)

  budgetVersion         BudgetVersion @relation(fields: [budgetVersionId], references: [id], onDelete: Restrict)
  partItem              PartItem?     @relation(fields: [partItemId], references: [id], onDelete: Restrict)
}

model BudgetApproval {
  id                    String          @id @default(cuid())
  budgetVersionId       String
  actorType             ActorType
  actorAdminId          String?
  decision              ApprovalDecision
  phoneHash             String?
  contentHash           String
  ipHash                String?
  userAgentHash         String?
  decidedAt             DateTime        @default(now())
  reason                String?

  budgetVersion         BudgetVersion   @relation(fields: [budgetVersionId], references: [id], onDelete: Restrict)
  actorAdmin            AdminUser?      @relation("ApprovalAdmin", fields: [actorAdminId], references: [id], onDelete: Restrict)

  @@index([budgetVersionId, decidedAt])
}

model IntakeRecord {
  id                    String       @id @default(cuid())
  workOrderId           String       @unique
  odometerAtIntake      Int
  odometerCorrectedTo   Int?
  fuelLevel             FuelLevel
  customerComplaint     String
  intakeNotes           String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  correctedAt           DateTime?
  correctionReason      String?

  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  inventoryCheck        VehicleInventoryCheck?
  damageMarks           DamageMark[]
  media                 MediaAsset[]
}

model VehicleInventoryCheck {
  id                    String       @id @default(cuid())
  intakeRecordId        String       @unique
  spareWheelPresent     Boolean
  jackPresent           Boolean
  wheelKeyPresent       Boolean
  documentsPresent      Boolean
  declaredItems         Json?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  intakeRecord          IntakeRecord @relation(fields: [intakeRecordId], references: [id], onDelete: Restrict)
}

model DamageMark {
  id                    String       @id @default(cuid())
  intakeRecordId        String
  zone                  String
  damageType            DamageType
  xPercent              Decimal      @db.Decimal(5, 2)
  yPercent              Decimal      @db.Decimal(5, 2)
  note                  String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  intakeRecord          IntakeRecord @relation(fields: [intakeRecordId], references: [id], onDelete: Restrict)
  media                 MediaAsset[]

  @@index([intakeRecordId, zone])
}

model MediaAsset {
  id                    String       @id @default(cuid())
  intakeRecordId        String?
  damageMarkId          String?
  qualityControlId      String?
  deliveryRecordId      String?
  kind                  MediaKind
  objectKey             String
  sha256                String
  mimeType              String
  createdAt             DateTime     @default(now())

  intakeRecord          IntakeRecord? @relation(fields: [intakeRecordId], references: [id], onDelete: Restrict)
  damageMark            DamageMark?   @relation(fields: [damageMarkId], references: [id], onDelete: Restrict)
  qualityControl        QualityControl? @relation(fields: [qualityControlId], references: [id], onDelete: Restrict)
  deliveryRecord        DeliveryRecord? @relation(fields: [deliveryRecordId], references: [id], onDelete: Restrict)

  @@index([intakeRecordId, kind])
  @@index([damageMarkId])
}

model QualityControl {
  id                    String       @id @default(cuid())
  workOrderId           String       @unique
  inspectedById         String?
  passed                Boolean
  notes                 String?
  checklist             Json
  inspectedAt           DateTime     @default(now())

  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  inspectedBy           AdminUser?   @relation("QualityInspector", fields: [inspectedById], references: [id], onDelete: Restrict)
  media                 MediaAsset[]
}

model DeliveryRecord {
  id                    String       @id @default(cuid())
  workOrderId           String       @unique
  deliveredById         String?
  recipientName         String
  recipientDocumentLast4 String?
  keysHandedOver        Boolean
  conformityAccepted    Boolean
  notes                 String?
  deliveredAt           DateTime     @default(now())

  workOrder             WorkOrder    @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  deliveredBy           AdminUser?   @relation("DeliveryActor", fields: [deliveredById], references: [id], onDelete: Restrict)
  media                 MediaAsset[]
}

model StatusHistory {
  id                    String          @id @default(cuid())
  workOrderId           String
  actorType             ActorType
  actorAdminId          String?
  eventType             HistoryEventType
  fromStatus            OrderStatus?
  toStatus              OrderStatus?
  publicVisible         Boolean         @default(true)
  publicDescription     String
  internalDescription   String?
  metadata              Json?
  createdAt             DateTime        @default(now())

  workOrder             WorkOrder       @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  actorAdmin            AdminUser?      @relation("StatusEventActor", fields: [actorAdminId], references: [id], onDelete: Restrict)

  @@index([workOrderId, createdAt])
  @@index([workOrderId, publicVisible, createdAt])
}

model AuditLog {
  id                    String       @id @default(cuid())
  workshopId            String
  workOrderId           String?
  actorType             ActorType
  actorAdminId          String?
  action                String
  entityType            String
  entityId              String
  before                Json?
  after                 Json?
  reason                String?
  requestId             String?
  ipHash                String?
  createdAt             DateTime     @default(now())

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)
  workOrder             WorkOrder?   @relation(fields: [workOrderId], references: [id], onDelete: Restrict)
  actorAdmin            AdminUser?   @relation("AuditActor", fields: [actorAdminId], references: [id], onDelete: Restrict)

  @@index([workshopId, createdAt])
  @@index([entityType, entityId, createdAt])
  @@index([workOrderId, createdAt])
}

model IdempotencyRecord {
  id                    String       @id @default(cuid())
  workshopId            String
  key                   String
  route                 String
  requestHash           String
  responseStatus        Int
  responseBody          Json
  createdAt             DateTime     @default(now())
  expiresAt             DateTime

  workshop              Workshop     @relation(fields: [workshopId], references: [id], onDelete: Restrict)

  @@unique([workshopId, key])
  @@index([expiresAt])
}
```

### Índices parciales obligatorios

Prisma no expresa de forma portable estas unicidades condicionadas; la migración SQL debe agregarlas con `CREATE UNIQUE INDEX`:

```sql
CREATE UNIQUE INDEX work_order_one_active_per_vehicle
ON "WorkOrder" ("vehicleId")
WHERE "deletedAt" IS NULL
  AND "status" NOT IN ('ENTREGADO', 'CANCELADA');

CREATE UNIQUE INDEX bay_one_active_assignment
ON "BayAssignment" ("bayId")
WHERE "releasedAt" IS NULL;

CREATE UNIQUE INDEX order_one_active_bay_assignment
ON "BayAssignment" ("workOrderId")
WHERE "releasedAt" IS NULL;
```

Los nombres de enum en SQL deben coincidir con la estrategia de mapeo elegida por Prisma. La migración debe validarse en una base de prueba antes de aplicarse.

## 19. Relaciones e Integridad Referencial

### Reglas de borrado

- `Workshop`, `Customer`, `Vehicle` y `WorkOrder`: `Restrict`; se desactivan con `deletedAt`.
- Hijos históricos (`StatusHistory`, `AuditLog`, `InventoryMovement`, `BudgetApproval`): nunca cascade ni hard delete.
- Un `WorkItem` o `PartItem` cancelado permanece para preservar presupuesto e historial.
- Un `MediaAsset` puede eliminarse del almacenamiento solo mediante política de retención y debe conservarse un registro de purga; durante la vida de la orden se restringe el borrado.

### Consistencia de tenant

La capa de repositorio recibe el `workshopId` autenticado y exige que cada `where` lo incluya directamente o lo alcance por una relación comprobada. Los IDs CUID no son una barrera de autorización.

### Consistencia de ownership

- `WorkOrder.customerId` debe pertenecer al mismo `workshopId`.
- `WorkOrder.vehicleId` debe pertenecer al mismo `workshopId` y el vehículo debe pertenecer al cliente elegido.
- `Bay`, `InventoryItem`, `AdminUser` y todos los hijos de la orden deben pertenecer al mismo taller.
- Estas invariantes se validan en servicio y se refuerzan con claves compuestas o checks de transacción; no se confía solo en el frontend.

### Concurrencia

`WorkOrder.version` y, cuando sea necesario, `WorkItem.version` implementan optimistic locking. Un comando que lea versión `v` solo actualiza si sigue en `v` y la incrementa a `v+1`. Asignación de bahía y movimientos de inventario deben además serializar el recurso afectado dentro de la transacción.

## 20. Reglas de negocio (Invariantes operativas)

1. Una orden pertenece a exactamente un taller, cliente y vehículo.
2. Un vehículo no puede tener dos órdenes activas en el mismo taller.
3. Una patente normalizada es única dentro de un taller.
4. Un teléfono normalizado identifica un cliente dentro del taller, pero no autoriza por sí solo el seguimiento.
5. El tracking code se almacena solo como hash HMAC y es revocable.
6. Una consulta pública válida no crea sesión ni muta la orden.
7. Una transición ilegal no cambia estado, timestamps, bahía ni historial.
8. `ENTREGADO` y `CANCELADA` son terminales.
9. Toda cancelación exige motivo y conserva costos/horas registradas.
10. Una bahía tiene como máximo una asignación activa y una orden como máximo una bahía activa.
11. Ninguna bahía deshabilitada recibe nuevas asignaciones.
12. Mano de obra y repuestos son colecciones distintas y subtotales distintos.
13. Todo precio publicado/aprobado se conserva como snapshot.
14. Un aumento de total después de una aprobación requiere nueva aprobación.
15. Un repuesto pendiente bloqueante impide iniciar o continuar el trabajo dependiente.
16. Los totales se calculan en servidor con `Decimal`.
17. Toda mutación de alto impacto deja `StatusHistory` y `AuditLog` en la misma transacción.
18. Ningún evento histórico se modifica para “corregir” el pasado; se agrega un evento correctivo.
19. Los datos internos nunca aparecen en la proyección pública.
20. Repetir una petición con la misma `Idempotency-Key` y payload devuelve el mismo resultado sin duplicar efectos.

## 21. Validaciones y Esquemas Zod (Definiciones formales)

La implementación debe centralizar estos contratos en el borde de aplicación. Las definiciones siguientes son la forma normativa; los nombres de mensajes pueden localizarse sin cambiar los códigos.

```ts
import { z } from "zod";

const normalizedPlate = z.string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().min(5).max(10).regex(/^[A-Z0-9]+$/));

const phone = z.string()
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, "PHONE_MUST_BE_E164");

const trackingCode = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{4}$/, "INVALID_TRACKING_CODE");

const positiveMoney = z.number().finite().nonnegative();
const positiveInteger = z.number().int().positive();

export const createCustomerAndVehicleInput = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone,
  email: z.string().trim().email().max(254).optional(),
  licensePlate: normalizedPlate,
  vin: z.string().trim().toUpperCase().length(17).optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  modelYear: z.number().int().min(1886).max(2100).optional(),
  customerComplaint: z.string().trim().min(5).max(2000),
  odometerAtIntake: z.number().int().nonnegative(),
  fuelLevel: z.enum(["VACIO", "CUARTO", "MITAD", "TRES_CUARTOS", "LLENO"]),
}).strict();

export const publicTrackingLookupInput = z.object({
  phone,
  trackingCode,
}).strict();

export const transitionOrderInput = z.object({
  workOrderId: z.string().cuid(),
  expectedVersion: z.number().int().positive(),
  targetStatus: z.enum([
    "DIAGNOSTICO", "ESPERANDO_REPARACION", "EN_REPARACION",
    "CONTROL", "LISTO", "ENTREGADO", "CANCELADA",
  ]),
  reason: z.string().trim().min(5).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.targetStatus === "CANCELADA" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "CANCELLATION_REASON_REQUIRED" });
  }
});

export const workItemInput = z.object({
  description: z.string().trim().min(3).max(500),
  internalNote: z.string().trim().max(2000).optional(),
  estimatedMinutes: positiveInteger,
  hourlyRateCharged: positiveMoney,
  internalCostAmount: positiveMoney.optional(),
  assignedAdminId: z.string().cuid().nullable().optional(),
  isAdditional: z.boolean().default(false),
}).strict();

export const partItemInput = z.object({
  inventoryItemId: z.string().cuid().nullable().optional(),
  partNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().min(2).max(500),
  quantity: positiveInteger,
  unitCost: positiveMoney.nullable().optional(),
  unitPriceCharged: positiveMoney,
  isAdditional: z.boolean().default(false),
}).strict();

export const assignBayInput = z.object({
  workOrderId: z.string().cuid(),
  bayId: z.string().cuid().nullable(),
  expectedOrderVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const odometerCorrectionInput = z.object({
  workOrderId: z.string().cuid(),
  correctedOdometer: z.number().int().nonnegative(),
  reason: z.string().trim().min(10).max(1000),
  expectedOrderVersion: z.number().int().positive(),
}).strict();

export const deliveryInput = z.object({
  workOrderId: z.string().cuid(),
  expectedOrderVersion: z.number().int().positive(),
  recipientName: z.string().trim().min(2).max(120),
  recipientDocumentLast4: z.string().regex(/^[0-9]{4}$/).optional(),
  keysHandedOver: z.literal(true),
  conformityAccepted: z.literal(true),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const budgetDecisionInput = z.object({
  workOrderId: z.string().cuid(),
  budgetVersionId: z.string().cuid(),
  decision: z.enum(["APROBADO", "RECHAZADO"]),
  rejectionReason: z.string().trim().min(5).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "RECHAZADO" && !value.rejectionReason) {
    context.addIssue({ code: "custom", path: ["rejectionReason"], message: "REJECTION_REASON_REQUIRED" });
  }
});
```

Reglas adicionales no expresables solo con Zod: ownership, estado, versión, unicidad, existencia de stock, aprobación requerida y consistencia entre tenant/relaciones se validan en el caso de uso. El parser recibe `unknown`; ningún handler consume input sin parsearlo.

## 22. Seguridad (Anti-enumeración, Rate Limiting, RBAC)

### Amenazas principales

- Fuerza bruta sobre códigos cortos.
- Enumeración de órdenes mediante respuesta o tiempos diferentes.
- IDOR usando IDs de otro taller.
- Repetición de comandos por doble click o mala red.
- Exposición de teléfonos, VIN, costos internos o notas técnicas.
- Manipulación de totales y estados desde el navegador.

### Controles obligatorios

1. HTTPS; cookies administrativas `HttpOnly`, `Secure`, `SameSite=Lax`.
2. Better Auth para sesión administrativa; autorización en Server Actions/Route Handlers.
3. Todas las queries con `workshopId` de sesión.
4. Tracking code con CSPRNG, HMAC pepper, revocación y comparación constante.
5. No guardar código en plaintext, logs, analytics, referers, query strings ni mensajes de error.
6. Respuesta pública única: `TRACKING_ACCESS_DENIED` para cualquier fallo.
7. `Cache-Control: no-store` en toda ruta pública de seguimiento.
8. Rate limit en edge y aplicación: por IP hash, tenant, teléfono hash y huella de cliente. Umbral inicial: 5 intentos fallidos por combinación teléfono+tenant en 15 minutos y 20 por IP+tenant en 15 minutos; al superar, bloqueo progresivo de 15, 60 y 240 minutos. Los límites se configuran y se prueban bajo carga.
9. Después del primer umbral se puede exigir desafío adicional; nunca se revela si el teléfono existe.
10. Audit log de intentos anómalos con hashes y retención limitada.
11. Idempotency-Key UUID en mutaciones públicas y administrativas; hash del payload para rechazar reutilización con contenido distinto.
12. Validación de MIME, tamaño y checksum para fotografías; almacenamiento privado con URLs firmadas de corta duración solo para `ADMIN`.
13. Redacción de PII en logs. IP se guarda hasheada con salt rotativo o seudonimizada según política de retención.

### Límite conocido

`AAA-9999` no debe considerarse secreto suficiente sin rate limiting distribuido. Si el despliegue no puede garantizar el limitador compartido entre réplicas, el formato corto no es aceptable: se debe usar el formato extendido antes de producción.

## 23. Matriz exhaustiva de resolución de casos límite

| # | Caso | Regla de negocio | Resolución técnica y auditoría |
|---:|---|---|---|
| 1 | Cliente pierde código | No se recupera públicamente | `ADMIN` reautenticado genera uno nuevo, revoca el anterior, actualiza hash y registra `CODIGO_REGENERADO`; el cliente recibe el nuevo por canal presencial definido por el taller |
| 2 | Teléfono no coincide | No revelar si falla teléfono o código | Misma respuesta `TRACKING_ACCESS_DENIED`, incremento de rate limit y evento de seguridad sin PII |
| 3 | Vehículo vuelve tiempo después | La patente identifica el maestro; cada ingreso crea nueva OT | Reusar `Vehicle`, seleccionar/crear `Customer` según ownership y crear nueva orden; impedir segunda orden activa |
| 4 | Cliente tiene varios vehículos | Un cliente puede tener N vehículos | Selector por patente/VIN; unique por taller; no mezclar órdenes ni códigos |
| 5 | Históricas + nueva activa | Solo una activa por vehículo | Índice parcial; historial queda visible solo a `ADMIN`; el tracking nuevo apunta solo a la OT activa |
| 6 | Corregir kilometraje | El pasado no se sobrescribe | Guardar original/corregido, exigir motivo, usar optimistic locking, crear evento y `AuditLog`; valor menor requiere confirmación explícita |
| 7 | Reasignar bahía | Una OT no ocupa dos bahías | Transacción: cerrar asignación anterior, crear nueva, actualizar proyecciones y evento `BAHIA_REASIGNADA` |
| 8 | Reducir bahías ocupadas | No desalojar ni borrar ocupación automáticamente | Deshabilitar ordinales excedentes, marcar retiro pendiente, bloquear nuevas asignaciones y listar reubicaciones |
| 9 | Cancelar OT | Cancelar es terminal y exige motivo | Transacción: validar estado, marcar `CANCELADA`, revocar tracking, liberar bahía, preservar horas, marcar partes para devolución/ajuste y registrar disposición financiera |
| 10 | Falla adicional tras diagnóstico | Trabajo cobrable adicional requiere aprobación | Crear nuevos ítems `isAdditional`, nueva versión de presupuesto, bloquear ejecución cobrable hasta decisión; evento público sin nota interna |
| 11 | Nuevo repuesto durante reparación | Pieza pendiente bloquea la tarea dependiente | Crear `PartItem(PENDIENTE)`, marcar bloqueador, emitir revisión de presupuesto si cambia total; al conseguirlo recalcular bloqueo en transacción |
| 12 | Cambiar precio de MO presupuestada | Snapshot aprobado no se muta | Si borrador, nueva versión; si publicado/aprobado, nueva versión y nueva aprobación cuando cambie total; conservar versión anterior |
| 13 | Eliminar repuesto conseguido | No hard delete; lo conseguido debe conciliarse | Marcar `CANCELADO` o `DEVOLUCION_PENDIENTE`; movimiento de stock/devolución y motivo; si instalado, ajuste comercial explícito |
| 14 | Reparación sin bahía | Bahía no es precondición universal | Permitir `EN_REPARACIÓN → CONTROL` con `bayId` nulo y evento `SERVICIO_SIN_BAHÍA`; no inventar una ocupación |
| 15 | Entrega física | Solo `LISTO` puede entregarse | Exigir checklist/conformidad, receptor, actor y versión; crear `DeliveryRecord`, liberar bahía, revocar código y pasar a `ENTREGADO` |
| 16 | Consultar entregada/cancelada | El tracking público se cierra al terminal | Responder genérico `TRACKING_ACCESS_DENIED`, sin timeline; `ADMIN` conserva consulta interna |
| 17 | Brute force | Código corto requiere defensa en profundidad | Rate limit distribuido, backoff, hashes, respuesta uniforme, no-store, alertas de anomalía y ampliación de formato si no hay infraestructura confiable |

### Cancelación y consecuencias económicas

La cancelación no elimina mano de obra imputada. Se conservan tiempos reales y costos para análisis interno. Los repuestos `CONSEGUIDO` pasan a `DEVOLUCION_PENDIENTE` salvo que el administrador documente consumo, devolución imposible o entrega al cliente. Como no existe módulo de cobro, el sistema congela el total y registra una nota de disposición; no simula un pago ni un reintegro.

## 24. Arquitectura de UX/UI (Cliente móvil vs. Admin Dashboard)

### Sistema visual

- Tema oscuro de alto contraste: fondo `#090d16`, superficies `#111827` y `#1f2937`, texto principal `#f9fafb`.
- Azul para acción primaria, ámbar para pendiente/bloqueo, verde para listo/aprobado, rojo para cancelación/error.
- Contraste de texto mínimo 4.5:1 y no depender solo del color: usar icono, texto y estado.
- Touch targets mínimos de `48×48px`; espaciado suficiente para dedos enguantados.
- Foco visible por teclado, labels explícitos, `aria-describedby` para errores y orden de tabulación lógico.

### Cliente móvil

- Una acción principal por pantalla.
- Teclado numérico para teléfono, patente, kilometraje y precios.
- Estado como encabezado visible y progreso por etapas.
- Bloqueos traducidos: “Estamos esperando un repuesto” en lugar de enum técnico.
- Código grande, copiar/imprimir, aviso de no compartir y confirmación visual al consultar.
- No mostrar notas internas, costos de adquisición o IDs.

### Admin Dashboard

- Navegación: Resumen, Órdenes, Recepción, Bahías, Clientes/Vehículos, Repuestos, Auditoría.
- Vista tablero de bahías con `LIBRE`, `OCUPADA` y retiro pendiente.
- Orden dividida en: identidad/check-in, estado, trabajos, repuestos, presupuesto, historial, control y entrega.
- Confirmaciones para cancelar, corregir odómetro, cambiar precios y entregar.
- Autosave solo para borradores no críticos; comandos de estado son explícitos y versionados.
- Skeletons y Suspense para métricas; la interacción crítica no espera datos analíticos pesados.

## 25. Arquitectura de aplicación (Next.js App Router, Capas de Servicio)

### Capas

```text
App Router / RSC / Client leaves
          ↓
Server Actions y Route Handlers
          ↓
Casos de uso + DTOs Zod + autorización
          ↓
Dominio puro: estados, totales, invariantes, Result
          ↓
Repositorios Prisma / PostgreSQL / almacenamiento privado
```

- **Presentación:** Server Components por defecto; Client Components solo para cámara, diagrama, formularios interactivos y estado local.
- **Aplicación:** casos de uso nombrados (`createIntake`, `transitionOrder`, `assignBay`, `publishBudget`, `lookupPublicOrder`), entrada `unknown`, salida `Result` o envelope API.
- **Dominio:** funciones puras para transición, cálculo y priorización de bloqueadores; sin Prisma ni APIs web.
- **Infraestructura:** repositorios con `select/include` explícito, transacciones Prisma, Better Auth, storage y limitador.

### Reglas técnicas

- No consultar Prisma dentro de `map/forEach`; evitar N+1.
- Operaciones multi-entidad en `$transaction`.
- `strict`, `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess`.
- Condiciones esperadas usan `Result`; excepciones quedan para fallos inesperados y se registran con contexto seguro.
- Tras mutación, revalidar paths/tags desde servidor; no depender de `router.refresh()` como mecanismo de consistencia.
- Cada módulo expone su API pública: `customers`, `vehicles`, `work-orders`, `bays`, `budgets`, `inventory`, `tracking`.

### Módulo de seguimiento público

Debe ser una frontera separada de las rutas administrativas. Solo invoca un repositorio de proyección que selecciona campos permitidos; no reutiliza un `findUnique` administrativo que pueda filtrar notas o costos internos.

## 26. Arquitectura de información y rutas

### Rutas de página

| Ruta | Acceso | Propósito |
|---|---|---|
| `/` | Público | Entrada tripartita |
| `/cliente/alta` | Público | Alta de persona, vehículo y orden |
| `/seguimiento` | Público | Formulario teléfono + código |
| `/seguimiento/resultado` | Público no cacheado | Estado público de una orden válida |
| `/admin/login` | Público | Login Better Auth |
| `/admin` | `ADMIN` | Dashboard |
| `/admin/ordenes` | `ADMIN` | Lista filtrable |
| `/admin/ordenes/[id]` | `ADMIN` | Detalle y operaciones |
| `/admin/recepcion` | `ADMIN` | Check-in rápido |
| `/admin/bahias` | `ADMIN` | Capacidad y asignaciones |
| `/admin/clientes` | `ADMIN` | Clientes y vehículos |
| `/admin/repuestos` | `ADMIN` | Stock local |
| `/admin/auditoria` | `ADMIN` | Timeline técnico |

### Rutas API `/api/v1`

Separar claramente `/public/tracking` de recursos administrativos autenticados. Los recursos no reciben `workshopId` como parámetro de confianza; si se acepta para filtros internos, se ignora el valor no autorizado.

## 27. Contratos de API (Especificaciones de endpoints, DTOs de entrada y salida)

Todas las respuestas siguen envelope uniforme:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "..." }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "La operación no puede ejecutarse en el estado actual.",
    "details": {}
  },
  "meta": { "requestId": "..." }
}
```

### Contratos

| Método y ruta | Auth | Entrada | Salida / efectos |
|---|---|---|---|
| `POST /api/v1/public/intakes` | Público rate-limited | `createCustomerAndVehicleInput` | `201` con orden resumida y tracking code una única vez; `Idempotency-Key` obligatorio |
| `POST /api/v1/public/tracking/lookup` | Público rate-limited | `publicTrackingLookupInput` | `200` proyección pública; cualquier fallo de credencial retorna error genérico |
| `POST /api/v1/public/budget-decisions` | Público + código | `budgetDecisionInput` | `200` decisión; nueva aprobación cambia el bloqueo en transacción |
| `GET /api/v1/work-orders` | `ADMIN` | filtros/paginación | lista paginada con campos explícitos |
| `POST /api/v1/work-orders` | `ADMIN` | check-in ya validado | `201` orden + historial inicial |
| `GET /api/v1/work-orders/:id` | `ADMIN` | ID + tenant de sesión | detalle interno completo permitido |
| `POST /api/v1/work-orders/:id/transitions` | `ADMIN` | `transitionOrderInput` | cambia estado, timestamps, bloqueadores y evento |
| `POST /api/v1/work-orders/:id/odometer-corrections` | `ADMIN` | `odometerCorrectionInput` | corrección versionada + auditoría |
| `POST /api/v1/work-orders/:id/bay-assignment` | `ADMIN` | `assignBayInput` | asignación/reasignación/liberación |
| `POST /api/v1/work-orders/:id/work-items` | `ADMIN` | `workItemInput` | trabajo operativo; puede abrir revisión |
| `POST /api/v1/work-orders/:id/part-items` | `ADMIN` | `partItemInput` | repuesto operativo; recalcula bloqueador |
| `POST /api/v1/work-orders/:id/budgets` | `ADMIN` | líneas actuales | crea snapshot; no acepta totales confiados |
| `POST /api/v1/work-orders/:id/delivery` | `ADMIN` | `deliveryInput` | `ENTREGADO`, revoca código y libera bahía |
| `POST /api/v1/work-orders/:id/tracking-code/regenerate` | `ADMIN` | motivo | revoca y genera código nuevo, sin devolver el anterior |
| `GET /api/v1/bays` | `ADMIN` | ninguno | bahías y asignaciones del tenant |
| `POST /api/v1/bays/capacity` | `ADMIN` | capacidad objetivo positiva | habilita/deshabilita sin borrar ocupaciones |

### Códigos HTTP

- `200`: lectura o mutación exitosa.
- `201`: recurso creado.
- `400`: payload inválido.
- `401`: sesión/token ausente o inválido.
- `403`: rol o tenant no autorizado.
- `404`: recurso no encontrado dentro del tenant; no se confirma existencia global.
- `409`: unicidad, idempotency conflict o versión optimista.
- `422`: regla de dominio/estado no cumplida.
- `429`: rate limit, con `Retry-After` sin revelar datos.
- `500`: fallo inesperado con `requestId`, sin stack trace ni detalles de DB.

## 28. Diccionario y transiciones de estados

### Diccionario

| Término | Definición |
|---|---|
| OT / `WorkOrder` | Orden que agrupa un ingreso y sus trabajos |
| Check-in | Evidencia del estado del vehículo al recibirlo |
| Trabajo / `WorkItem` | Servicio de mano de obra separado de piezas |
| Repuesto / `PartItem` | Insumo asociado a la orden |
| Presupuesto | Snapshot comercial versionado |
| Bloqueador | Condición que impide avanzar o continuar una actividad |
| Tracking code | Secreto público revocable combinado con teléfono |
| Bahía | Puesto físico de trabajo |
| Control | Inspección de calidad previa al retiro |
| Entrega | Acto físico de devolver vehículo y llaves |

### Matriz de transición

| Desde | Hacia | Permitido | Precondición |
|---|---|:---:|---|
| `INGRESADO` | `DIAGNÓSTICO` | Sí | check-in mínimo |
| `INGRESADO` | `CANCELADA` | Sí | motivo |
| `DIAGNÓSTICO` | `ESPERANDO_REPARACIÓN` | Sí | diagnóstico y presupuesto |
| `DIAGNÓSTICO` | `CANCELADA` | Sí | motivo |
| `ESPERANDO_REPARACIÓN` | `EN_REPARACIÓN` | Sí | aprobación/condiciones sin bloqueador impeditivo |
| `ESPERANDO_REPARACIÓN` | `CANCELADA` | Sí | motivo |
| `EN_REPARACIÓN` | `CONTROL` | Sí | trabajos conciliados |
| `EN_REPARACIÓN` | `CANCELADA` | Sí | motivo; reversión física documentada |
| `CONTROL` | `LISTO` | Sí | control aprobado |
| `CONTROL` | `EN_REPARACIÓN` | Sí, corrección | observación documentada |
| `CONTROL` | `CANCELADA` | Sí | motivo |
| `LISTO` | `ENTREGADO` | Sí | entrega física |
| `LISTO` | `CANCELADA` | Sí, excepcional | motivo y autorización |
| `ENTREGADO` | cualquiera | No | nueva OT |
| `CANCELADA` | cualquiera | No | nueva OT |

## 29. Auditoría y trazabilidad

### Qué se registra

- Actor y tipo de actor.
- Tenant, orden y entidad afectada.
- Fecha UTC y `requestId`.
- Antes/después de campos relevantes, con secretos y PII redactados.
- Motivo obligatorio para cancelación, corrección, reprecio, reasignación sensible y regeneración.
- Resultado de aprobación/rechazo.
- IP y user-agent solo seudonimizados según retención.

### Inmutabilidad

La aplicación no ofrece update/delete para `StatusHistory`, `AuditLog`, `BudgetApproval` ni `InventoryMovement`. Una corrección agrega un evento compensatorio. El acceso de auditoría es interno y paginado; los registros se retienen según política legal/operativa sin bloquear el funcionamiento del MVP.

### Legibilidad pública

Cada evento que aparezca al cliente tiene una plantilla controlada por código, por ejemplo:

- “El vehículo ingresó al taller.”
- “El diagnóstico fue completado.”
- “Estamos esperando un repuesto para continuar.”
- “La reparación comenzó.”
- “El vehículo pasó el control de calidad.”

No se interpolan notas libres sin sanitización ni se publican nombres de empleados por defecto.

## 30. Requisitos no funcionales (Latencia, Concurrencia, Confiabilidad)

### Rendimiento objetivo del MVP

- Alta de cliente/vehículo/OT: p95 ≤ 750 ms sin carga de fotografías.
- Lookup público: p95 ≤ 500 ms bajo carga nominal, incluyendo validación de rate limit.
- Mutaciones administrativas simples: p95 ≤ 750 ms.
- Primer contenido del dashboard: ≤ 1.5 s en red móvil razonable; métricas pesadas en streaming.
- Check-in repetido desde tablet: ≤ 90 s de interacción humana.

Estos objetivos aplican hasta aproximadamente 100 usuarios internos concurrentes y 10 consultas públicas por segundo por instancia. Superar ese umbral exige benchmark y revisión de arquitectura.

### Concurrencia

- Optimistic locking para órdenes y trabajos.
- Serialización de bahías y stock.
- Idempotencia en creación, transición, entrega y decisiones públicas.
- Test de dos tablets modificando la misma orden y de dos usuarios asignando la misma bahía.

### Confiabilidad y recuperación

- Disponibilidad objetivo MVP: 99.5% mensual para rutas administrativas y públicas.
- RPO objetivo: 15 minutos; RTO objetivo: 1 hora, sujeto al proveedor PostgreSQL/Neon.
- Migraciones expand-and-contract, backward compatible.
- Logs estructurados con `requestId`, métricas de errores 4xx/5xx, latencia, rate limits y conflictos de concurrencia.
- No registrar secretos, códigos, credenciales ni URL firmadas.

### Accesibilidad

WCAG 2.1 AA como mínimo: contraste, foco, teclado, labels, errores anunciables, target táctil y alternativa textual al diagrama visual.

### Límites conocidos

El sistema no escala automáticamente a múltiples depósitos, proveedores externos, facturación electrónica ni workflows de flota corporativa. Esas extensiones requieren nuevos bounded contexts y ADR, no campos improvisados en `WorkOrder`.

## 31. Plan de implementación para Antigravity y subagentes

### Secuencia de gates

```text
G0 Requirements
  ↓
G1 Domain
  ↓
G2 Architecture
  ↓
G3 Data
  ↓
G4 Security
  ↓
G5 Implementation
  ↓
G6 Verification
  ↓
G7 Independent Review
  ↓
G8 Release
```

### Entregables por gate

| Gate | Responsable principal | Entregable verificable | Criterio de salida |
|---|---|---|---|
| G0 | `product-requirements` | historias, alcance, criterios de aceptación y esta baseline | no quedan términos ambiguos del flujo |
| G1 | `domain-architect` | estados, invariantes, transiciones, reglas de casos límite | matriz de estados y reglas aprobadas |
| G2 | `software-architect` | módulos, límites, ADR de Better Auth/portal/eventos | dependencias apuntan hacia dominio |
| G3 | `database-prisma` | `schema.prisma`, migración expand-contract, índices parciales, seeds | `prisma validate/format` y constraints probados |
| G4 | `auth-policy` + `security-review` | RBAC, tenant isolation, HMAC, rate limit, redacción | pruebas IDOR/brute force sin fuga |
| G5 | builders backend/frontend/ui | casos de uso, rutas, dashboard, portal, check-in | contratos Zod y Result en todos los bordes |
| G6 | `qa-test` + accessibility + observability | unit/integration/E2E, auditoría WCAG, métricas/logs | suite crítica verde y hallazgos corregidos |
| G7 | code/security/performance review | revisión independiente, carga y diff completo | ningún builder aprueba su propio trabajo |
| G8 | devops + release-manager | build, migración ensayada, rollback, changelog | smoke test producción y aprobación explícita |

### Orden recomendado de construcción

1. Contratos de dominio: enums, Result, normalizadores, máquina de estados y calculadora de totales.
2. Prisma y migraciones con datos de prueba; validar unicidad parcial y concurrencia.
3. Better Auth, `AdminUser`, middleware de sesión y guardas de tenant.
4. Casos de uso de clientes, vehículos, check-in y generación/revocación de código.
5. Órdenes, estados, historial y auditoría.
6. Trabajo, repuestos, presupuesto versionado y bloqueadores.
7. Bahías y asignaciones transaccionales.
8. Portal público de seguimiento y aprobación, aislado por proyección.
9. Dashboard administrativo, check-in táctil, diagrama de daños y control/entrega.
10. Observabilidad, pruebas de carga, accesibilidad, revisión adversaria y release.

### Suite mínima de aceptación

- Unit: 100% de transiciones, cálculo MO/repuestos, normalización, priorización de bloqueadores y validaciones públicas.
- Integration: creación idempotente, tenant isolation, aprobación/reprecio, stock, bahía, cancelación y entrega dentro de transacciones.
- E2E: alta → diagnóstico → presupuesto → aprobación → reparación → repuesto pendiente/conseguido → control → listo → entrega.
- Security: enumeración, IDOR, replay, rate limit, código revocado y acceso a orden terminal.
- Accessibility: teclado, lector de pantalla en formularios, foco, contraste y targets táctiles.
- Performance: lookup público, tablero de bahías, dos ediciones concurrentes y queries sin N+1.

### Definición de terminado

Una funcionalidad solo se considera terminada cuando:

- tiene criterio de aceptación y caso de uso documentado;
- valida input con Zod y ownership en servidor;
- registra auditoría/evento cuando corresponde;
- posee pruebas unitarias e integración proporcionales al riesgo;
- pasa `git diff --check`, lint, typecheck, tests y build;
- fue revisada por seguridad y code review independientes;
- no introduce integraciones fuera del alcance ni secretos en el repositorio.

### Deuda técnica explícita

El tracking code corto, el rate limiting persistido en proveedor externo y el almacenamiento de imágenes requieren decisiones de infraestructura antes de producción. Si no se dispone de limitador distribuido, almacenamiento privado y backups verificables, el MVP puede ejecutarse localmente o en staging, pero no debe declararse listo para exposición pública.
