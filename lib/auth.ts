import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Pool } from "pg";

const WEAK_SECRET_PATTERNS = [/^(secret|changeme|123456|password|admin|default)$/i];

/**
 * Header interno que autoriza /sign-up/email. Solo lo conoce el proceso
 * server (src/server/services/admin-invite.service.ts y
 * scripts/create-admin.mjs), nunca llega al bundle de cliente ni a un
 * request de un navegador externo. Better Auth no tiene un flag nativo
 * para "signup habilitado solo server-side" (ver better-auth#1142,
 * #5724), así que el corte se implementa con hooks.before comparando
 * este header contra BETTER_AUTH_SECRET.
 */
export const INTERNAL_SIGNUP_HEADER = "x-oscar-internal-signup";

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

const AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "build-time-fallback-secret-minimum-32-chars-long";

export const auth = betterAuth({
  secret: AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
    // Los admins nunca quedan logueados automáticamente al ser creados por
    // invitación: el invitado debe iniciar sesión explícitamente con la
    // contraseña provisoria, igual que cualquier login normal.
    autoSignIn: false,
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "strict",
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
