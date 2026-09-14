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
import {
  getAdminBootstrapStatus,
  invalidateAdminBootstrapCache,
} from "./admin-bootstrap.service";
import { withSerializableRetry } from "./order-calculation.service";
import type { CanonicalAdminRole } from "@/server/auth/active-admin";

export interface AdminRegisterResult {
  adminUserId: string;
  email: string;
  displayName: string;
  role: CanonicalAdminRole;
}

/**
 * Compensación defensiva: elimina ÚNICAMENTE el registro recién creado en Better Auth
 * si la transacción relacional posterior en Prisma falla.
 *
 * Garantías de seguridad:
 * 1. Aislamiento estricto: la purga está condicionada por igualdad exacta al authUserId
 *    generado durante esta operación específica.
 * 2. No afecta a otros usuarios, administradores ni sesiones ajenas.
 * 3. Se invoca única y exclusivamente si Better Auth ya creó la cuenta y Prisma falló.
 * 4. Manejo de fallos en cascada: si la compensación falla, se emite un registro de error
 *    estructurado con telemetría de seguridad sin enmascarar la excepción original.
 */
async function compensateOrphanBetterAuthUser(authUserId: string): Promise<void> {
  if (!authUserId || typeof authUserId !== "string" || authUserId.trim() === "") {
    return;
  }

  try {
    await prisma.$executeRaw`DELETE FROM "session" WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM "account" WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM "user" WHERE id = ${authUserId}`;
  } catch (compensationError) {
    // Registro forense estructurado sin filtrar contraseñas ni secretos
    console.error("[CRITICAL_AUTH_COMPENSATION_FAILED]", {
      message: "Fallo al ejecutar la compensación de cuenta huérfana en Better Auth tras error en Prisma.",
      targetAuthUserId: authUserId,
      error: compensationError instanceof Error ? compensationError.message : String(compensationError),
      timestamp: new Date().toISOString(),
    });
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
 *    falla, se ejecuta una compensación inmediata estrictamente acotada al
 *    authUserId devuelto por Better Auth.
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

  // 4. Registrar en Better Auth usando el header interno de seguridad
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
    const adminUser = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Re-verificación atómica bajo aislamiento SERIALIZABLE para prevenir carreras TOCTOU
          const existingAdmins = await tx.adminUser.count({
            where: { active: true, deletedAt: null, email: { not: null } },
          });
          if (existingAdmins > 0) {
            throw new ForbiddenException(
              "REGISTRATION_CLOSED",
              "El registro administrativo está deshabilitado. Ya existe una cuenta de administrador configurada."
            );
          }

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
        },
        { isolationLevel: "Serializable" }
      )
    );

    invalidateAdminBootstrapCache();

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


