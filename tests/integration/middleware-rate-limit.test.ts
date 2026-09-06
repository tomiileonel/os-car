import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "~/middleware";
import { memoryLimiter, MemorySlidingWindow } from "@/lib/rate-limit";

function buildRequest(path: string, ip: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("middleware — Sliding Window conectado al tráfico HTTP (G4/G7)", () => {
  beforeEach(() => {
    memoryLimiter.reset();
  });

  it("permite solicitudes dentro de la cuota", async () => {
    const response = await middleware(buildRequest("/api/v1/public/tracking/lookup", "203.0.113.10"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("20");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("19");
  });

  it("devuelve 429 ProblemDetails (RFC 7807) tras superar la ráfaga", async () => {
    const path = "/api/auth/sign-in";
    let response: Response | undefined;

    for (let index = 0; index < 11; index += 1) {
      response = await middleware(buildRequest(path, "203.0.113.20"));
    }

    expect(response?.status).toBe(429);
    const body: unknown = await response?.json();
    expect(body).toMatchObject({
      type: expect.any(String),
      title: "Too Many Requests",
      status: 429,
      code: "RATE_LIMITED",
      instance: path,
      retryAfterSeconds: expect.any(Number),
    });
    const retryAfter = Number(response?.headers.get("retry-after"));
    expect(Number.isFinite(retryAfter) && retryAfter >= 1).toBe(true);
    expect(response?.headers.get("x-ratelimit-limit")).toBe("10");
    expect(response?.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("aísla contadores por IP de origen", async () => {
    const path = "/api/auth/sign-in";
    for (let index = 0; index < 11; index += 1) {
      await middleware(buildRequest(path, "198.51.100.7"));
    }
    const otherIpResponse = await middleware(buildRequest(path, "198.51.100.8"));
    expect(otherIpResponse.status).toBe(200);
  });

  it("no aplica límite a rutas fuera del matcher", async () => {
    for (let index = 0; index < 25; index += 1) {
      const response = await middleware(buildRequest("/admin/dashboard", "203.0.113.30"));
      expect(response.status).toBe(200);
    }
  });

  it("previene evasión de rate limit mediante rotación de headers x-workshop-id", async () => {
    const path = "/api/auth/sign-in";
    let response: Response | undefined;
    for (let index = 0; index < 11; index += 1) {
      const req = new NextRequest(new URL(path, "http://localhost:3000"), {
        method: "POST",
        headers: {
          "x-forwarded-for": "198.51.100.99",
          "x-workshop-id": `attacker-ws-${index}`,
        },
      });
      response = await middleware(req);
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get("x-ratelimit-limit")).toBe("10");
    expect(response?.headers.get("x-ratelimit-remaining")).toBe("0");
    const retryAfter = Number(response?.headers.get("retry-after"));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("prioriza cabeceras de infraestructura (cf-connecting-ip / x-real-ip)", async () => {
    const path = "/api/auth/sign-in";
    for (let index = 0; index < 10; index += 1) {
      const req = new NextRequest(new URL(path, "http://localhost:3000"), {
        method: "POST",
        headers: {
          "cf-connecting-ip": "100.64.0.1",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
    }
    const blockedReq = new NextRequest(new URL(path, "http://localhost:3000"), {
      method: "POST",
      headers: {
        "cf-connecting-ip": "100.64.0.1",
        "x-forwarded-for": "9.8.7.6", // header XFF falsificado no altera el bucket
      },
    });
    const blockedRes = await middleware(blockedReq);
    expect(blockedRes.status).toBe(429);
  });

  it("extrae la última IP no manipulable en cadenas X-Forwarded-For ante proxies agregadores", async () => {
    const path = "/api/auth/sign-in";
    const req = new NextRequest(new URL(path, "http://localhost:3000"), {
      method: "POST",
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.55",
      },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-limit")).toBe("10");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("9");
  });

  it("aplica cuota compartida estricta ante solicitudes sin IP determinable (unresolved_ip)", async () => {
    const path = "/api/auth/sign-in";
    for (let index = 0; index < 10; index += 1) {
      const req = new NextRequest(new URL(path, "http://localhost:3000"), {
        method: "POST",
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
    }
    const req11 = new NextRequest(new URL(path, "http://localhost:3000"), {
      method: "POST",
    });
    const res11 = await middleware(req11);
    expect(res11.status).toBe(429);
  });

  describe("MemorySlidingWindow — LRU y Cap de Isolate Edge", () => {
    it("desaloja la clave más antigua cuando se alcanza el límite máximo de buckets", () => {
      const limiter = new MemorySlidingWindow(3);
      const now = Date.now();

      limiter.record("ip-1", 5, 60_000, now);
      limiter.record("ip-2", 5, 60_000, now);
      limiter.record("ip-3", 5, 60_000, now);
      expect(limiter.size).toBe(3);

      // Inserción de una cuarta clave debe desalojar ip-1 (la más antigua)
      limiter.record("ip-4", 5, 60_000, now);
      expect(limiter.size).toBe(3);

      // ip-1 ahora es nueva y debe tener cuota completa limpia
      const decision = limiter.record("ip-1", 5, 60_000, now);
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(4);
    });

    it("poda timestamps expirados fuera de la ventana", () => {
      const limiter = new MemorySlidingWindow(10);
      const windowMs = 10_000; // ventana de 10s

      // Registra 2 peticiones en t=91_000
      limiter.record("ip-test", 3, windowMs, 91_000);
      limiter.record("ip-test", 3, windowMs, 91_000);

      // En t=105_000 (14s después), las peticiones previas ya expiraron
      const decision = limiter.record("ip-test", 3, windowMs, 105_000);
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(2); // 3 - 1 petición actual
    });

    it("mantiene el tamaño acotado (size <= maxEntries) bajo flood masivo de 50.000 IPs distintas", () => {
      const maxEntries = 10_000;
      const limiter = new MemorySlidingWindow(maxEntries);
      const now = Date.now();
      for (let i = 0; i < 50_000; i += 1) {
        limiter.record(`flood-ip-${i}`, 5, 60_000, now);
      }
      expect(limiter.size).toBe(maxEntries);
      expect(limiter.size).toBeLessThanOrEqual(10_000);
    });
  });
});
