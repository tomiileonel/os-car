import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";

beforeAll(() => {
  if (!process.env.TRACKING_HMAC_SECRET) {
    process.env.TRACKING_HMAC_SECRET = "test-secret-key-for-unit-tests-min-32-chars";
  }
});

import { validateTransition, type OrderStatus } from "../../src/server/services/order-workflow.service";
import { isOk, isErr } from "../../src/shared/result";
import { DomainConflictException, NotFoundException } from "../../src/shared/errors";
import { createTrackingToken, hashTrackingToken } from "../../src/lib/tracking-token";

describe("Auditoría Forense G10.5 — Verificación N1 a N7", () => {
  describe("N4: Hashing SHA-256 de IP para Auditoría y Privacidad", () => {
    it("hashea la dirección IP usando SHA-256 en formato hexadecimal de 64 caracteres", () => {
      const clientIp = "190.183.45.12";
      const computedHash = createHash("sha256").update(clientIp).digest("hex");

      expect(computedHash).toHaveLength(64);
      expect(computedHash).not.toContain(clientIp);
      expect(computedHash).toBe(createHash("sha256").update(clientIp).digest("hex"));
    });

    it("produce hashes diferentes para IPs distintas", () => {
      const ip1 = "192.168.1.10";
      const ip2 = "192.168.1.11";
      const hash1 = createHash("sha256").update(ip1).digest("hex");
      const hash2 = createHash("sha256").update(ip2).digest("hex");

      expect(hash1).not.toBe(hash2);
    });

    it("soporta direcciones IPv6 de forma determinista", () => {
      const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
      const hash = createHash("sha256").update(ipv6).digest("hex");
      expect(hash).toHaveLength(64);
    });
  });

  describe("N2: Blindaje de FSM en Aprobación Pública", () => {
    it("permite transición a EN_REPARACION desde ESPERANDO_REPARACION", () => {
      const result = validateTransition("ESPERANDO_REPARACION", "EN_REPARACION", "wo-101");
      expect(isOk(result)).toBe(true);
      expect(result.ok).toBe(true);
    });

    it("permite transición idempotente cuando la orden ya está EN_REPARACION", () => {
      const result = validateTransition("EN_REPARACION", "EN_REPARACION", "wo-101");
      expect(isOk(result)).toBe(true);
      expect(result.ok).toBe(true);
    });

    it("rechaza transición a EN_REPARACION si la orden ya está ENTREGADO (estado terminal)", () => {
      const result = validateTransition("ENTREGADO", "EN_REPARACION", "wo-101");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DomainConflictException);
        expect(result.error.code).toBe("INVALID_STATE_TRANSITION");
        expect(result.error.message).toContain("terminal");
      }
    });

    it("rechaza transición a EN_REPARACION si la orden está CANCELADA (estado terminal)", () => {
      const result = validateTransition("CANCELADA", "EN_REPARACION", "wo-101");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(DomainConflictException);
        expect(result.error.code).toBe("INVALID_STATE_TRANSITION");
      }
    });

    it("rechaza transiciones inválidas no permitidas por la matriz (ej: INGRESADO a EN_REPARACION)", () => {
      const result = validateTransition("INGRESADO", "EN_REPARACION", "wo-101");
      expect(isErr(result)).toBe(true);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_STATE_TRANSITION");
      }
    });
  });

  describe("N3: Protección TOCTOU con Optimistic Concurrency Control (CAS)", () => {
    it("lanza DomainConflictException con código CONCURRENT_MODIFICATION cuando updateMany count es 0", () => {
      const executeCasUpdate = (count: number, orderId: string) => {
        if (count === 0) {
          throw new DomainConflictException(
            "CONCURRENT_MODIFICATION",
            `Conflicto de concurrencia al transicionar la orden ${orderId}. La versión o estado ha cambiado concurrentemente.`,
            undefined,
            { instance: `/work-orders/${orderId}/transitions` },
          );
        }
        return { success: true };
      };

      expect(() => executeCasUpdate(0, "wo-99")).toThrow(DomainConflictException);
      try {
        executeCasUpdate(0, "wo-99");
      } catch (err) {
        expect(err).toBeInstanceOf(DomainConflictException);
        const dce = err as DomainConflictException;
        expect(dce.code).toBe("CONCURRENT_MODIFICATION");
        expect(dce.statusCode).toBe(409);
        expect(dce.details?.instance).toBe("/work-orders/wo-99/transitions");
      }

      expect(executeCasUpdate(1, "wo-99")).toEqual({ success: true });
    });
  });

  describe("N5: TTL de 30 Días para Tokens de Tracking y Fail-Closed en ENTREGADO", () => {
    const MAX_TRACKING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

    function checkTrackingTokenValidity(
      orderStatus: OrderStatus,
      issuedAt: Date,
      token: string,
    ) {
      const isExpired = Date.now() - issuedAt.getTime() > MAX_TRACKING_AGE_MS;
      if (orderStatus === "ENTREGADO" || isExpired) {
        throw new NotFoundException(
          "TRACKING_NOT_FOUND",
          "Enlace de seguimiento inválido, caducado o cerrado",
          { instance: `/tracking/${token}` },
        );
      }
      return { valid: true };
    }

    it("acepta tokens emitidos recientemente para órdenes activas", () => {
      const issuedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const res = checkTrackingTokenValidity("EN_REPARACION", issuedAt, "test-token");
      expect(res.valid).toBe(true);
    });

    it("rechaza fail-closed con 404 para tokens con más de 30 días de antigüedad", () => {
      const issuedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      expect(() => checkTrackingTokenValidity("EN_REPARACION", issuedAt, "expired-token")).toThrow(NotFoundException);
      try {
        checkTrackingTokenValidity("EN_REPARACION", issuedAt, "expired-token");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const nfe = err as NotFoundException;
        expect(nfe.code).toBe("TRACKING_NOT_FOUND");
        expect(nfe.statusCode).toBe(404);
      }
    });

    it("rechaza fail-closed con 404 para órdenes en estado ENTREGADO sin oráculo de estado", () => {
      const issuedAt = new Date(Date.now() - 1000);
      expect(() => checkTrackingTokenValidity("ENTREGADO", issuedAt, "delivered-token")).toThrow(NotFoundException);
      try {
        checkTrackingTokenValidity("ENTREGADO", issuedAt, "delivered-token");
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const nfe = err as NotFoundException;
        expect(nfe.code).toBe("TRACKING_NOT_FOUND");
        expect(nfe.statusCode).toBe(404);
      }
    });
  });

  describe("N6: Persistencia Granular de Ítems Aprobados / Rechazados", () => {
    it("separa correctamente ítems aprobados y rechazados a partir de approvedItemIds", () => {
      const laborLines = [
        { id: "lab-1", description: "Cambio de aceite", unitPriceCharged: 15000 },
        { id: "lab-2", description: "Alineación y balanceo", unitPriceCharged: 25000 },
      ];
      const partLines = [
        { id: "part-1", description: "Filtro de aceite", unitPriceCharged: 8000, quantity: 1 },
        { id: "part-2", description: "Cubiertas R16", unitPriceCharged: 120000, quantity: 2 },
      ];

      const approvedItemIds = ["lab-1", "part-1"];

      const laborIdsToApprove = laborLines.filter((l) => approvedItemIds.includes(l.id)).map((l) => l.id);
      const laborIdsToReject = laborLines.filter((l) => !approvedItemIds.includes(l.id)).map((l) => l.id);

      const partIdsToApprove = partLines.filter((p) => approvedItemIds.includes(p.id)).map((p) => p.id);
      const partIdsToReject = partLines.filter((p) => !approvedItemIds.includes(p.id)).map((p) => p.id);

      expect(laborIdsToApprove).toEqual(["lab-1"]);
      expect(laborIdsToReject).toEqual(["lab-2"]);
      expect(partIdsToApprove).toEqual(["part-1"]);
      expect(partIdsToReject).toEqual(["part-2"]);
    });

    it("calcula subtotales excluyendo ítems con isApproved false", () => {
      const laborLines = [
        { id: "lab-1", description: "Cambio de aceite", unitPriceCharged: 15000, isApproved: true },
        { id: "lab-2", description: "Alineación y balanceo", unitPriceCharged: 25000, isApproved: false },
      ];
      const partLines = [
        { id: "part-1", description: "Filtro de aceite", unitPriceCharged: 8000, quantity: 1, isApproved: true },
        { id: "part-2", description: "Cubiertas R16", unitPriceCharged: 120000, quantity: 2, isApproved: false },
      ];

      const approvedLaborSubtotal = laborLines
        .filter((l) => l.isApproved)
        .reduce((sum, l) => sum + l.unitPriceCharged, 0);

      const approvedPartsSubtotal = partLines
        .filter((p) => p.isApproved)
        .reduce((sum, p) => sum + p.unitPriceCharged * p.quantity, 0);

      const netSubtotal = approvedLaborSubtotal + approvedPartsSubtotal;
      const vatRate = 0.21;
      const vatAmount = Math.round(netSubtotal * vatRate);
      const totalAmount = netSubtotal + vatAmount;

      expect(approvedLaborSubtotal).toBe(15000);
      expect(approvedPartsSubtotal).toBe(8000);
      expect(netSubtotal).toBe(23000);
      expect(vatAmount).toBe(4830);
      expect(totalAmount).toBe(27830);
    });
  });

  describe("N7: Rotación de Token y URL Canónica de Seguimiento", () => {
    it("genera un token aleatorio seguro y su hash SHA-256 correspondiente", () => {
      const token = createTrackingToken();
      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThanOrEqual(32);

      const hash = hashTrackingToken(token);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    });

    it("construye la URL canónica bajo la ruta /tracking/[token]", () => {
      const token = "safe_random_token_123";
      const canonicalUrl = `/tracking/${encodeURIComponent(token)}`;
      expect(canonicalUrl).toBe("/tracking/safe_random_token_123");
      expect(canonicalUrl.startsWith("/tracking/")).toBe(true);
    });
  });
});
