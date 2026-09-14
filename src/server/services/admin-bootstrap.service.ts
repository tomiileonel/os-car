import { prisma } from "@/server/db";

export interface AdminBootstrapStatus {
  canRegister: boolean;
  adminCount: number;
}

/**
 * Consulta canónica del estado de bootstrap administrativo.
 * Coincide con la regla y semántica de requireActiveAdmin():
 * Administrador activo, no eliminado suavemente y con email registrable para autenticarse
 * (active: true, deletedAt: null, email: { not: null }).
 *
 * Esta es la única fuente de verdad para determinar si el sistema admite
 * la creación del primer administrador (OWNER).
 */
let cachedBootstrapStatus: { status: AdminBootstrapStatus; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateAdminBootstrapCache(): void {
  cachedBootstrapStatus = null;
}

export async function getAdminBootstrapStatus(): Promise<AdminBootstrapStatus> {
  const now = Date.now();
  if (process.env.NODE_ENV !== "test" && cachedBootstrapStatus && now < cachedBootstrapStatus.expiresAt) {
    return cachedBootstrapStatus.status;
  }

  try {
    const adminCount = await prisma.adminUser.count({
      where: { active: true, deletedAt: null, email: { not: null } },
    });

    const result: AdminBootstrapStatus = {
      canRegister: adminCount === 0,
      adminCount,
    };

    cachedBootstrapStatus = {
      status: result,
      expiresAt: now + CACHE_TTL_MS,
    };

    return result;
  } catch (error) {
    // Fail-closed por seguridad: ante error de conexión a la base de datos,
    // bloquear el registro público para prevenir exposición indebida.
    console.error("[OS-CAR BOOTSTRAP] Error al consultar administradores:", error);
    return {
      canRegister: false,
      adminCount: -1,
    };
  }
}

