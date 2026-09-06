import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import {
  generateTrackingToken,
  verifyTrackingToken,
} from "../../src/lib/tracking-token";

describe("tracking-token — generación y verificación", () => {
  const workOrderId = "workorder_123";
  const createdAt = new Date();

  beforeAll(() => {
    if (!process.env.TRACKING_HMAC_SECRET) {
      process.env.TRACKING_HMAC_SECRET = "test-secret-key-for-unit-tests-min-32-chars";
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generación y verificación válida", () => {
    it("genera un token y lo verifica exitosamente", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(true);
      expect(result.workOrderId).toBe(workOrderId);
      expect(result.error).toBeUndefined();
    });

    it("el token tiene el formato correcto: payload.signature", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const parts = token.split(".");

      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("genera tokens diferentes para diferentes workOrderIds", () => {
      const token1 = generateTrackingToken("order_1", createdAt);
      const token2 = generateTrackingToken("order_2", createdAt);

      expect(token1).not.toBe(token2);
    });

    it("genera tokens diferentes para diferentes fechas de creación", () => {
      const date1 = new Date("2024-01-01T00:00:00Z");
      const date2 = new Date("2024-01-02T00:00:00Z");

      const token1 = generateTrackingToken(workOrderId, date1);
      const token2 = generateTrackingToken(workOrderId, date2);

      expect(token1).not.toBe(token2);
    });
  });

  describe("detección de manipulación (tampering)", () => {
    it("rechaza token con payload modificado (workOrderId alterado)", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const parts = token.split(".");

      const payloadBuffer = Buffer.from(
        parts[0].replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
      const payload = JSON.parse(payloadBuffer.toString("utf-8")) as { id: string; exp: number };
      payload.id = "malicious_order_id";

      const tamperedPayload = Buffer.from(JSON.stringify(payload))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const tamperedToken = `${tamperedPayload}.${parts[1]}`;
      const result = verifyTrackingToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_SIGNATURE");
    });

    it("rechaza token con firma modificada", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const parts = token.split(".");

      const tamperedSignature = parts[1].slice(0, -1) + "X";
      const tamperedToken = `${parts[0]}.${tamperedSignature}`;

      const result = verifyTrackingToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_SIGNATURE");
    });

    it("rechaza token completamente inválido", () => {
      const result = verifyTrackingToken("invalid.token.here");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_TOKEN_FORMAT");
    });

    it("rechaza token sin firma", () => {
      const result = verifyTrackingToken("onlypayload");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_TOKEN_FORMAT");
    });
  });

  describe("detección de token expirado", () => {
    it("rechaza token expirado (> 30 días)", () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const token = generateTrackingToken(workOrderId, oldDate);

      const futureDate = new Date("2024-02-02T00:00:00Z");
      vi.spyOn(Date, "now").mockReturnValue(futureDate.getTime());

      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TOKEN_EXPIRED");
    });

    it("acepta token dentro del TTL (29 días)", () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const token = generateTrackingToken(workOrderId, oldDate);

      const futureDate = new Date("2024-01-30T00:00:00Z");
      vi.spyOn(Date, "now").mockReturnValue(futureDate.getTime());

      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(true);
      expect(result.workOrderId).toBe(workOrderId);
    });

    it("rechaza token exactamente en el límite de expiración", () => {
      const oldDate = new Date("2024-01-01T00:00:00Z");
      const token = generateTrackingToken(workOrderId, oldDate);

      const expirationDate = new Date("2024-01-31T00:00:00.001Z");
      vi.spyOn(Date, "now").mockReturnValue(expirationDate.getTime());

      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("TOKEN_EXPIRED");
    });
  });

  describe("resistencia a timing attacks", () => {
    it("rechaza firmas de longitudes arbitrarias", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const parts = token.split(".");

      const shortSignature = "ABC";
      const longSignature = "A".repeat(100);

      const result1 = verifyTrackingToken(`${parts[0]}.${shortSignature}`);
      const result2 = verifyTrackingToken(`${parts[0]}.${longSignature}`);

      expect(result1.valid).toBe(false);
      expect(result1.error).toBe("INVALID_SIGNATURE");
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("casos límite", () => {
    it("rechaza token con payload malformado (JSON inválido)", () => {
      const invalidPayload = Buffer.from("not-json").toString("base64");
      const token = `${invalidPayload}.signature`;

      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_PAYLOAD_FORMAT");
    });

    it("rechaza token con campos faltantes en payload", () => {
      const incompletePayload = Buffer.from(JSON.stringify({ id: "123" }))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const token = `${incompletePayload}.signature`;
      const result = verifyTrackingToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_PAYLOAD_FIELDS");
    });

    it("maneja tokens vacíos", () => {
      const result = verifyTrackingToken("");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("INVALID_TOKEN_FORMAT");
    });

    it("no expone customerId en el token", () => {
      const token = generateTrackingToken(workOrderId, createdAt);
      const parts = token.split(".");
      const payloadBuffer = Buffer.from(
        parts[0].replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      );
      const payload = JSON.parse(payloadBuffer.toString("utf-8")) as Record<string, unknown>;

      expect(payload).not.toHaveProperty("customerId");
      expect(payload).not.toHaveProperty("cost");
      expect(payload).not.toHaveProperty("price");
      expect(Object.keys(payload)).toEqual(["id", "exp"]);
    });
  });
});
