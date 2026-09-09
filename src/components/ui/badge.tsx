import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Canonical OrderStatus enum, mirrored from the Prisma schema in
 * OS-CAR-ESPECIFICACION-MAESTRA.md §18. Kept as a literal union here
 * (not imported from @prisma/client) so this component has no
 * dependency on generated Prisma types — it is a pure presentation
 * primitive that a Server Component can pass a string into.
 */
export type OrderStatus =
  | "INGRESADO"
  | "DIAGNOSTICO"
  | "ESPERANDO_REPARACION"
  | "EN_REPARACION"
  | "CONTROL"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADA";

/** Canonical AdminRole. MVP has a single aggregated role per spec §04/§16. */
export type AdminRole = "ADMIN";

type BadgeTone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  INGRESADO: "Ingresado",
  DIAGNOSTICO: "Diagnóstico",
  ESPERANDO_REPARACION: "Esperando reparación",
  EN_REPARACION: "En reparación",
  CONTROL: "Control",
  LISTO: "Listo",
  ENTREGADO: "Entregado",
  CANCELADA: "Cancelada",
};

const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  INGRESADO: "neutral",
  DIAGNOSTICO: "info",
  ESPERANDO_REPARACION: "warning",
  EN_REPARACION: "info",
  CONTROL: "warning",
  LISTO: "success",
  ENTREGADO: "muted",
  CANCELADA: "danger",
};

const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  ADMIN: "Administrador",
};

// Tokens from .agents/skills/ui-system/SKILL.md — dark, high-contrast,
// workshop-tablet palette. Reused verbatim rather than reinvented.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-[#1f2937] text-[#f9fafb] border-[#374151]",
  info: "bg-[#1d3a5f] text-[#bfdbfe] border-[#2563eb]",
  warning: "bg-[#4a3510] text-[#fde68a] border-[#f59e0b]",
  success: "bg-[#0f3d2e] text-[#86efac] border-[#10b981]",
  danger: "bg-[#4a1414] text-[#fca5a5] border-[#ef4444]",
  muted: "bg-[#111827] text-[#9ca3af] border-[#374151]",
};

interface BaseBadgeProps {
  className?: string | undefined;
  children?: ReactNode | undefined;
}

function BaseBadge({
  tone,
  className,
  children,
}: BaseBadgeProps & { tone: BadgeTone }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium leading-none",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <BaseBadge tone={ORDER_STATUS_TONE[status]} className={className}>
      {ORDER_STATUS_LABEL[status]}
    </BaseBadge>
  );
}

export function AdminRoleBadge({
  role,
  className,
}: {
  role: AdminRole;
  className?: string | undefined;
}): React.JSX.Element {
  return (
    <BaseBadge tone="neutral" className={className}>
      {ADMIN_ROLE_LABEL[role]}
    </BaseBadge>
  );
}

/** Generic escape hatch for badges that aren't OrderStatus/AdminRole. */
export function Badge({
  tone = "neutral",
  className,
  children,
}: BaseBadgeProps & { tone?: BadgeTone | undefined }): React.JSX.Element {
  return (
    <BaseBadge tone={tone} className={className}>
      {children}
    </BaseBadge>
  );
}
