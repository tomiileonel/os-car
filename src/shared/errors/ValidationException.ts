import { ProblemDetails } from './ProblemDetails';
import { ZodError } from 'zod';

export class ValidationException extends ProblemDetails {
  constructor(params: {
    errors: Record<string, string[]>;
    instance?: string;
    detail?: string;
  }) {
    super({
      type: 'https://errors.os-car.io/validation',
      title: 'Validation Error',
      status: 422,
      detail: params.detail || 'Los datos proporcionados no cumplen con las reglas de validación.',
      code: 'VALIDATION_ERROR',
      instance: params.instance,
      errors: params.errors,
    });
    this.name = 'ValidationException';
  }

  static fromZodError(error: ZodError, instance?: string): ValidationException {
    const errors: Record<string, string[]> = {};
    const issues = error.issues || (error as unknown as { errors: typeof error.issues }).errors || [];

    issues.forEach((err) => {
      const path = err.path.join('.') || 'root';
      if (!errors[path]) {
        errors[path] = [];
      }
      errors[path].push(err.message);
    });

    return new ValidationException({
      errors,
      instance,
    });
  }
}
