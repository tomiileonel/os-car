---
name: release-engineering
description: Preparación de releases a producción, semver, planes de rollback y governance de despliegue para OS-CAR.
---

# Release Engineering Skill — OS-CAR

Esta skill define los requisitos obligatorios de verificación y aprobación previa a cualquier despliegue a producción de OS-CAR.

## 1. Principio Fundamental de Release
Un cambio no está listo para producción simplemente porque compila sin errores. Está listo cuando:
- Los requerimientos y criterios de aceptación se han verificado con tests automatizados.
- Todos los riesgos han sido identificados y cuentan con un plan de mitigación.
- El sistema cuenta con telemetría para monitorear el impacto post-despliegue.
- La migración de datos es retrocompatible y existe un procedimiento de rollback documentado y testeado.

## 2. Checklist de Despliegue (Quality Gate G8)
Antes de autorizar la salida a producción, `release-manager` debe constatar:

| Verificación | Herramienta / Comando | Responsable |
|---|---|---|
| 🔍 Inspección de Diff | `git diff --check` | `code-review` |
| 🧹 Lint y Formateo | `pnpm lint` | `devops` |
| 🛡️ Comprobación de Tipos | `pnpm exec tsc --noEmit` | `software-architect` |
| 🧪 Suites de Tests | `pnpm test` | `qa-test` |
| 🏗️ Compilación de Producción | `pnpm build` | `devops` |
| 🔐 Auditoría de Seguridad | Sin hallazgos CRITICAL o HIGH | `security-review` |
| 🗄️ Migraciones de BD | `prisma migrate deploy` probado en staging | `database-prisma` |
| 📊 Observabilidad | Logs estructurados y `/api/health` activos | `observability-engineer` |

## 3. Plan de Rollback para Migraciones de Base de Datos
- Las migraciones relacionales siguen el patrón Expand and Contract: primero se agregan nuevas columnas (opcionales), se despliega el código que las utiliza, y solo en un release posterior se deprecian y eliminan las antiguas.
- Todo script de migración SQL debe contar con su contraparte de reversión (`down.sql`) lista para ejecutarse si el despliegue falla.

## 4. Versionado Semántico (SemVer)
- **PATCH** (`v1.0.x`): Corrección de errores en cálculo, parches de seguridad o mejoras de UI que no alteran contratos de API.
- **MINOR** (`v1.x.0`): Nuevos módulos o funcionalidades retrocompatibles (ej. nuevo módulo de control de pañol o integración con lector de OBD-II).
- **MAJOR** (`vx.0.0`): Cambios de ruptura en la arquitectura, rediseño completo de la máquina de estados de OTs o migraciones incompatibles.
