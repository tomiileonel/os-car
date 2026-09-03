import { Prisma } from '@prisma/client';
import { NotFoundException } from '../../shared/errors';

export interface OrderTotalsResult {
  laborSubtotal: Prisma.Decimal;
  partsSubtotal: Prisma.Decimal;
  totalEstimated: Prisma.Decimal;
  totalFinal: Prisma.Decimal;
}

export class OrderCalculationService {
  /**
   * Recalcula y persiste atómicamente los subtotales y totales de la orden.
   * INVARIANTE GATE C2: Debe invocarse dentro del mismo prisma.$transaction que muta líneas.
   */
  public static async recalculateOrderTotals(
    tx: Prisma.TransactionClient,
    workOrderId: string
  ): Promise<OrderTotalsResult> {
    const order = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, deletedAt: true },
    });

    if (!order || order.deletedAt !== null) {
      throw new NotFoundException({
        resourceId: workOrderId,
        resourceType: 'WorkOrder',
      });
    }

    const activeWorkItems = await tx.workItem.findMany({
      where: {
        workOrderId,
        deletedAt: null,
        status: { not: 'CANCELADO' },
      },
      select: {
        estimatedMinutes: true,
        actualMinutes: true,
        hourlyRateCharged: true,
      },
    });

    let laborSubtotal = new Prisma.Decimal(0);
    for (const item of activeWorkItems) {
      const minutesToCharge = item.actualMinutes > 0 ? item.actualMinutes : item.estimatedMinutes;
      const hours = new Prisma.Decimal(minutesToCharge).dividedBy(new Prisma.Decimal(60));
      const lineCost = hours.times(item.hourlyRateCharged).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      laborSubtotal = laborSubtotal.plus(lineCost);
    }

    const activePartItems = await tx.partItem.findMany({
      where: {
        workOrderId,
        deletedAt: null,
        status: { not: 'CANCELADO' },
      },
      select: {
        quantity: true,
        unitPriceCharged: true,
      },
    });

    let partsSubtotal = new Prisma.Decimal(0);
    for (const part of activePartItems) {
      const linePrice = new Prisma.Decimal(part.quantity)
        .times(part.unitPriceCharged)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      partsSubtotal = partsSubtotal.plus(linePrice);
    }

    const totalFinal = laborSubtotal.plus(partsSubtotal);
    const totalEstimated = totalFinal;

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        laborSubtotal,
        partsSubtotal,
        totalEstimated,
        totalFinal,
        version: { increment: 1 },
      },
    });

    return {
      laborSubtotal,
      partsSubtotal,
      totalEstimated,
      totalFinal,
    };
  }
}
