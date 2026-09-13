// src/shared/schemas/admin-invite.ts
import { z } from "zod";
import { CANONICAL_ADMIN_ROLES } from "@/server/auth/active-admin";

/**
 * Roles que un OWNER/TALLER_SUPERVISOR puede asignar al invitar.
 * Se excluye deliberadamente nada por ahora: cualquier rol canónico es
 * asignable por quien ya tiene rol de administración de personal.
 * La restricción de "quién puede invitar" vive en el service, no acá.
 */
export const inviteAdminSchema = z
  .object({
    workshopId: z.string().cuid(),
    email: z.string().trim().toLowerCase().email().max(254),
    displayName: z.string().trim().min(2).max(120),
    role: z.enum(CANONICAL_ADMIN_ROLES),
  })
  .strict();

export type InviteAdminCommand = z.infer<typeof inviteAdminSchema>;
