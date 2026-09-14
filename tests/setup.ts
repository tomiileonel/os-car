import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";

dotenv.config();

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-jwt-secret-0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_SECRET ??=
  "test-better-auth-secret-fedcba9876543210fedcba9876543210";
process.env.TRACKING_HMAC_SECRET ??=
  "test-tracking-hmac-secret-at-least-32-chars-long";
// AUD-029: Guard Anti-Producción estricto en entorno de pruebas.
// Los tests nunca deben escribir en bases remotas a menos que se configure explícitamente ALLOW_REMOTE_TEST_DB=true.
if (process.env.ALLOW_REMOTE_TEST_DB !== "true") {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgresql://oscar:oscar@localhost:5432/oscar_test";
  delete process.env.DIRECT_URL;
  delete process.env.G5_NEON_DATABASE_URL;
}

delete process.env.REDIS_URL;

