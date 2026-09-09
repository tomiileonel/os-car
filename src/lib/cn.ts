/**
 * OS-CAR · Gate G6 — Composición de clases (OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Reemplazo cero-dependencias de clsx/class-variance-authority.
 * Mantiene el bundle liviano y sin librerías de terceros.
 */

export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}
