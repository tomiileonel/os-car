---
name: nextjs-architecture
description: Patrones de Next.js App Router, Server Components, Streaming y optimizaciones para OS-CAR.
---

# Next.js Architecture Skill — OS-CAR

Esta skill define la implementación óptima de Next.js App Router para OS-CAR.

## 1. Límites Server vs Client Components
- **Server Components por Defecto**: Todas las páginas, layouts y componentes de presentación son Server Components (RSC) a menos que requieran interactividad del navegador.
- **Client Components (`"use client"`) Únicamente para**:
  - Manejo de estado local del DOM (`useState`, `useReducer`).
  - Efectos e integraciones con APIs del navegador (`useEffect`, geolocalización, canvas de firma pericial).
  - Event Listeners interactivos (`onClick`, `onChange`).
- **Composición Óptima**: Empujar los componentes Client hacia las hojas del árbol de componentes para mantener la mayor parte del código en el servidor.

## 2. Streaming y Carga Progresiva con Suspense
Los dashboards del taller deben cargar instantáneamente la estructura principal y cargar métricas pesadas de forma asíncrona mediante Suspense y Skeletons:

```tsx
// src/app/(workshop)/dashboard/page.tsx
import { Suspense } from "react";
import { OrderMetricsCards } from "@/components/workshop/OrderMetricsCards";
import { RecentOrdersTable } from "@/components/workshop/RecentOrdersTable";
import { MetricsSkeleton, TableSkeleton } from "@/components/ui/skeletons";

export default function WorkshopDashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Panel de Control del Taller</h1>
      
      <Suspense fallback={<MetricsSkeleton />}>
        <OrderMetricsCards />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <RecentOrdersTable />
      </Suspense>
    </div>
  );
}
```

## 3. Revalidación de Caché
- Tras cualquier mutación en Server Actions, revalidar las rutas afectadas mediante `revalidatePath("/workshop/orders")` o invalidar por tags `revalidateTag("workshop-inventory")`.
- No emplear `router.refresh()` en cliente cuando la Server Action pueda revalidar directamente la ruta en el servidor.
