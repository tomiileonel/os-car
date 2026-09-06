import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { NotFoundException, ValidationException } from "@/shared/errors";

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_EVEN });

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Límite máximo de profundidad de inspección de causas de error para prevenir
 * desbordamientos de pila (RangeError: Maximum call stack size exceeded).
 * Política Fail-Closed: si una cadena de causas supera los 16 niveles de profundidad,
 * isRetryableConcurrencyError retorna `false`, re-lanzando el error inmediatamente
 * sin reintentar a ciegas.
 */
const MAX_CAUSE_DEPTH = 16;

function hasNonRetryableCode(error: unknown, visited: Set<unknown>, depth = 0): boolean {
  if (!error || typeof error !== "object" || visited.has(error) || depth >= MAX_CAUSE_DEPTH) {
    return false;
  }
  visited.add(error);

  const err = error as {
    code?: unknown;
    meta?: Record<string, unknown>;
    cause?: unknown;
  };

  const code = typeof err.code === "string" ? err.code : undefined;
  if (code === "P2002" || code === "P2025" || code === "P2003") {
    return true;
  }

  const metaCode = String(err.meta?.code ?? err.meta?.database_error_code ?? "");
  if (metaCode === "P2002" || metaCode === "P2025" || metaCode === "P2003") {
    return true;
  }

  if (err.cause && typeof err.cause === "object") {
    return hasNonRetryableCode(err.cause, visited, depth + 1);
  }

  return false;
}

/**
 * Predicado de captura multi-capa para conflictos de serialización y deadlocks (F-03 / F-04 / F-05).
 * Inspecciona códigos de Prisma (P2034), SQLSTATE nativos de PostgreSQL (40001, 40P01)
 * a nivel de raíz, meta y recorrido recursivo acíclico en error.cause (@prisma/adapter-pg),
 * acotado contra pilas profundas mediante MAX_CAUSE_DEPTH.
 */
export function isRetryableConcurrencyError(
  error: unknown,
  visited = new Set<unknown>(),
  depth = 0
): boolean {
  if (!error || typeof error !== "object" || visited.has(error) || depth >= MAX_CAUSE_DEPTH) {
    return false;
  }

  // 1. Fail-fast global: si en la raíz o en cualquier causa anidada existe un error fatal (P2002, P2025, P2003),
  // no reintentar bajo ninguna circunstancia
  if (hasNonRetryableCode(error, new Set<unknown>(), depth)) {
    return false;
  }

  visited.add(error);

  const err = error as {
    code?: unknown;
    message?: unknown;
    meta?: Record<string, unknown>;
    cause?: unknown;
  };

  const code = typeof err.code === "string" ? err.code : undefined;

  // 2. Detección estándar de Prisma Client Known Request Error
  if (code === "P2034") {
    return true;
  }

  // 3. Detección en meta (Prisma Driver Adapter / Raw Query meta wrapper)
  const metaCode = String(err.meta?.code ?? err.meta?.database_error_code ?? "");
  if (metaCode === "40001" || metaCode === "40P01") {
    return true;
  }

  // 4. Detección directa de PostgreSQL SQLSTATE en la raíz
  if (code === "40001" || code === "40P01") {
    return true;
  }

  // 5. Análisis semántico de mensajes nativos del motor PostgreSQL
  const message = typeof err.message === "string" ? err.message : "";
  if (
    /could not serialize access/i.test(message) ||
    /deadlock detected/i.test(message) ||
    /serialization_failure/i.test(message) ||
    /write conflict/i.test(message) ||
    /canceling statement due to lock timeout/i.test(message)
  ) {
    return true;
  }

  // 6. Recorrido recursivo acíclico de error.cause (DatabaseError emitido por 'pg' / '@prisma/adapter-pg')
  if (err.cause && typeof err.cause === "object") {
    return isRetryableConcurrencyError(err.cause, visited, depth + 1);
  }

  return false;
}

function sanitizeBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
    return fallback;
  }
  const intVal = Math.floor(value);
  return Math.min(max, Math.max(min, intVal));
}

/**
 * Ejecutor con Exponential Backoff y Full Jitter exacto (recomendación PostgreSQL/AWS) (F-05).
 * Formula canónica: sleep = Math.floor(Math.random() * exponentialCap)
 * Garantiza: 0 <= sleep < exponentialCap <= maxDelayMs
 * Sanitiza opciones contra NaN, Infinity y valores desbordantes.
 */
export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = sanitizeBoundedInt(options?.maxAttempts, 3, 1, 20);
  const baseDelayMs = sanitizeBoundedInt(options?.baseDelayMs, 25, 1, 10_000);
  const maxDelayMs = sanitizeBoundedInt(options?.maxDelayMs, 500, baseDelayMs, 60_000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableConcurrencyError(error) || attempt === maxAttempts) {
        throw error;
      }
      // Exact Full Jitter Backoff
      const exponentialCap = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const sleepDuration = Math.floor(Math.random() * exponentialCap);
      await new Promise((resolve) => setTimeout(resolve, sleepDuration));
    }
  }
  throw new Error("UNREACHABLE_RETRY_STATE");
}

export type MoneyInput = string | Decimal;

export interface OrderTotals {
  laborSubtotal: string;
  partsSubtotal: string;
  totalEstimated: string;
}

export interface LaborLineInput {
  estimatedMinutes: number;
  hourlyRateCharged: MoneyInput;
}

export interface PartLineInput {
  quantity: number;
  unitPriceCharged: MoneyInput;
}

export interface WorkItemLineRow {
  status: string;
  estimatedMinutes: number;
  hourlyRateCharged: MoneyInput;
}

