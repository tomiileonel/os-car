import { ProblemDetails } from './ProblemDetails';

export class ForbiddenException extends ProblemDetails {
  constructor(params: {
    requiredRole?: string;
    currentRole?: string;
    instance?: string;
    detail?: string;
  } = {}) {
    super({
      type: 'https://errors.os-car.io/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: params.detail || 'No tiene permisos para acceder a este recurso.',
      code: 'FORBIDDEN',
      instance: params.instance,
      metadata: {
        requiredRole: params.requiredRole,
        currentRole: params.currentRole,
      },
    });
    this.name = 'ForbiddenException';
  }
}
