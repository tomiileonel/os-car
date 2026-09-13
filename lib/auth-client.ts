import { createAuthClient } from "better-auth/react";

function getClientBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getClientBaseUrl(),
});

// `signUp` se excluye deliberadamente de este export. El registro
// público libre de usuarios está deshabilitado: la inicialización se gestiona
// por el servicio de bootstrap server-side (src/server/services/admin-register.service.ts)
// o por script administrativo (scripts/create-admin.ts).
export const { signIn, signOut, useSession } = authClient;
