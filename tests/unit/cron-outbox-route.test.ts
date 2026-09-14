import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/jobs/worker", () => ({
  ensureDefaultOutboxHandlers: vi.fn(),
  runWorkerOnce: vi.fn().mockResolvedValue({
    claimed: 1,
    completed: 1,
    failed: 0,
    deadLettered: 0,
    recovered: 0,
  }),
}));

import { GET } from "../../app/api/cron/outbox/route";
import { ensureDefaultOutboxHandlers, runWorkerOnce } from "@/server/jobs/worker";

describe("GET /api/cron/outbox (Vercel Cron Trigger Security)", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("retorna 500 fail-closed si CRON_SECRET no está configurado en el entorno", async () => {
    delete process.env.CRON_SECRET;

    const request = new NextRequest("http://localhost:3000/api/cron/outbox", {
      headers: { authorization: "Bearer some-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("CRON_SECRET is not configured");
    expect(runWorkerOnce).not.toHaveBeenCalled();
  });

  it("retorna 401 si no se envía header de Authorization", async () => {
    process.env.CRON_SECRET = "secure-cron-secret-12345";

    const request = new NextRequest("http://localhost:3000/api/cron/outbox");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
    expect(runWorkerOnce).not.toHaveBeenCalled();
  });

  it("retorna 401 si el token no coincide (timing-safe comparison)", async () => {
    process.env.CRON_SECRET = "secure-cron-secret-12345";

    const request = new NextRequest("http://localhost:3000/api/cron/outbox", {
      headers: { authorization: "Bearer invalid-token" },
    });
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
    expect(runWorkerOnce).not.toHaveBeenCalled();
  });

  it("ejecuta exitosamente el outbox worker cuando el token es válido y registra handlers", async () => {
    process.env.CRON_SECRET = "secure-cron-secret-12345";

    const request = new NextRequest("http://localhost:3000/api/cron/outbox", {
      headers: { authorization: "Bearer secure-cron-secret-12345" },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.summary.completed).toBe(1);

    expect(ensureDefaultOutboxHandlers).toHaveBeenCalledTimes(1);
    expect(runWorkerOnce).toHaveBeenCalledTimes(1);
    expect(runWorkerOnce).toHaveBeenCalledWith({ batchSize: 25, leaseMs: 60_000 });
  });
});
