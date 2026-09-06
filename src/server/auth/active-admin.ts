import type { AdminUser } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ForbiddenException } from "@/shared/errors";
import { auth, type Session } from "~/lib/auth";

export interface ActiveAdminContext {
  session: Session;
  adminUser: AdminUser;
  workshopId: string;
}

/**
 * Resolves the authenticated Better Auth user to an active, non-deleted
 * workshop administrator. Session presence alone is not authorization.
 */
export async function requireActiveAdmin(): Promise<ActiveAdminContext> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/admin/login");
  }

  const adminUser = await prisma.adminUser.findFirst({
    where: {
      authUserId: session.user.id,
      active: true,
      deletedAt: null,
    },
  });

  if (!adminUser) {
    throw new ForbiddenException(
      "ADMIN_ACCESS_REQUIRED",
      "La sesión no pertenece a un administrador activo del taller."
    );
  }

  return {
    session,
    adminUser,
    workshopId: adminUser.workshopId,
  };
}
