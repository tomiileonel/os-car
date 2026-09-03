---
name: performance
description: Optimización de Web Vitals, tiempos de respuesta, queries Prisma y consumo de recursos.
---

# Performance Skill — OS-CAR

Esta skill norma la optimización de rendimiento en el frontend, backend y base de datos para OS-CAR.

## 1. Core Web Vitals en Tablets de Taller
- **LCP (Largest Contentful Paint) < 1.8s**: Renderizado del esqueleto inicial y datos críticos desde Server Components antes de hidratar scripts interactivos.
- **INP (Interaction to Next Paint) < 150ms**: Feedback táctil inmediato en los botones del tablero kanban de OTs mediante transiciones optimistas de React (`useOptimistic`).
- **CLS (Cumulative Layout Shift) < 0.05**: Reservar espacios de altura fija (`min-h-[...]`) para tarjetas de vehículos y tablas de órdenes mientras cargan asíncronamente con Suspense.

## 2. Búsqueda Instantánea con Debounce
La búsqueda de vehículos por patente o repuestos por código debe implementar un debounce de 300ms en el cliente para evitar bombardear el backend mientras el operador tipea:

```typescript
// hooks/useDebounce.ts
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

## 3. Optimización de Queries en Prisma
1. **Selección Estricta (`select`)**: No recuperar columnas pesadas innecesarias (ej. fotos de inspección o notas periciales largas) en los listados generales del kanban.
2. **Paginación Basada en Cursor**: Para tablas de historial vehicular con miles de registros, preferir paginación por cursor (`take: 20`, `cursor: { id: lastId }`) sobre paginación por offset (`skip: 2000`).
3. **Índices Compuestos**: Mantener índices específicos en la base de datos para los filtros más frecuentes: `[workshopId, status]` y `[workshopId, licensePlate]`.
