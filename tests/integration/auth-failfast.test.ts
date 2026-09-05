import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;
const ORIGINAL_URL = process.env.BETTER_AUTH_URL;

describe("lib/auth — fail-fast de arranque (G4/G7)", () => {
  afterEach(() => {
    if (ORIGINAL_SECRET !== undefined) process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_URL !== undefined) {
      process.env.BETTER_AUTH_URL = ORIGINAL_URL;
    }
    vi.resetModules();
  });

  it("aborta el arranque cuando BETTER_AUTH_SECRET está ausente", async () => {
    vi.resetModules();
    delete process.env.BETTER_AUTH_SECRET;
    await expect(import("~/lib/auth")).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it("aborta el arranque cuando BETTER_AUTH_URL es cadena vacía", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "   ";
    await expect(import("~/lib/auth")).rejects.toThrow(/BETTER_AUTH_URL/);
  });

  it("aborta el arranque cuando BETTER_AUTH_SECRET es débil o corto", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_SECRET = "secret";
    await expect(import("~/lib/auth")).rejects.toThrow(/débil/);
  });

  it("aborta el arranque cuando DATABASE_URL está ausente", async () => {
    vi.resetModules();
    const originalDb = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(import("~/lib/auth")).rejects.toThrow(/DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = originalDb;
    }
  });

  it("inicializa correctamente con secretos válidos", async () => {
    vi.resetModules();
    const authModule = await import("~/lib/auth");
    expect(typeof authModule.auth).toBe("object");
  });
});