export interface PartItemLineRow {
  status: string;
  quantity: number;
  unitPriceCharged: MoneyInput;
}

export interface OrderItemsSnapshot {
  workItems: ReadonlyArray<WorkItemLineRow>;
  partItems: ReadonlyArray<PartItemLineRow>;
}

export interface TotalsRecalculationTx {
  workOrder: {
    findFirst(args: {
      where: { id: string; workshopId: string; deletedAt: null };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    update(args: {
      where: { id: string };
      data: { laborSubtotal: string; partsSubtotal: string; totalEstimated: string };
    }): Promise<{ id: string }>;
  };
  workItem: {
    findMany(args: {
      where: { workOrderId: string };
      select: { status: true; estimatedMinutes: true; hourlyRateCharged: true };
    }): Promise<Array<{ status: string; estimatedMinutes: number; hourlyRateCharged: MoneyInput }>>;
  };
  partItem: {
    findMany(args: {
      where: { workOrderId: string };
      select: { status: true; quantity: true; unitPriceCharged: true };
    }): Promise<Array<{ status: string; quantity: number; unitPriceCharged: MoneyInput }>>;
  };
}

export interface OrderTotalsPrismaClient {
  $transaction<T>(
    fn: (tx: TotalsRecalculationTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T>;
}

const EXCLUDED_LINE_STATUSES: ReadonlySet<string> = new Set(["CANCELADO"]);

export function money(value: MoneyInput): Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new ValidationException("MONEY_INVALID", `Valor monetario inválido: ${String(value)}.`, {
      value: String(value),
    });
  }
}

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export function toMoneyString(value: Decimal): string {
  return roundMoney(value).toFixed(2);
}

export function calculateLaborLineTotal(input: LaborLineInput): Decimal {
  if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes <= 0) {
    throw new ValidationException(
      "INVALID_ESTIMATED_MINUTES",
      "Los minutos estimados deben ser un entero positivo.",
      { estimatedMinutes: input.estimatedMinutes }
    );
  }
  const rate = money(input.hourlyRateCharged);
  if (rate.isNegative()) {
    throw new ValidationException("INVALID_HOURLY_RATE", "La tarifa horaria no puede ser negativa.", {
      hourlyRateCharged: String(input.hourlyRateCharged),
    });
  }
  return roundMoney(new Decimal(input.estimatedMinutes).dividedBy(60).mul(rate));
}

export function calculatePartLineTotal(input: PartLineInput): Decimal {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ValidationException("INVALID_PART_QUANTITY", "La cantidad debe ser un entero positivo.", {
      quantity: input.quantity,
    });
  }
  const unitPrice = money(input.unitPriceCharged);
  if (unitPrice.isNegative()) {
    throw new ValidationException("INVALID_UNIT_PRICE", "El precio unitario no puede ser negativo.", {
      unitPriceCharged: String(input.unitPriceCharged),
    });
  }
  return roundMoney(new Decimal(input.quantity).mul(unitPrice));
}

export function calculateOrderTotals(snapshot: OrderItemsSnapshot): OrderTotals {
  const laborSubtotal = snapshot.workItems
    .filter((item) => !EXCLUDED_LINE_STATUSES.has(item.status))
    .reduce(
      (accumulator, item) =>
        accumulator.plus(
          calculateLaborLineTotal({
            estimatedMinutes: item.estimatedMinutes,
            hourlyRateCharged: item.hourlyRateCharged,
          })
        ),
      new Decimal(0)
    );

  const partsSubtotal = snapshot.partItems
    .filter((item) => !EXCLUDED_LINE_STATUSES.has(item.status))
    .reduce(
      (accumulator, item) =>
        accumulator.plus(
          calculatePartLineTotal({ quantity: item.quantity, unitPriceCharged: item.unitPriceCharged })
        ),
      new Decimal(0)
    );

  return {
    laborSubtotal: toMoneyString(laborSubtotal),
    partsSubtotal: toMoneyString(partsSubtotal),
    totalEstimated: toMoneyString(laborSubtotal.plus(partsSubtotal)),
  };
}

export async function recalculateOrderTotalsInTx(
  tx: TotalsRecalculationTx,
  args: { workshopId: string; workOrderId: string }
): Promise<OrderTotals> {
  const order = await tx.workOrder.findFirst({
    where: { id: args.workOrderId, workshopId: args.workshopId, deletedAt: null },
    select: { id: true },
  });
  if (!order) {
    throw new NotFoundException("WORK_ORDER_NOT_FOUND", "La orden de trabajo no existe en el tenant.", {
      workOrderId: args.workOrderId,
    });
  }

  const [workItems, partItems] = await Promise.all([
    tx.workItem.findMany({
      where: { workOrderId: args.workOrderId },
      select: { status: true, estimatedMinutes: true, hourlyRateCharged: true },
    }),
    tx.partItem.findMany({
      where: { workOrderId: args.workOrderId },
      select: { status: true, quantity: true, unitPriceCharged: true },
    }),
  ]);

  const totals = calculateOrderTotals({ workItems, partItems });

  await tx.workOrder.update({
    where: { id: order.id },
    data: {
      laborSubtotal: totals.laborSubtotal,
      partsSubtotal: totals.partsSubtotal,
      totalEstimated: totals.totalEstimated,
    },
  });

  return totals;
}

export async function recalculateOrderTotals(
  prismaClient: OrderTotalsPrismaClient,
  args: { workshopId: string; workOrderId: string }
): Promise<OrderTotals> {
  return withSerializableRetry(() =>
    prismaClient.$transaction(
      (tx) => recalculateOrderTotalsInTx(tx, args),
      { isolationLevel: "Serializable" }
    )
  );
}
