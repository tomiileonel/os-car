import { describe, it, expect } from "vitest";
import {
  validateTransition,
  isTerminalStatus,
  getAllowedTransitions,
  listReachableStates,
  type OrderStatus,
} from "../../src/server/services/order-workflow.service";
import { isErr, isOk } from "../../src/shared/result";
import { DomainConflictException } from "../../src/shared/errors";

const ALL_STATES: OrderStatus[] = [
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
  "CANCELADA",
];

describe("order-workflow.service", () => {
  describe("isTerminalStatus", () => {
    it("identifica ENTREGADO como terminal", () => {
      expect(isTerminalStatus("ENTREGADO")).toBe(true);
    });
    it("identifica CANCELADA como terminal", () => {
      expect(isTerminalStatus("CANCELADA")).toBe(true);
    });
    it("no marca los demás estados como terminales", () => {
      expect(isTerminalStatus("INGRESADO")).toBe(false);
      expect(isTerminalStatus("CONTROL")).toBe(false);
    });
  });

  describe("validateTransition — transiciones válidas", () => {
    const valid: Array<[OrderStatus, OrderStatus]> = [
      ["INGRESADO", "DIAGNOSTICO"],
      ["INGRESADO", "CANCELADA"],
      ["DIAGNOSTICO", "ESPERANDO_REPARACION"],
      ["DIAGNOSTICO", "CANCELADA"],
      ["ESPERANDO_REPARACION", "EN_REPARACION"],
      ["ESPERANDO_REPARACION", "CANCELADA"],
      ["EN_REPARACION", "CONTROL"],
      ["EN_REPARACION", "CANCELADA"],
      ["CONTROL", "LISTO"],
      ["CONTROL", "EN_REPARACION"],
      ["CONTROL", "CANCELADA"],
      ["LISTO", "ENTREGADO"],
      ["LISTO", "CANCELADA"],
    ];

    it.each(valid)("permite transición %s → %s", (from, to) => {
      const result = validateTransition(from, to);
      expect(isOk(result)).toBe(true);
    });

    it("permite transición al mismo estado (idempotencia)", () => {
      for (const s of ALL_STATES) {
        expect(isOk(validateTransition(s, s))).toBe(true);
      }
    });
  });

  describe("validateTransition — transiciones inválidas", () => {
    it("rechaza desde ENTREGADO y retorna DomainConflictException", () => {
      const result = validateTransition("ENTREGADO", "DIAGNOSTICO");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DomainConflictException);
        expect(result.error.problem.status).toBe(422);
        expect(result.error.problem.fromStatus).toBe("ENTREGADO");
        expect(result.error.problem.toStatus).toBe("DIAGNOSTICO");
        expect(result.error.problem.type).toContain("INVALID_STATE_TRANSITION");
      }
    });

    it("rechaza desde CANCELADA", () => {
      const result = validateTransition("CANCELADA", "INGRESADO");
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DomainConflictException);
      }
    });

    it("rechaza saltos ilegales (INGRESADO → CONTROL)", () => {
      const result = validateTransition("INGRESADO", "CONTROL");
      expect(isErr(result)).toBe(true);
    });

    it("rechaza LISTO → DIAGNOSTICO", () => {
      expect(isErr(validateTransition("LISTO", "DIAGNOSTICO"))).toBe(true);
    });

    it("rechaza EN_REPARACION → ESPERANDO_REPARACION", () => {
      expect(
        isErr(validateTransition("EN_REPARACION", "ESPERANDO_REPARACION"))
      ).toBe(true);
    });

    it("incluye instance con workOrderId", () => {
      const result = validateTransition("ENTREGADO", "CONTROL", "order_abc");
      if (isErr(result)) {
        expect(result.error.problem.instance).toBe(
          "/work-orders/order_abc/transitions"
        );
      }
    });
  });

  describe("matriz exhaustiva", () => {
    const allowed = new Map<OrderStatus, Set<OrderStatus>>([
      ["INGRESADO", new Set(["DIAGNOSTICO", "CANCELADA"])],
      ["DIAGNOSTICO", new Set(["ESPERANDO_REPARACION", "CANCELADA"])],
      ["ESPERANDO_REPARACION", new Set(["EN_REPARACION", "CANCELADA"])],
      ["EN_REPARACION", new Set(["CONTROL", "CANCELADA"])],
      ["CONTROL", new Set(["LISTO", "EN_REPARACION", "CANCELADA"])],
      ["LISTO", new Set(["ENTREGADO", "CANCELADA"])],
      ["ENTREGADO", new Set()],
      ["CANCELADA", new Set()],
    ]);

    it("acepta exactamente los pares de la matriz", () => {
      for (const from of ALL_STATES) {
        for (const to of ALL_STATES) {
          if (from === to) continue;
          const expected = allowed.get(from)?.has(to) ?? false;
          const result = validateTransition(from, to);
          if (expected) {
            expect(isOk(result)).toBe(true);
          } else {
            expect(isErr(result)).toBe(true);
          }
        }
      }
    });
  });

  describe("listReachableStates", () => {
    it("devuelve el conjunto correcto para CONTROL", () => {
      const states = listReachableStates("CONTROL");
      expect(states).toContain("LISTO");
      expect(states).toContain("EN_REPARACION");
      expect(states).toContain("CANCELADA");
      expect(states).not.toContain("INGRESADO");
    });

    it("devuelve vacío para ENTREGADO", () => {
      expect(listReachableStates("ENTREGADO")).toEqual([]);
    });
  });

  describe("getAllowedTransitions", () => {
    it("devuelve el Set correcto para INGRESADO", () => {
      const transitions = getAllowedTransitions("INGRESADO");
      expect(transitions.has("DIAGNOSTICO")).toBe(true);
      expect(transitions.has("CANCELADA")).toBe(true);
      expect(transitions.has("ENTREGADO")).toBe(false);
    });
  });
});

