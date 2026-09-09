/**
 * OS-CAR · Gate G6 — Button (Design System Stitch, OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Botón industrial de alta densidad, bordes definidos, estado de carga
 * y variantes accesibles (primary, secondary, outline, ghost, danger).
 */
"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const BUTTON_VARIANTS = ["primary", "secondary", "outline", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold border-transparent focus:ring-sky-400/60 shadow-sm",
  secondary:
    "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700 focus:ring-zinc-400/60",
  outline:
    "bg-transparent hover:bg-zinc-800 text-zinc-200 border-zinc-700 focus:ring-zinc-400/60",
  ghost:
    "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-transparent focus:ring-zinc-400/60",
  danger:
    "bg-red-600 hover:bg-red-500 text-white border-transparent focus:ring-red-400/60",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm border font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#090d16]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
