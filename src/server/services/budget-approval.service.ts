import { PrismaClient, Prisma, ActorType } from '@prisma/client';
import {
  StaleBudgetVersionException,
  DomainConflictException,
  NotFoundException,
} from '../../shared/errors';

export interface ApproveBudgetInput {
  budgetId: string;
  budgetVersionId: string;
  actorType: ActorType;
  actorAdminId?: string;
  contentHash: string;
  phoneHash?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class BudgetApprovalService {
  constructor(private readonly prisma: PrismaClient) {}

  public async approveBudget(workshopId: string, input: ApproveBudgetInput) {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const budget = await tx.budget.findUnique({
        where: { id: input.budgetId },
        include: {
          workOrder: {
            select: { id: true, workshopId: true, status: true },
          },
        },
      });

      if (!budget || budget.workOrder.workshopId !== workshopId) {
        throw new NotFoundException({
          resourceId: input.budgetId,
          resourceType: 'Budget',
        });
      }

      if (!budget.currentVersionId || budget.currentVersionId !== input.budgetVersionId) {
        throw new StaleBudgetVersionException({
          workOrderId: budget.workOrderId,
          expectedVersionId: input.budgetVersionId,
          currentVersionId: budget.currentVersionId ?? 'NINGUNA_VERSION_ACTIVA',
        });
      }

      const budgetVersion = await tx.budgetVersion.findUnique({
        where: { id: input.budgetVersionId },
      });

      if (!budgetVersion) {
        throw new NotFoundException({
          resourceId: input.budgetVersionId,
          resourceType: 'BudgetVersion',
        });
      }

      if (budgetVersion.status === 'APROBADO') {
        throw new DomainConflictException({
          resourceId: input.budgetVersionId,
          expectedVersion: budgetVersion.versionNumber,
          currentVersion: budgetVersion.versionNumber,
          resourceType: 'BudgetVersion (Ya aprobada previamente)',
        });
      }

      const approval = await tx.budgetApproval.create({
        data: {
          budgetVersionId: input.budgetVersionId,
          actorType: input.actorType,
          actorAdminId: input.actorAdminId,
          decision: 'APROBADO',
          phoneHash: input.phoneHash,
          contentHash: input.contentHash,
          ipHash: input.ipAddress ? Buffer.from(input.ipAddress).toString('base64') : null,
          userAgentHash: input.userAgent ? Buffer.from(input.userAgent).toString('base64') : null,
          decidedAt: new Date(),
        },
      });

      await tx.budgetVersion.update({
        where: { id: input.budgetVersionId },
        data: {
          status: 'APROBADO',
          approvedAt: new Date(),
        },
      });

      await tx.orderBlocker.updateMany({
        where: {
          workOrderId: budget.workOrderId,
          type: 'APROBACION_PRESUPUESTO',
          isActive: true,
        },
        data: {
          isActive: false,
          resolvedAt: new Date(),
          resolvedByUserId: input.actorAdminId ?? 'CLIENT_PORTAL_AUTOMATION',
          resolutionNotes: `Presupuesto aprobado formalmente mediante versión ${input.budgetVersionId} (Hash: ${input.contentHash.substring(0, 8)}...)`,
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: budget.workOrderId,
          actorType: input.actorType,
          actorAdminId: input.actorAdminId,
          eventType: 'PRESUPUESTO_APROBADO',
          publicVisible: true,
          publicDescription: 'El presupuesto ha sido aprobado y autorizado para inicio de trabajos.',
          metadata: {
            budgetVersionId: input.budgetVersionId,
            totalEstimated: budgetVersion.totalEstimated.toString(),
          },
        },
      });

      return {
        success: true,
        approvalId: approval.id,
        budgetVersionId: input.budgetVersionId,
        approvedAt: approval.decidedAt,
      };
    });
  }
}
