import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Pool } from "pg";

const WEAK_SECRET_PATTERNS = [/^(secret|changeme|123456|password|admin|default)$/i];

/**
 * Header interno que autoriza /sign-up/email. Solo lo conoce el proceso
 * server (src/server/services/admin-register.service.ts y
 * scripts/create-admin.ts), nunca llega al bundle de cliente ni a un
 * request de un navegador externo. Better Auth no tiene un flag nativo
 * para "signup habilitado solo server-side" (ver better-auth#1142,
 * #5724), así que el corte se implementa con hooks.before comparando
 * este header contra BETTER_AUTH_SECRET.
 */
export const INTERNAL_SIGNUP_HEADER = "x-oscar-internal-signup";

export function resolveAuthBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (typeof env.BETTER_AUTH_URL === "string" && env.BETTER_AUTH_URL.trim().length === 0) {
    return "";
  }
  const customUrl = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL;
  if (customUrl && customUrl.trim().length > 0 && !customUrl.includes("localhost")) {
    return customUrl.trim();
  }
  if (env.VERCEL_PROJECT_PRODUCTION_URL && env.VERCEL_PROJECT_PRODUCTION_URL.trim().length > 0) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }
  if (env.VERCEL_URL && env.VERCEL_URL.trim().length > 0) {
    return `https://${env.VERCEL_URL.trim()}`;
  }
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl.trim();
  }
  return "http://localhost:3000";
}

export function assertAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  const secret = env.BETTER_AUTH_SECRET || env.AUTH_SECRET;
  const url = resolveAuthBaseUrl(env);
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
  if (!url || url.trim().length === 0) {
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

const AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "build-time-fallback-secret-minimum-32-chars-long";

export const auth = betterAuth({
  secret: AUTH_SECRET,
  baseURL: resolveAuthBaseUrl(),
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10,
  }),
  trustedOrigins: [
    "https://os-car.vercel.app",
    "http://localhost:3000",
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  emailAndPassword: {
    enabled: true,
    // Los admins nunca quedan logueados automáticamente al ser creados por
    // invitación: el invitado debe iniciar sesión explícitamente con la
    // contraseña provisoria, igual que cualquier login normal.
    autoSignIn: false,
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const providedHeader = ctx.headers?.get(INTERNAL_SIGNUP_HEADER);
      if (providedHeader !== AUTH_SECRET) {
        throw new APIError("FORBIDDEN", {
          message:
            "El registro público está deshabilitado. Los administradores se crean por invitación interna.",
        });
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
