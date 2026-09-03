import { PrismaClient, Prisma } from '@prisma/client';
import {
  ValidationException,
  ForbiddenException,
  NotFoundException,
  DomainConflictException,
} from '../../shared/errors';
import { OrderBlockerService } from './order-blocker.service';

export interface RegisterDeliveryInput {
  workOrderId: string;
  deliveredById: string;
  recipientName: string;
  recipientDocumentLast4?: string;
  keysHandedOver: boolean;
  conformityAccepted: boolean;
  odometerAtDelivery: number;
  routeTestDistanceKm?: number;
  supervisorOverride?: boolean;
  supervisorOverrideId?: string;
  supervisorNotes?: string;
  notes?: string;
}

const MAX_ROUTE_TEST_KM = 30;

export class DeliveryService {
  constructor(private readonly prisma: PrismaClient) {}

  public async registerDelivery(workshopId: string, input: RegisterDeliveryInput) {
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.workOrder.findFirst({
        where: { id: input.workOrderId, workshopId, deletedAt: null },
        include: {
          intakeRecord: true,
          deliveryRecord: true,
        },
      });

      if (!order) {
        throw new NotFoundException({
          resourceId: input.workOrderId,
          resourceType: 'WorkOrder',
        });
      }

      if (order.deliveryRecord) {
        throw new DomainConflictException({
          resourceId: order.deliveryRecord.id,
          expectedVersion: 1,
          currentVersion: 1,
          resourceType: 'DeliveryRecord (La orden ya fue entregada previamente)',
        });
      }

      await OrderBlockerService.assertNoActiveBlockers(tx, order.id, 'ENTREGADO');

      const odometerAtIntake =
        order.intakeRecord?.odometerCorrectedTo ??
        order.intakeRecord?.odometerAtIntake ??
        0;

      const deltaKm = input.odometerAtDelivery - odometerAtIntake;
      const isRegression = deltaKm < 0;
      const isExcessiveTest = (input.routeTestDistanceKm ?? 0) > MAX_ROUTE_TEST_KM;

      if (isRegression || isExcessiveTest) {
        if (!input.supervisorOverride) {
          const reason = isRegression
            ? `Regresión de odómetro detectada: Salida (${input.odometerAtDelivery} km) < Entrada (${odometerAtIntake} km). Diferencia: ${deltaKm} km.`
            : `Distancia de prueba en ruta excesiva (${input.routeTestDistanceKm} km > ${MAX_ROUTE_TEST_KM} km permitidos).`;

          throw new ValidationException({
            errors: {
              odometerAtDelivery: [reason, 'Esta operación exige anulación supervisada (supervisorOverride = true)'],
            },
          });
        }

        if (!input.supervisorOverrideId || !input.supervisorNotes || input.supervisorNotes.trim().length < 10) {
          throw new ValidationException({
            errors: {
              supervisorNotes: ['Se exige supervisorOverrideId y una justificación técnica detallada (mínimo 10 caracteres)'],
            },
          });
        }

        const supervisor = await tx.adminUser.findFirst({
          where: {
            id: input.supervisorOverrideId,
            workshopId,
            active: true,
            role: { in: ['OWNER', 'TALLER_SUPERVISOR'] },
          },
        });

        if (!supervisor) {
          throw new ForbiddenException({
            requiredRole: 'OWNER | TALLER_SUPERVISOR',
            detail: 'El usuario especificado para supervisorOverride no posee los privilegios requeridos o está inactivo.',
          });
        }

        await tx.auditLog.create({
          data: {
            workshopId,
            workOrderId: order.id,
            actorType: 'ADMIN',
            actorAdminId: input.supervisorOverrideId,
            action: 'ODOMETER_SUPERVISOR_OVERRIDE',
            entityType: 'DeliveryRecord',
            entityId: order.id,
            reason: input.supervisorNotes,
            before: { odometerAtIntake },
            after: {
              odometerAtDelivery: input.odometerAtDelivery,
              deltaKm,
              routeTestDistanceKm: input.routeTestDistanceKm,
            },
          },
        });
      }

      const deliveryRecord = await tx.deliveryRecord.create({
        data: {
          workOrderId: order.id,
          deliveredById: input.deliveredById,
          recipientName: input.recipientName,
          recipientDocumentLast4: input.recipientDocumentLast4,
          keysHandedOver: input.keysHandedOver,
          conformityAccepted: input.conformityAccepted,
          odometerAtDelivery: input.odometerAtDelivery,
          routeTestDistanceKm: input.routeTestDistanceKm ?? 0,
          supervisorOverride: input.supervisorOverride ?? false,
          supervisorOverrideId: input.supervisorOverrideId,
          supervisorNotes: input.supervisorNotes,
          notes: input.notes,
          deliveredAt: new Date(),
        },
      });

      await tx.workOrder.update({
        where: { id: order.id },
        data: {
          status: 'ENTREGADO',
          deliveredAt: deliveryRecord.deliveredAt,
          version: { increment: 1 },
        },
      });

      await tx.bayAssignment.updateMany({
        where: { workOrderId: order.id, releasedAt: null },
        data: {
          releasedAt: new Date(),
          releaseReason: 'VEHICULO_ENTREGADO_A_CLIENTE',
        },
      });

      await tx.statusHistory.create({
        data: {
          workOrderId: order.id,
          actorType: 'ADMIN',
          actorAdminId: input.deliveredById,
          eventType: 'ENTREGA_REALIZADA',
          publicVisible: true,
          publicDescription: `Vehículo entregado a ${input.recipientName}. Odómetro final: ${input.odometerAtDelivery} km.`,
          metadata: {
            deliveryRecordId: deliveryRecord.id,
            odometerAtDelivery: input.odometerAtDelivery,
          },
        },
      });

      return deliveryRecord;
    });
  }
}
