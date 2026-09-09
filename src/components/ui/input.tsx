/**
 * OS-CAR · Gate G6 — Input (Design System Stitch, OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Densidad compacta industrial: alto fijo, borde definido, foco visible,
 * estados error/deshabilitado accesibles (aria-invalid + aria-describedby).
 * `mono` activa tipografía monoespaciada para patentes/VIN/teléfonos/IDs.
 */
"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  mono?: boolean | undefined;
  containerClassName?: string | undefined;
}

export function Input({
  label,
  hint,
  error,
  mono = false,
  containerClassName,
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-widest text-zinc-400"
        >
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "h-11 w-full rounded-sm border bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-600",
          "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[#090d16]",
          mono ? "font-mono uppercase tracking-widest" : "",
          error
            ? "border-red-500 focus:border-red-400 focus:ring-red-500/60"
            : "border-zinc-600 focus:border-sky-400 focus:ring-sky-400/60",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-400">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
