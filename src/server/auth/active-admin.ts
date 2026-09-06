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
 * Requiere una sesión activa de administrador con validación de rol opcional.
 *
 * Comportamiento fail-closed:
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

  // 1. Resolver sesión activa via Better Auth
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    if (isApi) {
      throw new UnauthorizedException(
        "SESSION_REQUIRED",
        "Se requiere una sesión activa para acceder a este recurso."
      );
    }
    redirect("/admin/login");
  }

  // 2. Consultar AdminUser vinculado a la sesión
  const adminUser = await prisma.adminUser.findFirst({
    where: {
      authUserId: session.user.id,
      active: true,
      deletedAt: null,
    },
  });

  if (!adminUser) {
    if (isApi) {
      throw new ForbiddenException(
        "ADMIN_INACTIVE",
        "No existe un registro de administrador activo para esta cuenta."
      );
    }
    redirect("/admin/login");
  }

  // 3. Validar roles si se especificaron restricciones
  if (options?.roles && !options.roles.includes(adminUser.role as AdminRole)) {
    if (isApi) {
      throw new ForbiddenException(
        "INSUFFICIENT_ROLE_PERMISSIONS",
        `El rol "${adminUser.role}" no tiene permisos para acceder a este recurso.`
      );
    }
    redirect("/admin/login");
  }

  // 4. Retornar contexto con workshopId vinculado de DB (fail-closed tenant isolation)
  return {
    session,
    sessionUser: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? undefined,
    },
    adminUser,
    workshopId: adminUser.workshopId,
  };
}
