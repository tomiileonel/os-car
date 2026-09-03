import { PrismaClient, Prisma, OrderBlocker, OrderStatus, BlockerType } from '@prisma/client';
import { NotFoundException, DomainConflictException } from '../../shared/errors';

export class OrderBlockerService {
  constructor(private readonly prisma: PrismaClient) {}

  public async addBlocker(
    workshopId: string,
    userId: string,
    params: {
      workOrderId: string;
      type: BlockerType;
      reason: string;
    }
  ): Promise<OrderBlocker> {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.workOrder.findFirst({
        where: { id: params.workOrderId, workshopId, deletedAt: null },
      });

      if (!order) {
        throw new NotFoundException({
          resourceId: params.workOrderId,
          resourceType: 'WorkOrder',
        });
      }

      const blocker = await tx.orderBlocker.create({
        data: {
          workshopId,
          workOrderId: params.workOrderId,
          type: params.type,
          reason: params.reason,
          isActive: true,
          blockedAt: new Date(),
          blockedByUserId: userId,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: params.workOrderId,
          actorType: 'ADMIN',
          actorAdminId: userId,
          eventType: 'BLOQUEO_ACTIVADO',
          publicVisible: true,
          publicDescription: `Orden bloqueada: ${params.type}`,
          internalDescription: params.reason,
          metadata: { blockerId: blocker.id, type: params.type },
        },
      });

      return blocker;
    });
  }

  public async resolveBlocker(
    workshopId: string,
    blockerId: string,
    userId: string,
    resolutionNotes: string
  ): Promise<{
    blocker: OrderBlocker;
    remainingActiveBlockers: number;
  }> {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const blocker = await tx.orderBlocker.findFirst({
        where: { id: blockerId, workshopId },
      });

      if (!blocker) {
        throw new NotFoundException({
          resourceId: blockerId,
          resourceType: 'OrderBlocker',
        });
      }

      let updatedBlocker = blocker;
      if (blocker.isActive) {
        updatedBlocker = await tx.orderBlocker.update({
          where: { id: blockerId },
          data: {
            isActive: false,
            resolvedAt: new Date(),
            resolvedByUserId: userId,
            resolutionNotes,
          },
        });

        await tx.statusHistory.create({
          data: {
            workOrderId: blocker.workOrderId,
            actorType: 'ADMIN',
            actorAdminId: userId,
            eventType: 'BLOQUEO_RESUELTO',
            publicVisible: true,
            publicDescription: `Bloqueo resuelto: ${blocker.type}`,
            internalDescription: resolutionNotes,
            metadata: { blockerId: blocker.id },
          },
        });
      }

      const remainingActiveBlockers = await tx.orderBlocker.count({
        where: {
          workOrderId: blocker.workOrderId,
          isActive: true,
        },
      });

      return { blocker: updatedBlocker, remainingActiveBlockers };
    });
  }

  public static async assertNoActiveBlockers(
    tx: Prisma.TransactionClient,
    workOrderId: string,
    targetStatus: OrderStatus
  ): Promise<void> {
    const statusesRequiringClearance: OrderStatus[] = [
      'ESPERANDO_REPARACION',
      'EN_REPARACION',
      'CONTROL',
      'LISTO',
      'ENTREGADO',
    ];

    if (!statusesRequiringClearance.includes(targetStatus)) {
      return;
    }

    const activeBlockers = await tx.orderBlocker.findMany({
      where: {
        workOrderId,
        isActive: true,
      },
      select: { id: true, type: true, reason: true },
    });

    if (activeBlockers.length > 0) {
      const summary = activeBlockers.map((b) => `[${b.type}: ${b.reason}]`).join(', ');
      throw new DomainConflictException({
        resourceId: workOrderId,
        expectedVersion: 0,
        currentVersion: activeBlockers.length,
        resourceType: `WorkOrder (Posee ${activeBlockers.length} bloqueadores activos: ${summary})`,
      });
    }
  }
}
