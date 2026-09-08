import type { AdminRole as PrismaAdminRole, AdminUser } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { ForbiddenException, UnauthorizedException } from "@/shared/errors";
import { auth, type Session } from "~/lib/auth";

export type AdminRole =
  | PrismaAdminRole
  | "SUPER_ADMIN"
  | "ADMIN_TALLER"
  | "MECANICO"
  | "RECEPCIONISTA";

/** Roles canónicos de Prisma. Se mantiene separado de los alias históricos. */
export const CANONICAL_ADMIN_ROLES = [
  "OWNER",
  "TALLER_SUPERVISOR",
  "ADMIN",
  "MECANICO",
  "RECEPCIONISTA",
] as const satisfies readonly PrismaAdminRole[];

export type CanonicalAdminRole = (typeof CANONICAL_ADMIN_ROLES)[number];

export function isAllowedAdminRole(role: string | null | undefined): role is CanonicalAdminRole {
  return typeof role === "string" &&
    (CANONICAL_ADMIN_ROLES as readonly string[]).includes(role);
}

export interface CanonicalActiveAdminContext {
  adminId: string;
  workshopId: string;
  role: CanonicalAdminRole;
  displayName: string;
  email: string | null;
}

export class AdminAuthError extends Error {
  readonly statusCode: 401 | 403;
  readonly code: string;

  constructor(statusCode: 401 | 403, code: string, message: string) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface RequireActiveAdminOptions {
  roles?: ReadonlyArray<AdminRole>;
}

export interface ActiveAdminContext {
  session: Session;
  sessionUser: {
    id: string;
    email: string;
    name?: string;
  };
  adminUser: AdminUser;
  workshopId: string;
}

/**
 * Detecta si el request actual es una API route o una Server Action/RSC.
 * Las API routes típicamente esperan JSON y tienen paths /api/*.
 */
async function isApiContext(): Promise<boolean> {
  try {
    const headersList = await headers();
    const accept = headersList.get("accept") ?? "";
    const nextUrl = headersList.get("x-url") ?? headersList.get("referer") ?? "";

    if (accept.includes("application/json")) return true;
    if (nextUrl.includes("/api/")) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Función interna compartida para resolver sesión y admin user.
 * Retorna el contexto o un indicador de error.
 */
async function resolveAdminContext(options?: RequireActiveAdminOptions): Promise<{
  success: true;
  context: ActiveAdminContext;
} | {
  success: false;
  reason: "NO_SESSION" | "ADMIN_INACTIVE" | "INSUFFICIENT_ROLE";
}> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, reason: "NO_SESSION" };
  }

  const adminUser = await prisma.adminUser.findFirst({
    where: {
      authUserId: session.user.id,
      active: true,
      deletedAt: null,
    },
  });

  if (!adminUser) {
    return { success: false, reason: "ADMIN_INACTIVE" };
  }

  if (options?.roles && !options.roles.includes(adminUser.role as AdminRole)) {
    return { success: false, reason: "INSUFFICIENT_ROLE" };
  }

  return {
    success: true,
    context: {
      session,
      sessionUser: {
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? undefined,
      },
      adminUser,
      workshopId: adminUser.workshopId,
    },
  };
}

/**
 * Variante SSR/Server Components: redirige a /admin/login si no hay sesión
 * o si el admin no está activo/tiene rol insuficiente.
 */
export async function requireActiveAdminSsr(
  options?: RequireActiveAdminOptions
): Promise<ActiveAdminContext> {
  const result = await resolveAdminContext(options);

  if (!result.success) {
    redirect("/admin/login");
  }

  return result.context;
}

/**
 * Variante API Route Handlers: lanza excepciones HTTP tipadas (401/403).
 */
export async function requireActiveAdminApi(
  options?: RequireActiveAdminOptions
): Promise<ActiveAdminContext> {
  const result = await resolveAdminContext(options);

  if (!result.success) {
    switch (result.reason) {
      case "NO_SESSION":
        throw new UnauthorizedException(
          "SESSION_REQUIRED",
          "Se requiere una sesión activa para acceder a este recurso."
        );
      case "ADMIN_INACTIVE":
        throw new ForbiddenException(
          "ADMIN_INACTIVE",
          "No existe un registro de administrador activo para esta cuenta."
        );
      case "INSUFFICIENT_ROLE":
        throw new ForbiddenException(
          "INSUFFICIENT_ROLE_PERMISSIONS",
          "El rol del usuario no tiene permisos para acceder a este recurso."
        );
    }
  }

  return result.context;
}

/**
 * Requiere una sesión activa de administrador con validación de rol opcional.
 *
 * Comportamiento fail-closed bimodal:
 * - API routes: lanza UnauthorizedException (401) o ForbiddenException (403)
 * - RSC/Server Actions: redirige a /admin/login
 *
 * El workshopId siempre se vincula desde el registro AdminUser en base de datos,
 * nunca desde parámetros del cliente.
 */
export async function requireActiveAdmin(
  options?: RequireActiveAdminOptions
): Promise<ActiveAdminContext> {
  const isApi = await isApiContext();
  if (isApi) {
    return requireActiveAdminApi(options);
  }
  return requireActiveAdminSsr(options);
}

/**
 * Resolución estricta para nuevas rutas: solo admite roles presentes en el
 * enum Prisma canónico y nunca deriva workshopId de la petición.
 */
export async function resolveActiveAdminByAuthUserId(
  authUserId: string,
): Promise<CanonicalActiveAdminContext | null> {
  if (!authUserId.trim()) return null;

  const admin = await prisma.adminUser.findFirst({
    where: { authUserId, active: true, deletedAt: null },
    select: {
      id: true,
      workshopId: true,
      role: true,
      displayName: true,
      email: true,
    },
  });
  if (!admin || !isAllowedAdminRole(admin.role)) return null;

  return {
    adminId: admin.id,
    workshopId: admin.workshopId,
    role: admin.role,
    displayName: admin.displayName,
    email: admin.email,
  };
}

async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function getActiveAdmin(): Promise<CanonicalActiveAdminContext | null> {
  const userId = await getSessionUserId();
  return userId ? resolveActiveAdminByAuthUserId(userId) : null;
}

/** Guardia estricta para rutas que ya migraron al contrato canónico G5. */
export async function requireCanonicalActiveAdmin(): Promise<CanonicalActiveAdminContext> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new AdminAuthError(401, "UNAUTHENTICATED", "Se requiere sesión administrativa.");
  }

  const admin = await resolveActiveAdminByAuthUserId(userId);
  if (!admin) {
    throw new AdminAuthError(
      403,
      "FORBIDDEN_ADMIN_MEMBERSHIP",
      "La sesión no tiene membresía activa ni rol autorizado en este taller.",
    );
  }
  return admin;
}
