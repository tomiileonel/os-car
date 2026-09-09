/**
 * OS-CAR · Gate G6 — Badge (Design System Stitch, OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Estética industrial: dark mode de alta densidad, bordes definidos,
 * tipografía monoespaciada en mayúsculas. Variantes semánticas para
 * estados de orden (OrderStatus) y roles administrativos canónicos (F-01).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const BADGE_VARIANTS = ["warning", "success", "error", "neutral", "accent"] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  warning: "border-amber-400/70 bg-amber-400/10 text-amber-300",
  success: "border-emerald-400/70 bg-emerald-400/10 text-emerald-300",
  error: "border-red-500/70 bg-red-500/10 text-red-300",
  neutral: "border-zinc-500/70 bg-zinc-500/10 text-zinc-300",
  accent: "border-sky-400/70 bg-sky-400/10 text-sky-300",
};

export interface BadgeProps {
  variant?: BadgeVariant | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function Badge({ variant = "neutral", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Mapas semánticos: estados de orden (OrderStatus)                           */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUSES = [
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
  "CANCELADA",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ORDER_STATUS_VARIANT_MAP: Record<OrderStatus, BadgeVariant> = {
  INGRESADO: "accent",
  DIAGNOSTICO: "accent",
  ESPERANDO_REPARACION: "warning",
  EN_REPARACION: "accent",
  CONTROL: "warning",
  LISTO: "success",
  ENTREGADO: "success",
  CANCELADA: "error",
};

export function getOrderStatusVariant(status: string): BadgeVariant {
  if ((ORDER_STATUSES as readonly string[]).includes(status)) {
    return ORDER_STATUS_VARIANT_MAP[status as OrderStatus];
  }
  return "neutral";
}

/* -------------------------------------------------------------------------- */
/* Mapas semánticos: roles canónicos (remediación F-01, schema.prisma)        */
/* -------------------------------------------------------------------------- */

export const ADMIN_ROLES = [
  "OWNER",
  "TALLER_SUPERVISOR",
  "ADMIN",
  "MECANICO",
  "RECEPCIONISTA",
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ADMIN_ROLE_VARIANT_MAP: Record<AdminRole, BadgeVariant> = {
  OWNER: "accent",
  TALLER_SUPERVISOR: "accent",
  ADMIN: "accent",
  MECANICO: "neutral",
  RECEPCIONISTA: "success",
};

export function getAdminRoleVariant(role: string): BadgeVariant {
  if ((ADMIN_ROLES as readonly string[]).includes(role)) {
    return ADMIN_ROLE_VARIANT_MAP[role as AdminRole];
  }
  return "neutral";
}
