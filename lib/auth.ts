import { betterAuth } from "better-auth";

const WEAK_SECRET_PATTERNS = [/^(secret|changeme|123456|password|admin|default)$/i];

export function assertAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  const secret = env.BETTER_AUTH_SECRET;
  const url = env.BETTER_AUTH_URL;
  const dbUrl = env.DATABASE_URL;

  if (typeof secret !== "string" || secret.trim().length === 0) {
    missing.push("BETTER_AUTH_SECRET");
  } else if (
    secret.length < 32 ||
    WEAK_SECRET_PATTERNS.some((pattern) => pattern.test(secret.trim()))
  ) {
    throw new Error(
      "[OS-CAR AUTH][FATAL] BETTER_AUTH_SECRET es débil o es un valor por defecto conocido. Debe tener al menos 32 caracteres y no usar valores triviales."
    );
  }
  if (typeof url !== "string" || url.trim().length === 0) {
    missing.push("BETTER_AUTH_URL");
  }
  if (typeof dbUrl !== "string" || dbUrl.trim().length === 0) {
    missing.push("DATABASE_URL");
  }

  if (missing.length > 0) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return;
    }
    throw new Error(
      `[OS-CAR AUTH][FATAL] Variables de entorno obligatorias ausentes o vacías: ${missing.join(
        ", "
      )}. El proceso no puede iniciar sin secretos de autenticación.`
    );
  }
}

assertAuthEnvironment();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "build-time-fallback-secret-minimum-32-chars-long",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  },
});

export type Session = typeof auth.$Infer.Session;
