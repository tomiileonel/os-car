import { ProblemDetails } from './ProblemDetails';

export interface ConflictMetadata {
  resourceId: string;
  expectedVersion: number;
  currentVersion: number;
  resourceType: string;
}

export class DomainConflictException extends ProblemDetails {
  constructor(params: {
    resourceId: string;
    expectedVersion: number;
    currentVersion: number;
    resourceType: string;
    instance?: string;
  }) {
    super({
      type: 'https://errors.os-car.io/conflict',
      title: 'Optimistic Lock Conflict',
      status: 409,
      detail: `Conflicto de concurrencia optimista en ${params.resourceType} [${params.resourceId}]. La versión esperada ${params.expectedVersion} no coincide con la versión actual ${params.currentVersion}.`,
      code: 'OPTIMISTIC_LOCK_CONFLICT',
      instance: params.instance,
      metadata: {
        resourceId: params.resourceId,
        expectedVersion: params.expectedVersion,
        currentVersion: params.currentVersion,
        resourceType: params.resourceType,
      },
    });
    this.name = 'DomainConflictException';
  }
}

export class StaleBudgetVersionException extends ProblemDetails {
  constructor(params: {
    workOrderId: string;
    expectedVersionId: string;
    currentVersionId: string;
    instance?: string;
  }) {
    super({
      type: 'https://errors.os-car.io/conflict',
      title: 'Stale Budget Version',
      status: 409,
      detail: `La versión del presupuesto presentada (${params.expectedVersionId}) no coincide con la versión activa (${params.currentVersionId}). El presupuesto ha sido actualizado.`,
      code: 'STALE_BUDGET_VERSION',
      instance: params.instance,
      metadata: {
        workOrderId: params.workOrderId,
        expectedVersionId: params.expectedVersionId,
        currentVersionId: params.currentVersionId,
      },
    });
    this.name = 'StaleBudgetVersionException';
  }
}
