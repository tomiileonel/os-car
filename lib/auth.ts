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
  if (process.env.NODE_ENV === "test" && typeof env.BETTER_AUTH_URL === "string" && env.BETTER_AUTH_URL.trim().length === 0) {
    return "";
  }
  const customUrl =
    typeof env.BETTER_AUTH_URL === "string" && env.BETTER_AUTH_URL.trim().length > 0
      ? env.BETTER_AUTH_URL.trim()
      : typeof env.NEXT_PUBLIC_APP_URL === "string" && env.NEXT_PUBLIC_APP_URL.trim().length > 0
      ? env.NEXT_PUBLIC_APP_URL.trim()
      : undefined;

  if (customUrl && !customUrl.includes("localhost")) {
    return customUrl;
  }
  if (env.VERCEL_PROJECT_PRODUCTION_URL && env.VERCEL_PROJECT_PRODUCTION_URL.trim().length > 0) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`;
  }
  if (env.VERCEL_URL && env.VERCEL_URL.trim().length > 0) {
    return `https://${env.VERCEL_URL.trim()}`;
  }
  if (customUrl) {
    return customUrl;
  }
  return "https://os-car.vercel.app";
}

export function assertAuthEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];

  const secret =
    (typeof env.BETTER_AUTH_SECRET === "string" && env.BETTER_AUTH_SECRET.trim().length > 0
      ? env.BETTER_AUTH_SECRET.trim()
      : undefined) ||
    (typeof env.AUTH_SECRET === "string" && env.AUTH_SECRET.trim().length > 0
      ? env.AUTH_SECRET.trim()
      : undefined);

  const url = resolveAuthBaseUrl(env);

  const dbUrl =
    typeof env.DATABASE_URL === "string" && env.DATABASE_URL.trim().length > 0
      ? env.DATABASE_URL.trim()
      : undefined;

  if (!secret) {
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

  if (!dbUrl) {
    missing.push("DATABASE_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `[OS-CAR AUTH][FATAL] Faltan variables requeridas en el entorno: ${missing.join(", ")}.`
    );
  }
}

assertAuthEnvironment();

const AUTH_SECRET = (process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "").trim();
const DB_CONNECTION_STRING = (process.env.DATABASE_URL || "").trim();

export const auth = betterAuth({
  secret: AUTH_SECRET,
  baseURL: resolveAuthBaseUrl(),
  database: new Pool({
    connectionString: DB_CONNECTION_STRING,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
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
