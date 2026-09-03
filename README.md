# 🚗⚙️ OS-CAR — Automotive Workshop Operating System

<p align="center">
  <strong>Sistema Operativo Integral de Gestión y Control para Talleres Mecánicos y Flotas Vehiculares</strong>
</p>

---

## 📌 Visión del Proyecto

**OS-CAR** nace para transformar radicalmente la operación diaria de los talleres mecánicos automotrices. Frente a sistemas tradicionales complejos, lentos o burocráticos, OS-CAR combina **velocidad extrema en la captura operativa desde tablets en taller**, **transparencia financiera total en presupuestos (separación estricta de mano de obra y repuestos)** y un **equipo de ingeniería con agentes inteligentes integrados** para garantizar estabilidad, seguridad y evolución continua.

---

## ✨ Módulos y Funcionalidades Clave

| Módulo | Descripción Funcional |
|---|---|
| 📋 **Recepción Vehicular (Check-in)** | Ingreso rápido con patente/VIN, kilometraje actual, nivel de combustible, reporte de fallas y checklist visual de daños preexistentes. |
| 🔄 **Ciclo de Vida de la Orden (OT)** | Flujo de estados trazable: `Ingreso` ➔ `Diagnóstico` ➔ `Presupuestado` ➔ `Aprobado` ➔ `En Reparación` ➔ `Control de Calidad` ➔ `Listo` ➔ `Entregado` ➔ `Facturado`. |
| 💰 **Presupuestos Transparentes** | Desglose milimétrico entre **Mano de Obra** (horas/tarifa) y **Repuestos** (costo, margen y proveedor), facilitando la confianza del cliente. |
| 👨‍🔧 **Tablero de Mecánicos** | Asignación de tareas por puesto de trabajo, registro de horas dedicadas y notas técnicas internas con fotos del progreso. |
| 📦 **Control de Inventario y Repuestos** | Catálogo de repuestos, control de stock mínimo, trazabilidad de piezas utilizadas por orden y pedidos a proveedores. |
| 📱 **Portal de Cliente y Notificaciones** | Seguimiento online del estado del auto, aprobación digital de presupuestos y notificaciones automáticas por WhatsApp / Correo. |
| 📊 **Dashboard y Métricas del Taller** | KPIs de productividad, facturación neta, ticket promedio, tiempos de estancia en taller y rendimiento por mecánico. |

---

## 🛠️ Tech Stack de Referencia

- **Frontend**: [Next.js App Router](https://nextjs.org/) (React 19, Server Components y Server Actions)
- **Estilos**: [Tailwind CSS v4](https://tailwindcss.com/) — Sistema de diseño oscuro y optimizado para pantallas táctiles de taller
- **Lenguaje**: [TypeScript](https://www.typescriptlang.org/) (Tipado estricto end-to-end con `strict: true`)
- **Base de Datos & ORM**: [PostgreSQL (Neon)](https://neon.tech/) gestionado a través de [Prisma ORM](https://www.prisma.io/)
- **Validación de Datos**: [Zod](https://zod.dev/) para schemas de contratos de API y Server Actions
- **Seguridad y Autenticación**: [Auth.js / JWT](https://authjs.dev/) con control de acceso basado en roles (RBAC)
- **Testing**: [Vitest](https://vitest.dev/) y [React Testing Library](https://testing-library.com/)

---

## 🤖 Antigravity Engineering Operating System

Este repositorio cuenta con el equipo completo de **20 Agentes de Ingeniería Especializados** y sus **Quality Gates (G0 a G8)** listos para operar mediante Antigravity CLI:

```bash
# Iniciar sesión con el orquestador técnico
agy --agent fullstack-orchestrator
```

### Roles Especializados Disponibles:
- `fullstack-orchestrator`: Technical Lead / Coordinación general.
- `product-requirements`, `domain-architect`, `software-architect`: Definición y diseño arquitectónico.
- `database-prisma`, `auth-policy`, `backend-application`, `frontend-architect`, `ui-ux`, `integration-specialist`, `async-jobs-engineer`, `migration-refactoring`: Builders y especialistas de construcción.
- `qa-test`, `accessibility-specialist`, `observability-engineer`, `performance-engineer`, `security-review`, `code-review`: Auditores independientes y gates de calidad.
- `devops`, `release-manager`: Operaciones, despliegues y verificación de producción.

---

## 🚀 Inicio Rápido

### 1. Clonar e Instalar Dependencias
```bash
pnpm install
```

### 2. Configurar Variables de Entorno
Copiar el archivo de ejemplo y configurar las credenciales:
```bash
cp .env.example .env
```

### 3. Sincronizar Base de Datos
```bash
pnpm prisma generate
pnpm prisma migrate dev
```

### 4. Iniciar Servidor de Desarrollo
```bash
pnpm dev
```
Acceder a [http://localhost:3000](http://localhost:3000).

---

## 🛡️ Licencia

Distribuido bajo la Licencia MIT. Consulta `LICENSE` para más información.
