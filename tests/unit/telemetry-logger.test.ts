import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORRELATION_HEADER,
  generateCorrelationId,
  getCorrelationId,
  resolveCorrelationId,
} from "@/shared/telemetry/correlation";
import {
  SERVICE_NAME,
  createLogger,
  maskSensitiveData,
} from "@/shared/telemetry/logger";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("maskSensitiveData", () => {
  it("enmascara las siete claves canónicas (case-insensitive y con separadores)", () => {
    const input = {
      password: "p1",
      TOKEN: "t1",
      "Refresh-Token": "t2",
      access_token: "t3",
      secret: "s1",
      Authorization: "Bearer abc",
      Cookie: "sid=1",
      apiKey: "k1",
      creditCard: "4111-1111-1111-1111",
      visible: "ok",
    };

    const masked = maskSensitiveData(input) as Record<string, unknown>;

    expect(masked.password).toBe("[REDACTED]");
    expect(masked.TOKEN).toBe("[REDACTED]");
    expect(masked["Refresh-Token"]).toBe("[REDACTED]");
    expect(masked.access_token).toBe("[REDACTED]");
    expect(masked.secret).toBe("[REDACTED]");
    expect(masked.Authorization).toBe("[REDACTED]");
    expect(masked.Cookie).toBe("[REDACTED]");
    expect(masked.apiKey).toBe("[REDACTED]");
    expect(masked.creditCard).toBe("[REDACTED]");
    expect(masked.visible).toBe("ok");

    // No muta el objeto original.
    expect(input.password).toBe("p1");
    expect(input.apiKey).toBe("k1");
  });

  it("enmascara recursivamente objetos anidados y arrays", () => {
    const input = {
      nested: { deep: { authorization: "Bearer x", keep: 1 } },
      list: [{ cookie: "sid" }, "plain"],
    };

    const masked = maskSensitiveData(input) as {
      nested: { deep: Record<string, unknown> };
      list: Array<Record<string, unknown> | string>;
    };

    expect(masked.nested.deep.authorization).toBe("[REDACTED]");
    expect(masked.nested.deep.keep).toBe(1);
    expect((masked.list[0] as Record<string, unknown>).cookie).toBe("[REDACTED]");
    expect(masked.list[1]).toBe("plain");
  });

  it("tolera referencias circulares sin lanzar", () => {
    const circular: Record<string, unknown> = { password: "x" };
    circular.self = circular;

    expect(() => maskSensitiveData(circular)).not.toThrow();

    const masked = maskSensitiveData(circular) as Record<string, unknown>;
    expect(masked.password).toBe("[REDACTED]");
    expect(masked.self).toBe("[Circular]");
  });
});

describe("logger estructurado", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("LOG_LEVEL", "debug");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emite una línea JSON válida con el esquema canónico", () => {
    const log = createLogger({ correlationId: "corr-1", workshopId: "ws_1", actorId: "admin_1" });

    log.info("orden creada", { metadata: { orderStatus: "INGRESADO" } });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    const record = JSON.parse(line) as Record<string, unknown> & {
      timestamp: string;
      metadata: Record<string, unknown>;
    };

    expect(record.service).toBe(SERVICE_NAME);
    expect(record.level).toBe("info");
    expect(record.message).toBe("orden creada");
    expect(record.correlationId).toBe("corr-1");
    expect(record.workshopId).toBe("ws_1");
    expect(record.actorId).toBe("admin_1");
    expect(record.metadata.orderStatus).toBe("INGRESADO");
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  });

  it("sanitiza secretos dentro del metadata antes de emitir", () => {
    const log = createLogger();

    log.info("evento sensible", {
      apiKey: "kkk",
      metadata: { nested: { authorization: "Bearer x" } },
    });

    const record = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      metadata: { apiKey: string; nested: { authorization: string } };
    };

    expect(record.metadata.apiKey).toBe("[REDACTED]");
    expect(record.metadata.nested.authorization).toBe("[REDACTED]");
  });

  it("serializa errores y escribe warn/error por stderr", () => {
    const log = createLogger();

    log.error("falló la transición", { error: new Error("INVALID_STATE_TRANSITION") });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    const record = JSON.parse(errorSpy.mock.calls[0][0] as string) as {
      level: string;
      error: { name: string; message: string };
    };
    expect(record.level).toBe("error");
    expect(record.error.name).toBe("Error");
    expect(record.error.message).toBe("INVALID_STATE_TRANSITION");
  });

  it("respeta LOG_LEVEL y suprime niveles inferiores", () => {
    vi.stubEnv("LOG_LEVEL", "error");
    const log = createLogger();

    log.info("no debe salir");
    log.error("sí debe salir");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("child() hereda y sobreescribe contexto", () => {
    const base = createLogger({ workshopId: "ws_1" });
    const child = base.child({ actorId: "admin_9" });

    child.info("hijo");

    const record = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(record.workshopId).toBe("ws_1");
    expect(record.actorId).toBe("admin_9");
  });
});

describe("correlation id", () => {
  it("extrae el header canónico desde Headers", () => {
    const headers = new Headers({ [CORRELATION_HEADER]: "req-123" });
    expect(getCorrelationId(headers)).toBe("req-123");
  });

  it("extrae el header desde un Request (Web API)", () => {
    const request = new Request("https://os-car.test/api/v1/work-orders", {
      headers: { [CORRELATION_HEADER]: "req-456" },
    });
    expect(getCorrelationId(request)).toBe("req-456");
  });

  it("rechaza valores ausentes, con espacios o demasiado largos", () => {
    expect(getCorrelationId(new Headers())).toBeNull();
    expect(getCorrelationId(new Headers({ [CORRELATION_HEADER]: "con espacios" }))).toBeNull();
    expect(getCorrelationId(new Headers({ [CORRELATION_HEADER]: "a".repeat(200) }))).toBeNull();
  });

  it("generateCorrelationId produce UUIDv4 vía Web API (sin node:crypto)", () => {
    expect(generateCorrelationId()).toMatch(UUID_V4_PATTERN);
    expect(generateCorrelationId()).not.toBe(generateCorrelationId());
  });

  it("resolveCorrelationId reutiliza un id válido o genera uno nuevo", () => {
    const headers = new Headers({ [CORRELATION_HEADER]: "req-789" });
    expect(resolveCorrelationId(headers)).toBe("req-789");
    expect(resolveCorrelationId(new Headers())).toMatch(UUID_V4_PATTERN);
    expect(resolveCorrelationId(null)).toMatch(UUID_V4_PATTERN);
  });
});
