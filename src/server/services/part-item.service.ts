import { PrismaClient, Prisma, PartItem } from '@prisma/client';
import { DomainConflictException, NotFoundException } from '../../shared/errors';
import { OrderCalculationService } from './order-calculation.service';
import { PartStatus } from '../../shared/schemas/common';

export interface UpdatePartItemInput {
  expectedVersion: number;
  quantity?: number;
  unitPriceCharged?: number;
  unitCost?: number;
  description?: string;
  partNumber?: string;
  status?: PartStatus;
  requiresApproval?: boolean;
}

export class PartItemService {
  constructor(private readonly prisma: PrismaClient) {}

  public async updatePartItem(
    workshopId: string,
    partItemId: string,
    input: UpdatePartItemInput
  ): Promise<PartItem> {
    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updateResult = await tx.partItem.updateMany({
          where: {
            id: partItemId,
            workshopId,
            version: input.expectedVersion,
            deletedAt: null,
          },
          data: {
            ...(input.quantity !== undefined && { quantity: input.quantity }),
            ...(input.unitPriceCharged !== undefined && {
              unitPriceCharged: new Prisma.Decimal(input.unitPriceCharged),
            }),
            ...(input.unitCost !== undefined && {
              unitCost: new Prisma.Decimal(input.unitCost),
            }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.partNumber !== undefined && { partNumber: input.partNumber }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.requiresApproval !== undefined && {
              requiresApproval: input.requiresApproval,
            }),
            version: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          const currentRecord = await tx.partItem.findFirst({
            where: { id: partItemId, workshopId },
            select: { id: true, version: true, deletedAt: true },
          });

          if (!currentRecord || currentRecord.deletedAt !== null) {
            throw new NotFoundException({
              resourceId: partItemId,
              resourceType: 'PartItem',
            });
          }

          throw new DomainConflictException({
            resourceId: partItemId,
            expectedVersion: input.expectedVersion,
            currentVersion: currentRecord.version,
            resourceType: 'PartItem',
          });
        }

        const updatedPart = await tx.partItem.findUniqueOrThrow({
          where: { id: partItemId },
        });

        await OrderCalculationService.recalculateOrderTotals(
          tx,
          updatedPart.workOrderId
        );

        return updatedPart;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 10000,
      }
    );
  }
}
