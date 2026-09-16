/**
 * OS-CAR — POST /api/admin/auth/logout
 * Cierra la sesión administrativa (borra la cookie).
 */
import { ok, handleApiError } from "@/lib/server/http";
import { SESSION_COOKIE_NAME } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const response = ok({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
