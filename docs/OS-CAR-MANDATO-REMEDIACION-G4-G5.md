# OS-CAR — MANDATO DE REMEDIACIÓN G4/G5

**Fecha:** 5 de septiembre de 2026
**Orquestador:** Antigravity
**Objetivo:** Resolver los bloqueos de arquitectura y preparar la siguiente ronda de implementación verificable.

## Orden de ejecución

### Fase 1 — Auditoría de estado

1. **Solicitar a GLM 5.3 Max:**
   - Revisar el estado actual del repositorio.
   - Confirmar BUILD-01, BUDGET-01, DATA-03 y AUTH-01.
   - Identificar cualquier diferencia entre el diagnóstico anterior y el código actual.
   - Emitir criterios de aceptación para cada corrección.

2. **Solicitar a Gemini 3.8 Flash (High):**
   - Revisar los mismos hallazgos de forma independiente.
   - Cuestionar las soluciones propuestas.
   - Detectar riesgos de regresión.
   - Emitir observaciones obligatorias antes de implementar.

> No iniciar Qwen hasta tener ambos informes.

---

### Fase 2 — Implementación

Asignar a Qwen 3.8 Max únicamente las correcciones aprobadas:

- **BUILD-01:**
  - Separar correctamente el código Edge del código Node.
  - Evitar que ioredis sea incluido en el bundle de Middleware.
  - Mantener una implementación de rate limiting compatible con el runtime real.
  - Verificar que la solución no dependa de APIs de Node en Edge.
  - Ejecutar `npm run build`.

- **BUDGET-01:**
  - Verificar que la aprobación compruebe la versión vigente del presupuesto.
  - Rechazar versiones obsoletas mediante el error de dominio correspondiente.
  - Mantener la operación atómica.
  - Agregar tests para aprobación válida, versión obsoleta y concurrencia.

- **DATA-03:**
  - Revisar el historial de migraciones antes de generar un baseline.
  - Confirmar que el DDL represente el esquema Prisma real.
  - Corregir el índice parcial inválido.
  - Verificar que los índices y restricciones sean compatibles con PostgreSQL.
  - Probar `prisma migrate deploy` sobre una base vacía.

- **AUTH-01:**
  - Implementar el guard reusable aprobado por arquitectura.
  - Verificar usuario activo, tenant y rol.
  - Asegurar que las operaciones críticas no dependan solamente de controles visuales.
  - Agregar tests de autorización.

---

### Fase 3 — Revisión independiente

1. **Solicitar a Gemini:**
   - Revisar los cambios de Qwen.
   - Ejecutar o revisar las pruebas.
   - Buscar regresiones y casos límite.
   - Emitir un informe de aprobación o rechazo.

2. **Solicitar a Claude Sonnet 5:**
   - Hacer una auditoría profunda del resultado.
   - Revisar seguridad, integridad de dominio, transacciones, concurrencia y calidad.
   - Verificar que las pruebas sean suficientes.
   - Emitir un veredicto independiente de readiness.

---

### Fase 4 — Cierre

Antigravity debe:
- Integrar únicamente cambios aprobados.
- Ejecutar los gates correspondientes.
- Registrar resultados reproducibles.
- Mantener el estado `REJECTED` hasta que se cumplan los criterios de aceptación.
- No declarar staging/producción listo por la sola existencia de un build exitoso.

---

### Entregables obligatorios

Cada agente debe entregar:
1. Archivos modificados o revisados.
2. Hallazgos y decisiones.
3. Pruebas ejecutadas.
4. Resultado de cada prueba.
5. Riesgos pendientes.
6. Veredicto.

*Ningún agente puede aprobar su propio trabajo.*

---

## Decisión Operativa Vigente

- **Precisión sobre Paso 3 (DATA-03):** La propuesta de "generar el baseline DDL real" es correcta como objetivo, pero no significa borrar o reemplazar migraciones a ciegas. Antes hay que comprobar si `0_init` es realmente el baseline histórico, si existen migraciones posteriores y si la base de datos de referencia está vacía o ya contiene datos. GLM debe aprobar primero la estrategia de migración, y Qwen recién después debe ejecutarla.
- **Autorización de inicio:** Qwen empieza con **BUILD-01** y **BUDGET-01**, con la condición explícita de:
  - No mergear.
  - No marcar G4/G5 como aprobados.
  - No avanzar a nuevas funcionalidades hasta que Gemini y Claude revisen los cambios.
  - El objetivo es pasar de `REJECTED` → `REMEDIATION IN PROGRESS`.
