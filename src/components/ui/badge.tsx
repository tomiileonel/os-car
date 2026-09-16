import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge OS-CAR — indicadores estilo tablero automotriz.
 * Se agregan variantes técnicas: led (luz + texto), yellow, alert.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-oscar-yellow text-carbon-950 font-display font-bold uppercase tracking-wider [a&]:hover:bg-oscar-yellow-hover",
        secondary:
          "border-carbon-700 bg-carbon-800 text-steel font-mono uppercase tracking-wider",
        destructive:
          "border-oscar-red/50 bg-oscar-red/15 text-oscar-red font-display font-bold uppercase tracking-wider",
        outline:
          "border-carbon-700 text-steel [a&]:hover:bg-carbon-800",
        yellow:
          "border-oscar-yellow/45 bg-oscar-yellow/10 text-oscar-yellow",
        red:
          "border-oscar-red/45 bg-oscar-red/10 text-oscar-red",
        green:
          "border-bay-free/40 bg-bay-free/10 text-bay-free",
        cyan:
          "border-bay-test/40 bg-bay-test/10 text-bay-test",
        tech:
          "border-carbon-800 bg-carbon-900 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-steel",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type BadgeTone = "neutral" | "info" | "warning" | "success" | "danger" | "muted";

const TONE_TO_VARIANT: Record<BadgeTone, "secondary" | "cyan" | "yellow" | "green" | "destructive" | "outline"> = {
  neutral: "secondary",
  info: "cyan",
  warning: "yellow",
  success: "green",
  danger: "destructive",
  muted: "outline",
};

export type OrderStatus =
  | "INGRESADO"
  | "DIAGNOSTICO"
  | "ESPERANDO_REPARACION"
  | "EN_REPARACION"
  | "CONTROL"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADA";

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

const ORDER_STATUS_VARIANT: Record<OrderStatus, "secondary" | "cyan" | "yellow" | "green" | "destructive" | "outline"> = {
  INGRESADO: "secondary",
  DIAGNOSTICO: "cyan",
  ESPERANDO_REPARACION: "yellow",
  EN_REPARACION: "cyan",
  CONTROL: "yellow",
  LISTO: "green",
  ENTREGADO: "secondary",
  CANCELADA: "destructive",
};

function Badge({
  className,
  variant,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    tone?: BadgeTone;
  }) {
  const Comp = asChild ? Slot : "span";
  const resolvedVariant = variant ?? (tone ? TONE_TO_VARIANT[tone] : undefined) ?? "default";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  );
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}): React.JSX.Element {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status] ?? "secondary"} className={className}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function AdminRoleBadge({
  role,
  className,
}: {
  role: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Badge variant="secondary" className={className}>
      {role === "ADMIN" ? "Administrador" : role}
    </Badge>
  );
}

export { Badge, badgeVariants };
