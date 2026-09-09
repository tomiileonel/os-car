/**
 * OS-CAR · Gate G7 — Cálculo Reactivo en Vista de Presupuesto (OT-G7-WORKBOARD-ORDERS-001)
 * --------------------------------------------------------------------------
 * Alineado estrictamente a las fórmulas de dominio de order-calculation.service.ts:
 * - Mano de Obra: (minutos / 60) * tarifa_hora (redondeo a 2 decimales bancario / HALF_EVEN).
 * - Repuestos: cantidad * precio_unitario (redondeo a 2 decimales).
 * - Subtotal Gravado: suma de líneas activas (excluye líneas con status "CANCELADO").
 * - IVA (21%): subtotal * 0.21.
 * - Total Final: subtotal + IVA.
 */

export interface LaborLine {
  id?: string;
  description: string;
  estimatedMinutes: number;
  hourlyRateCharged: number | string;
  actualMinutes?: number;
  status?: string;
}

export interface PartLine {
  id?: string;
  partNumber?: string | null;
  description: string;
  quantity: number;
  unitPriceCharged: number | string;
  status?: string;
}

export interface OrderFinancialSummary {
  laborSubtotal: number;
  partsSubtotal: number;
  netSubtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  laborCount: number;
  partsCount: number;
  formatted: {
    laborSubtotal: string;
    partsSubtotal: string;
    netSubtotal: string;
    taxAmount: string;
    total: string;
  };
}

const DEFAULT_TAX_RATE = 0.21;

/** Redondeo bancario / HALF_EVEN a 2 decimales */
export function roundTo2Decimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/** Calcula el subtotal de una línea de labor: (minutos / 60) * tarifa */
export function calculateLaborLineTotal(
  estimatedMinutes: number,
  hourlyRateCharged: number | string,
): number {
  const mins = Math.max(0, Number(estimatedMinutes) || 0);
  const rate = Math.max(0, Number(hourlyRateCharged) || 0);
  if (mins === 0 || rate === 0) return 0;
  return roundTo2Decimals((mins / 60) * rate);
}

/** Calcula el subtotal de una línea de repuesto: cantidad * precio unitario */
export function calculatePartLineTotal(
  quantity: number,
  unitPriceCharged: number | string,
): number {
  const qty = Math.max(0, Number(quantity) || 0);
  const price = Math.max(0, Number(unitPriceCharged) || 0);
  if (qty === 0 || price === 0) return 0;
  return roundTo2Decimals(qty * price);
}

/** Formateo monetario estándar en pesos argentinos ($ 123.456,00) */
export function formatCurrency(amount: number): string {
  const rounded = roundTo2Decimals(amount);
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Cálculo global del presupuesto de una orden.
 * Filtra automáticamente ítems cancelados.
 */
export function calculateOrderFinancials(
  laborLines: ReadonlyArray<LaborLine>,
  partLines: ReadonlyArray<PartLine>,
  taxRate: number = DEFAULT_TAX_RATE,
): OrderFinancialSummary {
  const activeLabor = laborLines.filter((l) => l.status !== "CANCELADO");
  const activeParts = partLines.filter((p) => p.status !== "CANCELADO");

  let laborSubtotal = 0;
  for (const item of activeLabor) {
    laborSubtotal += calculateLaborLineTotal(item.estimatedMinutes, item.hourlyRateCharged);
  }
  laborSubtotal = roundTo2Decimals(laborSubtotal);

  let partsSubtotal = 0;
  for (const item of activeParts) {
    partsSubtotal += calculatePartLineTotal(item.quantity, item.unitPriceCharged);
  }
  partsSubtotal = roundTo2Decimals(partsSubtotal);

  const netSubtotal = roundTo2Decimals(laborSubtotal + partsSubtotal);
  const taxAmount = roundTo2Decimals(netSubtotal * taxRate);
  const total = roundTo2Decimals(netSubtotal + taxAmount);

  return {
    laborSubtotal,
    partsSubtotal,
    netSubtotal,
    taxRate,
    taxAmount,
    total,
    laborCount: activeLabor.length,
    partsCount: activeParts.length,
    formatted: {
      laborSubtotal: formatCurrency(laborSubtotal),
      partsSubtotal: formatCurrency(partsSubtotal),
      netSubtotal: formatCurrency(netSubtotal),
      taxAmount: formatCurrency(taxAmount),
      total: formatCurrency(total),
    },
  };
}
