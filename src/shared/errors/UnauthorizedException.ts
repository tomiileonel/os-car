import { ProblemDetails } from './ProblemDetails';

export class UnauthorizedException extends ProblemDetails {
  constructor(params: {
    reason?: 'token_missing' | 'token_expired' | 'token_revoked' | 'invalid_credentials';
    instance?: string;
    detail?: string;
  } = {}) {
    const messages: Record<string, string> = {
      token_missing: 'Token de autenticación no proporcionado.',
      token_expired: 'El token de autenticación ha expirado.',
      token_revoked: 'El token de autenticación ha sido revocado.',
      invalid_credentials: 'Credenciales inválidas.',
    };

    super({
      type: 'https://errors.os-car.io/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: params.detail || messages[params.reason || 'token_missing'] || 'Acceso no autorizado.',
      code: 'UNAUTHORIZED',
      instance: params.instance,
      metadata: {
        reason: params.reason,
        wwwAuthenticate: 'Bearer error="token_revoked"',
      },
    });
    this.name = 'UnauthorizedException';
  }
}
