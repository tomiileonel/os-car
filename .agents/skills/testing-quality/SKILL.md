---
name: testing-quality
description: Estrategia y suites de testing automatizado (unit, integration, e2e) con Vitest para OS-CAR.
---

# Testing & Quality Assurance Skill — OS-CAR

Esta skill define la estrategia de pruebas automatizadas y aseguramiento de la calidad para OS-CAR.

## 1. Pirámide de Pruebas y Cobertura
- **Pruebas Unitarias (70%)**: Lógica de cálculo de presupuestos, validaciones Zod, transiciones de estados de OTs y reglas de inventario.
- **Pruebas de Integración (20%)**: Interacciones completas de Server Actions con la base de datos (Prisma con BD de test), transacciones y deducción de stock.
- **Pruebas E2E (10%)**: Flujo crítico completo: Recepción de vehículo ➔ Creación de presupuesto ➔ Aprobación de cliente ➔ Liquidación y entrega.

## 2. Testing Unitario de Cálculo Presupuestario
El motor financiero de presupuestos debe estar cubierto al 100% por tests de invariantes:

```typescript
// tests/unit/budget-calculator.test.ts
import { describe, it, expect } from "vitest";
import { calculateBudgetTotals } from "@/domain/budget/calculator";

describe("calculateBudgetTotals", () => {
  it("calculates labor and parts subtotals independently", () => {
    const laborItems = [
      { estimatedHours: 2.5, hourlyRate: 4000 },
      { estimatedHours: 1.0, hourlyRate: 4000 },
    ];
    const partItems = [
      { quantity: 4, unitPrice: 3500 }, // Bujías
      { quantity: 1, unitPrice: 8000 }, // Filtro de aceite
    ];
    const taxRate = 0.21; // 21% IVA

    const totals = calculateBudgetTotals({ laborItems, partItems, taxRate, discount: 0 });

    expect(totals.subtotalLabor).toBe(14000); // 3.5 hrs * 4000
    expect(totals.subtotalParts).toBe(22000); // (4 * 3500) + (1 * 8000)
    expect(totals.subtotalNet).toBe(36000);
    expect(totals.taxAmount).toBe(7560);
    expect(totals.total).toBe(43560);
  });

  it("handles zero parts gracefully", () => {
    const laborItems = [{ estimatedHours: 1.0, hourlyRate: 5000 }];
    const totals = calculateBudgetTotals({ laborItems, partItems: [], taxRate: 0.21 });

    expect(totals.subtotalParts).toBe(0);
    expect(totals.subtotalLabor).toBe(5000);
    expect(totals.total).toBe(6050);
  });
});
```

## 3. Pruebas de Transición de Estados
Validar que no se permitan transiciones ilegales en la máquina de estados de la Orden de Trabajo:
- Intentar pasar de `DRAFT` directamente a `IN_PROGRESS` debe fallar con error de dominio `INVALID_STATE_TRANSITION`.
- Cancelar una orden completada debe ser rechazado.

## 4. Comandos de Validación
- Ejecutar tests: `pnpm test`
- Ejecutar con cobertura: `pnpm test --coverage`
- Ejecutar en modo watch: `pnpm test --watch`
