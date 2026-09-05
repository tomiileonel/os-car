import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { NotFoundException, ValidationException } from "@/shared/errors";

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_EVEN });

export async function withSerializableRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      const pgCode = (error as { code?: string; message?: string })?.code;
      const isSerializationFailure =
        pgCode === "40001" ||
        pgCode === "40P01" ||
        Boolean((error as { message?: string })?.message?.includes("serialization_failure"));
      if (!isSerializationFailure || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw new Error("unreachable");
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
