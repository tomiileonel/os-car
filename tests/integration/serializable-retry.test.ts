import { describe, it, expect } from "vitest";
import { withSerializableRetry } from "@/server/services/order-calculation.service";
import { Prisma } from "@prisma/client";

describe("G11 — withSerializableRetry backoff on 40001 / 40P01", () => {
  it("retries serialization_failure (40001) and succeeds within 5 attempts", async () => {
    let attempts = 0;

    const result = await withSerializableRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          const err = new Prisma.PrismaClientKnownRequestError(
            "could not serialize access due to read/write dependencies among transactions",
            { code: "P2034", clientVersion: "6.0.0" },
          );
          (err as unknown as { meta: { code: string } }).meta = { code: "40001" };
          throw err;
        }
        return { success: true, count: 42 };
      },
      { maxAttempts: 5, baseDelayMs: 5, maxDelayMs: 20 },
    );

    expect(attempts).toBe(3);
    expect(result.success).toBe(true);
    expect(result.count).toBe(42);
  });

  it("retries deadlock detected (40P01) and succeeds", async () => {
    let attempts = 0;

    const result = await withSerializableRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = new Prisma.PrismaClientKnownRequestError(
            "deadlock detected: Process 12345 waits for ShareLock",
            { code: "P2034", clientVersion: "6.0.0" },
          );
          (err as unknown as { meta: { code: string } }).meta = { code: "40P01" };
          throw err;
        }
        return "resolved";
      },
      { maxAttempts: 3, baseDelayMs: 5 },
    );

    expect(attempts).toBe(2);
    expect(result).toBe("resolved");
  });

  it("gives up and rethrows after maxAttempts on persistent deadlock", async () => {
    let attempts = 0;

    await expect(
      withSerializableRetry(
        async () => {
          attempts++;
          const err = new Prisma.PrismaClientKnownRequestError("deadlock detected", {
            code: "P2034",
            clientVersion: "6.0.0",
          });
          (err as unknown as { meta: { code: string } }).meta = { code: "40P01" };
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 10 },
      ),
    ).rejects.toThrow(/deadlock/i);

    expect(attempts).toBe(3);
  });

  it("fails fast on non-retryable error (e.g. P2002 unique constraint) without retrying", async () => {
    let attempts = 0;

    await expect(
      withSerializableRetry(
        async () => {
          attempts++;
          const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.0.0",
          });
          throw err;
        },
        { maxAttempts: 5, baseDelayMs: 5 },
      ),
    ).rejects.toThrow(/unique constraint/i);

    expect(attempts).toBe(1);
  });
});
