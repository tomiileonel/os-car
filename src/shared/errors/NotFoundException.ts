import { ProblemDetails } from './ProblemDetails';

export class NotFoundException extends ProblemDetails {
  constructor(params: {
    resourceId: string;
    resourceType: string;
    instance?: string;
  }) {
    super({
      type: 'https://errors.os-car.io/not-found',
      title: 'Resource Not Found',
      status: 404,
      detail: `El recurso ${params.resourceType} con identificador [${params.resourceId}] no existe o no está accesible.`,
      code: 'RESOURCE_NOT_FOUND',
      instance: params.instance,
      metadata: {
        resourceId: params.resourceId,
        resourceType: params.resourceType,
      },
    });
    this.name = 'NotFoundException';
  }
}
