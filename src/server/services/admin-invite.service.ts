import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { auth, INTERNAL_SIGNUP_HEADER } from "~/lib/auth";
import { recordAuditEvent } from "@/server/audit/audit.service";
import {
  DomainConflictException,
  ForbiddenException,
  ValidationException,
} from "@/shared/errors";
import { inviteAdminSchema, type InviteAdminCommand } from "@/shared/schemas/admin-invite";
import { type CanonicalAdminRole } from "@/server/auth/active-admin";

export interface InviteAdminResult {
  adminUserId: string;
  email: string;
  displayName: string;
  role: CanonicalAdminRole;
  /**
   * Contraseña provisoria en texto plano, devuelta UNA sola vez a quien
   * invita para que se la comunique al nuevo admin por un canal fuera de
   * banda (no queda persistida en ningún lado más que el hash de Better
   * Auth). El invitado debe cambiarla en su primer login.
   */
  temporaryPassword: string;
}

export interface InviteAdminActor {
  adminId: string;
  workshopId: string;
  role: CanonicalAdminRole;
}

const ROLES_ALLOWED_TO_INVITE: readonly CanonicalAdminRole[] = ["OWNER", "TALLER_SUPERVISOR"];

function generateTemporaryPassword(): string {
  // 24 bytes -> 32 chars base64url, suficiente entropía para una
  // contraseña provisoria de un solo uso que se descarta tras el primer
  // cambio de contraseña obligatorio.
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Crea un nuevo administrador del taller:
 *  1. Valida que quien invita tenga rol habilitado (OWNER/TALLER_SUPERVISOR).
 *  2. Da de alta el user en Better Auth vía auth.api.signUpEmail,
 *     pasando el header interno que el hook de lib/auth.ts exige — este
 *     es el único punto del código que conoce ese header.
 *  3. Vincula un AdminUser de Prisma al authUserId recién creado, dentro
 *     de la misma operación lógica, y registra auditoría.
 *
 * Si el paso 3 falla después de que Better Auth ya creó el user, el
 * usuario Better Auth queda huérfano (sin AdminUser). Se documenta como
 * límite conocido: Better Auth no participa de la transacción de Prisma
 * porque usa su propio pool de conexión. Mitigación: el catch intenta
 * limpiar el user recién creado antes de repropagar el error.
 */
export async function inviteAdmin(
  actor: InviteAdminActor,
  rawCommand: InviteAdminCommand
): Promise<InviteAdminResult> {
  if (!ROLES_ALLOWED_TO_INVITE.includes(actor.role)) {
    throw new ForbiddenException(
      "FORBIDDEN_TO_INVITE",
      "Solo OWNER o TALLER_SUPERVISOR pueden invitar nuevos administradores."
    );
  }

  const command = inviteAdminSchema.parse(rawCommand);

  if (command.workshopId !== actor.workshopId) {
    throw new ValidationException(
      "WORKSHOP_MISMATCH",
      "No se puede invitar administradores fuera del taller del actor."
    );
  }

  const existing = await prisma.adminUser.findFirst({
    where: { workshopId: command.workshopId, email: command.email, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new DomainConflictException(
      "DOMAIN_CONFLICT",
      "Ya existe un administrador activo con ese email en este taller.",
      409,
      { specificCode: "ADMIN_EMAIL_ALREADY_INVITED" }
    );
  }

  const temporaryPassword = generateTemporaryPassword();

  const signUpResult = await auth.api.signUpEmail({
    body: { name: command.displayName, email: command.email, password: temporaryPassword },
    headers: new Headers({ [INTERNAL_SIGNUP_HEADER]: process.env.BETTER_AUTH_SECRET ?? "" }),
  });

  if (!signUpResult?.user?.id) {
    throw new Error(
      "AUTH_SIGNUP_FAILED: Better Auth no devolvió un usuario válido al crear la cuenta del administrador."
    );
  }

  const authUserId = signUpResult.user.id;

  try {
    const adminUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.adminUser.create({
        data: {
          workshopId: command.workshopId,
          authUserId,
          displayName: command.displayName,
          email: command.email,
          role: command.role,
          active: true,
          // null intencional: señala "nunca cambió su contraseña
          // provisoria". El primer signIn con esta contraseña debe forzar
          // el flujo de cambio antes de permitir cualquier otra acción.
          passwordChangedAt: null,
        },
      });

      await recordAuditEvent(tx, {
        workshopId: command.workshopId,
        actorId: actor.adminId,
        actorType: "ADMIN",
        action: "ADMIN_INVITED",
        entityType: "ADMIN_USER",
        entityId: created.id,
        afterState: { email: command.email, role: command.role, displayName: command.displayName },
      });

      return created;
    });

    return {
      adminUserId: adminUser.id,
      email: command.email,
      displayName: command.displayName,
      role: command.role,
      temporaryPassword,
    };
  } catch (error) {
    // El AdminUser no se pudo crear: el user de Better Auth queda
    // huérfano. Lo eliminamos para no dejar una cuenta que nunca podrá
    // pasar requireActiveAdmin (ADMIN_INACTIVE eterno) pero que sí
    // consume el email único.
    await prisma.$executeRaw`DELETE FROM "user" WHERE id = ${authUserId}`.catch(() => {
      // Best-effort: si esto también falla, queda un user huérfano que
      // requiere limpieza manual. Se prioriza no enmascarar el error
      // original.
    });
    throw error;
  }
}
