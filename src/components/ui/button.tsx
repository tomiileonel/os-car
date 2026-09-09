"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Announced to screen readers while loading; visible label is preserved but hidden from AT. */
  loadingLabel?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8] border-transparent",
  secondary: "bg-[#1f2937] text-[#f9fafb] hover:bg-[#273244] border-[#374151]",
  outline: "bg-transparent text-[#f9fafb] hover:bg-[#1f2937] border-[#374151]",
  ghost: "bg-transparent text-[#f9fafb] hover:bg-[#1f2937] border-transparent",
  danger: "bg-[#ef4444] text-white hover:bg-[#dc2626] border-transparent",
};

function Spinner(): React.JSX.Element {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/**
 * Button — industrial dark-theme button, min 48x48px touch target
 * (ui-system/SKILL.md), 5 variants, accessible loading state.
 *
 * Loading contract: when `loading`, the button is disabled (prevents
 * duplicate submits — relevant for the intake form hitting a
 * non-idempotent POST without a client-generated Idempotency-Key),
 * the spinner is aria-hidden, and an sr-only live region announces
 * `loadingLabel` so screen reader users get feedback the sighted
 * spinner already conveys visually.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    loading = false,
    loadingLabel = "Procesando",
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border px-4 py-2",
        "text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d16]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      <span>{children}</span>
      {loading ? <span className="sr-only" role="status">{loadingLabel}</span> : null}
    </button>
  );
});
