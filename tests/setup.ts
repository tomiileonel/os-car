import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";

dotenv.config();

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-jwt-secret-0123456789abcdef0123456789abcdef";
process.env.BETTER_AUTH_SECRET ??=
  "test-better-auth-secret-fedcba9876543210fedcba9876543210";
process.env.TRACKING_HMAC_SECRET ??=
  "test-tracking-hmac-secret-at-least-32-chars-long";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://oscar:oscar@localhost:5432/oscar_test";
delete process.env.REDIS_URL;
