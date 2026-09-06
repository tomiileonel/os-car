// src/server/services/order-workflow.service.ts
// Servicio de dominio PURO para validación de transiciones de estado.
// Retorna Result<null, DomainConflictException> con ProblemDetails RFC 7807.

import { Result } from "../../shared/result";
import { DomainConflictException } from "../../shared/errors";

export type OrderStatus =
  | "INGRESADO"
  | "DIAGNOSTICO"
  | "ESPERANDO_REPARACION"
  | "EN_REPARACION"
  | "CONTROL"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADA";

const TERMINAL_STATES: ReadonlySet<OrderStatus> = new Set([
  "ENTREGADO",
  "CANCELADA",
]);

// Matriz canónica según especificación OS-CAR sección 9 y 28.
const TRANSITION_MATRIX: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  INGRESADO: new Set(["DIAGNOSTICO", "CANCELADA"]),
  DIAGNOSTICO: new Set(["ESPERANDO_REPARACION", "CANCELADA"]),
  ESPERANDO_REPARACION: new Set(["EN_REPARACION", "CANCELADA"]),
  EN_REPARACION: new Set(["CONTROL", "CANCELADA"]),
  CONTROL: new Set(["LISTO", "EN_REPARACION", "CANCELADA"]),
  LISTO: new Set(["ENTREGADO", "CANCELADA"]),
  ENTREGADO: new Set(),
  CANCELADA: new Set(),
};

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATES.has(status);
}

export function getAllowedTransitions(
  from: OrderStatus,
): ReadonlySet<OrderStatus> {
  return TRANSITION_MATRIX[from] ?? new Set();
}

/**
 * Valida una transición de estado según la matriz canónica.
 * Devuelve Result<null, DomainConflictException>.
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  workOrderId?: string,
): Result<null, DomainConflictException> {
  if (from === to) return Result.ok(null);

  const instance = workOrderId
    ? `/work-orders/${workOrderId}/transitions`
    : undefined;

  if (isTerminalStatus(from)) {
    return Result.err(
      DomainConflictException.invalidTransition(
        from,
        to,
        `No se permiten transiciones desde el estado terminal "${from}". Para volver a operar, debe crearse una nueva orden.`,
        instance,
      ),
    );
  }

  const allowed = TRANSITION_MATRIX[from];
  if (!allowed || !allowed.has(to)) {
    return Result.err(
      DomainConflictException.invalidTransition(
        from,
        to,
        `La transición de "${from}" a "${to}" no está permitida por la matriz de estados canónica.`,
        instance,
      ),
    );
  }

  return Result.ok(null);
}

export function listReachableStates(from: OrderStatus): OrderStatus[] {
  return Array.from(getAllowedTransitions(from));
}
