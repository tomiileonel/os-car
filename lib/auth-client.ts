import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

// `signUp` se excluye deliberadamente de este export. El auto-registro
// público está deshabilitado: los admins se crean por invitación
// server-side (ver src/server/services/admin-invite.service.ts) o por el
// script de bootstrap (scripts/create-admin.mjs). Exponer signUp del
// cliente permitiría a cualquier visitante crear una cuenta Better Auth
// sin vínculo a un AdminUser, lo cual además es engañoso porque
// requireActiveAdmin la rechazaría igual (ADMIN_INACTIVE).
export const { signIn, signOut, useSession } = authClient;
