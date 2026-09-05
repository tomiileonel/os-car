import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "~/middleware";
import { memoryLimiter } from "@/lib/redis";

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
    expect(response?.headers.get("retry-after")).not.toBeNull();
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
});
