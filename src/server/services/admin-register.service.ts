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
import { getAdminBootstrapStatus } from "./admin-bootstrap.service";

export interface AdminRegisterResult {
  adminUserId: string;
  email: string;
  displayName: string;
  role: CanonicalAdminRole;
}

/**
 * Compensación defensiva: elimina cualquier registro huérfano de Better Auth
 * si la transacción relacional de Prisma falla.
 */
async function compensateOrphanBetterAuthUser(authUserId: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM "session" WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM "account" WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM "user" WHERE id = ${authUserId}`;
  } catch {
    // Best-effort de compensación: no enmascarar el error original de la operación
  }
}

/**
 * Registra la primera cuenta administrativa (bootstrap condicionado):
 *
 * 1. Regla de seguridad de bootstrap:
 *    Se consulta canónicamente getAdminBootstrapStatus().
 *    Si canRegister === false (ya existe ≥1 administrador activo), se rechaza
 *    incondicionalmente con 403 Forbidden.
 * 2. Atomicidad y mitigación de estados parciales:
 *    Better Auth y Prisma no comparten la misma conexión transaccional.
 *    Si el alta en Better Auth prospera pero la creación del AdminUser en Prisma
 *    falla, se ejecuta una compensación inmediata que purga el usuario creado
 *    en las tablas de Better Auth, impidiendo cuentas huérfanas que bloqueen
 *    reintentos o consuman el email único.
 * 3. autoSignIn: false:
 *    Garantiza que el registro nunca emita sesión automática. El usuario
 *    debe iniciar sesión explícitamente en /admin/login.
 */
export async function registerAdmin(
  rawCommand: AdminRegisterCommand
): Promise<AdminRegisterResult> {
  const command = adminRegisterSchema.parse(rawCommand);

  // 1. Validar el estado canónico de bootstrap
  const bootstrapStatus = await getAdminBootstrapStatus();
  if (!bootstrapStatus.canRegister) {
    throw new ForbiddenException(
      "REGISTRATION_CLOSED",
      "El registro administrativo está deshabilitado. Ya existe una cuenta de administrador configurada."
    );
  }

  // 2. Resolver el taller activo
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

  // 3. Comprobar duplicado en la capa de administradores
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

  // 4. Limpieza preventiva de cuentas huérfanas previas en Better Auth con este email
  // (evita que un fallo previo de red en DB bloquee el bootstrap del primer dueño)
  try {
    const orphanUsers = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "user" WHERE email = ${command.email}
    `;
    for (const orphan of orphanUsers) {
      await compensateOrphanBetterAuthUser(orphan.id);
    }
  } catch {
    // Si la tabla no existe o la query falla, continuar normalmente
  }

  // 5. Registrar en Better Auth usando el header interno de seguridad
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

  // 6. Crear AdminUser en Prisma dentro de una transacción con auditoría
  try {
    const adminUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.adminUser.create({
        data: {
          workshopId: workshop.id,
          authUserId,
          displayName: command.displayName,
          email: command.email,
          role: "OWNER",
          active: true,
          passwordChangedAt: new Date(),
        },
      });

      await recordAuditEvent(tx, {
        workshopId: workshop.id,
        actorId: created.id,
        actorType: "ADMIN",
        action: "ADMIN_BOOTSTRAPPED",
        entityType: "ADMIN_USER",
        entityId: created.id,
        afterState: {
          email: command.email,
          role: "OWNER",
          displayName: command.displayName,
          isBootstrap: true,
        },
      });

      return created;
    });

    return {
      adminUserId: adminUser.id,
      email: command.email,
      displayName: command.displayName,
      role: "OWNER",
    };
  } catch (error) {
    // Compensación obligatoria ante fallo relacional
    await compensateOrphanBetterAuthUser(authUserId);
    throw error;
  }
}


