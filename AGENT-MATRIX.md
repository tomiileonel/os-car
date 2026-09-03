# Matriz del Engineering Operating System (20 Agentes / 14 Skills)

## Estructura y Roles del Equipo

| Capa / Disciplina | Agente | Tipo | Modelo | Escritura | Shell | Quality Gate / Responsabilidad |
|---|---|---|:---:|:---:|:---:|---|
| **Orquestación** | `fullstack-orchestrator` | **MAIN AGENT** | `pro` | Sí | `auto` | Tech Lead / Coordinación global y síntesis final |
| **Análisis** | `product-requirements` | Sub-Agente | `pro` | Sí | `auto` | Requerimientos, historias de usuario, aceptación |
| **Arquitectura** | `domain-architect` | Sub-Agente | `pro` | Sí | `auto` | Modelo de dominio, entidades, invariantes |
| **Arquitectura** | `software-architect` | Sub-Agente | `pro` | Sí | `auto` | Arquitectura modular, límites, ADRs |
| **Construcción** | `database-prisma` | Sub-Agente | `pro` | Sí | `auto` | Modelado de datos, Prisma, migraciones, índices |
| **Construcción** | `auth-policy` | Sub-Agente | `pro` | Sí | `auto` | Auth.js/NextAuth, RBAC/ABAC, control de acceso |
| **Construcción** | `backend-application` | Sub-Agente | `flash` | Sí | `auto` | Casos de uso, Server Actions, DTOs, validación |
| **Construcción** | `frontend-architect` | Sub-Agente | `flash` | Sí | `auto` | Next.js App Router, límites Server/Client |
| **Construcción** | `ui-ux` | Sub-Agente | `flash` | Sí | `auto` | Sistema de diseño, Tailwind CSS v4, componentes |
| **Construcción** | `integration-specialist` | Sub-Agente | `pro` | Sí | `auto` | Stripe, Resend, S3, APIs externas, webhooks |
| **Construcción** | `async-jobs-engineer` | Sub-Agente | `pro` | Sí | `auto` | Colas, workers, cron jobs, outbox pattern |
| **Construcción** | `migration-refactoring` | Sub-Agente | `pro` | Sí | `auto` | Upgrades de dependencias, refactor legacy, migración |
| **Reviewer / Gate** | `qa-test` | Sub-Agente | `pro` | Sí | `auto` | Estrategia y suites de tests (unit, integration, e2e) |
| **Reviewer / Gate** | `accessibility-specialist` | Sub-Agente | `flash` | Sí | `auto` | Auditoría WCAG, teclado, focus, ARIA, contraste |
| **Reviewer / Gate** | `observability-engineer` | Sub-Agente | `pro` | Sí | `auto` | Logs, métricas, trazas, OpenTelemetry, alertas |
| **Reviewer / Gate** | `performance-engineer` | Sub-Agente | `pro` | No | `sandbox` | Auditoría Web Vitals, N+1, bundle size, latency |
| **Reviewer / Gate** | `security-review` | Sub-Agente | `pro` | No | `sandbox` | Auditoría adversaria y veto de seguridad |
| **Reviewer / Gate** | `code-review` | Sub-Agente | `pro` | No | `sandbox` | Revisión Staff independiente y veto de código |
| **Operaciones** | `devops` | Sub-Agente | `flash` | Sí | `auto` | CI/CD, infraestructura, Docker, despliegues |
| **Operaciones / Gate**| `release-manager` | Sub-Agente | `pro` | No | `sandbox` | Checklist de producción, changelog, veto de release |

> [!NOTE]
> `migration-refactoring` está clasificado como Builder/Specialist ya que modifica activamente el sistema. Su trabajo pasa posteriormente por los gates de revisión independiente (QA, Seguridad y Code Review).

---

## Mapeo de Skills (18 Skills Concretas)

1. `project-context`: Todos los agentes (convenciones, contextos y reglas de OS-CAR).
2. `software-architecture`: `fullstack-orchestrator`, `software-architect`, `code-review`, `migration-refactoring`.
3. `typescript-reliability`: `fullstack-orchestrator`, `software-architect`, `backend-application`, `frontend-architect`, `integration-specialist`, `code-review`.
4. `nextjs-architecture`: `backend-application`, `frontend-architect`.
5. `prisma-postgres`: `database-prisma`, `performance-engineer`.
6. `auth-security`: `auth-policy`, `security-review`.
7. `ui-system`: `frontend-architect`, `ui-ux`, `accessibility-specialist`.
8. `testing-quality`: `qa-test`.
9. `devops-cicd`: `devops`.
10. `integrations`: `integration-specialist`.
11. `async-systems`: `async-jobs-engineer`.
12. `observability`: `observability-engineer`.
13. `performance`: `performance-engineer`.
14. `release-engineering`: `fullstack-orchestrator`, `release-manager`, `devops`.
15. `creador-de-agentes`: `fullstack-orchestrator`, `devops`.
16. `automotive-workshop-domain`: `fullstack-orchestrator`, `product-requirements`, `domain-architect`, `backend-application`, `ui-ux`, `qa-test`.
17. `api-design-principles`: `backend-application`, `software-architect`, `integration-specialist`, `code-review`.
18. `database-design`: `database-prisma`, `software-architect`, `performance-engineer`.

---

## Quality Gates Formalizados (G0 a G8)

```
G0 Requirements (product-requirements)
      ↓
G1 Domain (domain-architect)
      ↓
G2 Architecture (software-architect)
      ↓
G3 Data (database-prisma)
      ↓
G4 Security (auth-policy + security-review)
      ↓
G5 Implementation (Builders: backend, frontend, ui, integrations, async, migration)
      ↓
G6 Verification (qa-test + accessibility-specialist + observability-engineer)
      ↓
G7 Independent Engineering Review (code-review + security-review + performance-engineer)
      ↓
G8 Production Release (devops + release-manager + observability-engineer)
```

### Detalle de Responsabilidades por Gate:
- **G0 (Requirements)**: Requerimientos explícitos, alcance y criterios de aceptación verificables.
- **G1 (Domain)**: Entidades, límites de contexto e invariantes de negocio modeladas.
- **G2 (Architecture)**: Diseño modular, límites de componentes y ADR registrado.
- **G3 (Data)**: Esquema normalizado, migraciones expand-and-contract y queries validadas.
- **G4 (Security)**: Barreras de confianza, autenticación y autorización server-side aprobadas.
- **G5 (Implementation)**: Construcción de software tipado, desacoplado y validado en runtime.
- **G6 (Verification)**: Cobertura de tests automatizados, accesibilidad WCAG y telemetría/logs verificados.
- **G7 (Independent Review)**: Aprobación Staff de código, análisis de seguridad adversario y benchmarks de performance sin regresiones.
- **G8 (Release)**: Aprobación final con checklist de producción, changelog, verificabilidad de observabilidad y plan de rollback probado.
