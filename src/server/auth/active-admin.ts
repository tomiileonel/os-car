import type { AdminRole as PrismaAdminRole, AdminUser } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ForbiddenException, UnauthorizedException } from "@/shared/errors";
import { auth, type Session } from "~/lib/auth";

export type AdminRole =
  | PrismaAdminRole
  | "SUPER_ADMIN"
  | "ADMIN_TALLER"
  | "MECANICO"
  | "RECEPCIONISTA";

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
