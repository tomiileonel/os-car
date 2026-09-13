import { prisma } from "@/server/db";

export interface AdminBootstrapStatus {
  canRegister: boolean;
  adminCount: number;
}

/**
 * Consulta canónica del estado de bootstrap administrativo.
 * Coincide exactamente con la regla y semántica de requireActiveAdmin():
 * Administrador activo y no eliminado suavemente (active: true, deletedAt: null).
 *
 * Esta es la única fuente de verdad para determinar si el sistema admite
 * la creación del primer administrador (OWNER).
 */
export async function getAdminBootstrapStatus(): Promise<AdminBootstrapStatus> {
  const adminCount = await prisma.adminUser.count({
    where: { active: true, deletedAt: null },
  });

  return {
    canRegister: adminCount === 0,
    adminCount,
  };
}

