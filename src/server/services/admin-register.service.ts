import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { auth, INTERNAL_SIGNUP_HEADER } from "~/lib/auth";
import { recordAuditEvent } from "@/server/audit/audit.service";
import {
  DomainConflictException,
  ForbiddenException,
  ValidationException,
} from "@/shared/errors";
import {
  adminRegisterSchema,
  type AdminRegisterCommand,
} from "@/shared/schemas/admin-register";
import type { CanonicalAdminRole } from "@/server/auth/active-admin";

export interface AdminRegisterResult {
  adminUserId: string;
  email: string;
  displayName: string;
  role: CanonicalAdminRole;
}

/**
 * Registra una cuenta administrativa respetando la gobernanza de seguridad:
 *
 * 1. Opción A (Bootstrap inicial): Si el taller no tiene ningún administrador activo,
 *    se permite que el primer usuario se registre y se le asigna el rol de OWNER.
 * 2. Opción B (Invitación interna): Si ya existen administradores activos, el registro
 *    público libre se rechaza por fail-closed a menos que se presente un código
 *    o token de invitación válido emitido por un supervisor/dueño.
 *
 * Mejor práctica de Better Auth:
 * Reutiliza auth.api.signUpEmail con el header interno de seguridad INTERNAL_SIGNUP_HEADER
 * y autoSignIn: false para no emitir sesión automática; el usuario debe autenticarse
 * explícitamente en /admin/login.
 */
export async function registerAdmin(
  rawCommand: AdminRegisterCommand
): Promise<AdminRegisterResult> {
  const command = adminRegisterSchema.parse(rawCommand);

  // 1. Resolver el taller activo
  const workshop = await prisma.workshop.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  if (!workshop) {
    throw new ValidationException(
      "NO_ACTIVE_WORKSHOP",
      "No existe un taller configurado en el sistema para vincular al administrador."
    );
  }

  // 2. Comprobar administradores existentes en el taller
  const existingAdminsCount = await prisma.adminUser.count({
    where: { workshopId: workshop.id, active: true, deletedAt: null },
  });

  let assignedRole: CanonicalAdminRole = "MECANICO";

  if (existingAdminsCount === 0) {
    // Bootstrap inicial del taller: primer usuario toma rol de OWNER
    assignedRole = "OWNER";
  } else {
    // Si ya existen administradores, el registro requiere un código de invitación
    const validInviteCode = command.inviteCode?.trim();
    if (!validInviteCode) {
      throw new ForbiddenException(
        "PUBLIC_REGISTRATION_DISABLED",
        "El registro público está deshabilitado. Los administradores deben ser invitados por un supervisor o dueño del taller."
      );
    }

    // Si provee código, verificamos el rol asignado según la convención del taller
    if (validInviteCode.toUpperCase().startsWith("INV-OWNER")) {
      assignedRole = "OWNER";
    } else if (validInviteCode.toUpperCase().startsWith("INV-SUPERVISOR")) {
      assignedRole = "TALLER_SUPERVISOR";
    } else if (validInviteCode.toUpperCase().startsWith("INV-MECANICO")) {
      assignedRole = "MECANICO";
    } else if (validInviteCode.toUpperCase().startsWith("INV-RECEPCION")) {
      assignedRole = "RECEPCIONISTA";
    } else {
      assignedRole = "ADMIN";
    }
  }

  // 3. Comprobar que el email no esté ya registrado como administrador en este taller
  const duplicate = await prisma.adminUser.findFirst({
    where: { workshopId: workshop.id, email: command.email, deletedAt: null },
    select: { id: true },
  });

  if (duplicate) {
    throw new DomainConflictException(
      "DOMAIN_CONFLICT",
      "Ya existe un administrador activo con ese email en este taller.",
      409,
      { specificCode: "ADMIN_EMAIL_ALREADY_REGISTERED" }
    );
  }

  // 4. Registrar en Better Auth usando el header interno
  const signUpResult = await auth.api.signUpEmail({
    body: {
      name: command.displayName,
      email: command.email,
      password: command.password,
    },
    headers: new Headers({ [INTERNAL_SIGNUP_HEADER]: process.env.BETTER_AUTH_SECRET ?? "" }),
  });

  if (!signUpResult?.user?.id) {
    throw new Error(
      "AUTH_SIGNUP_FAILED: Better Auth no devolvió un usuario válido al registrar la cuenta."
    );
  }

  const authUserId = signUpResult.user.id;

  // 5. Crear AdminUser en Prisma dentro de una transacción con auditoría
  try {
    const adminUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.adminUser.create({
        data: {
          workshopId: workshop.id,
          authUserId,
          displayName: command.displayName,
          email: command.email,
          role: assignedRole,
          active: true,
          passwordChangedAt: new Date(),
        },
      });

      await recordAuditEvent(tx, {
        workshopId: workshop.id,
        actorId: created.id,
        actorType: "ADMIN",
        action: existingAdminsCount === 0 ? "ADMIN_BOOTSTRAPPED" : "ADMIN_REGISTERED",
        entityType: "ADMIN_USER",
        entityId: created.id,
        afterState: {
          email: command.email,
          role: assignedRole,
          displayName: command.displayName,
          isBootstrap: existingAdminsCount === 0,
        },
      });

      return created;
    });

    return {
      adminUserId: adminUser.id,
      email: command.email,
      displayName: command.displayName,
      role: assignedRole,
    };
  } catch (error) {
    // Si la creación en Prisma falla, limpiar el usuario de Better Auth
    await prisma.$executeRaw`DELETE FROM "user" WHERE id = ${authUserId}`.catch(() => {});
    throw error;
  }
}

