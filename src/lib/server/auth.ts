/**
 * OS-CAR — Sesiones de administración.
 * Passwords: scrypt (formato "salt:hash" hex, idéntico a prisma/seed.ts).
 * Cookie `oscar_session`: base64url(`${adminId}.${hmacSHA256(adminId, SECRET)}`).
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { AdminUser } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "./http";

const SESSION_SECRET = process.env.OSCAR_SESSION_SECRET ?? "oscar-taller-dev-secret-2026";

export const SESSION_COOKIE_NAME = "oscar_session";
export const SESSION_MAX_AGE = 8 * 60 * 60; // 8 horas

/** Hash scrypt con formato "salt:hash" (compatible con el seed). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/** Verifica un password contra "salt:hash" con comparación de tiempo constante. */
export function verifyPassword(password: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator <= 0) return false;
  const salt = stored.slice(0, separator);
  const hex = stored.slice(separator + 1);
  const expected = Buffer.from(hex, "hex");
  if (expected.length === 0) return false;
  const computed = scryptSync(password, salt, expected.length);
  return expected.length === computed.length && timingSafeEqual(expected, computed);
}

function sign(adminId: string): string {
  return createHmac("sha256", SESSION_SECRET).update(adminId, "utf8").digest("hex");
}

/** Token de sesión: base64url(`${adminId}.${hmac}`). */
export function createSessionToken(adminId: string): string {
  return Buffer.from(`${adminId}.${sign(adminId)}`, "utf8").toString("base64url");
}

/** Verifica firma y devuelve el adminId, o null si el token es inválido. */
export function verifySessionToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;
    const adminId = raw.slice(0, dot);
    const signature = raw.slice(dot + 1);
    const expected = Buffer.from(sign(adminId), "utf8");
    const received = Buffer.from(signature, "utf8");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    return adminId;
  } catch {
    return null;
  }
}

/** Lee la cookie de sesión, valida el HMAC y devuelve el AdminUser activo (o null). */
export async function getSessionAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const adminId = verifySessionToken(token);
  if (!adminId) return null;
  const admin = await db.adminUser.findFirst({ where: { id: adminId, active: true } });
  return admin ?? null;
}

/** Exige sesión admin válida; si no, lanza HttpError 401 UNAUTHORIZED. */
export async function requireAdmin(): Promise<{ admin: AdminUser }> {
  const admin = await getSessionAdmin();
  if (!admin) {
    throw new HttpError(401, "UNAUTHORIZED", "Necesitás iniciar sesión para usar el panel del taller.");
  }
  return { admin };
}
