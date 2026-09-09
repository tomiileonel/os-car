"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Ties this field to its error via aria-describedby + aria-invalid. */
  errorMessage?: string | undefined;
  hint?: string | undefined;
  id?: string | undefined;
  containerClassName?: string | undefined;
}

/**
 * Input — labeled text field with error/hint wiring.
 *
 * Accessibility contract:
 * - `label` is always rendered as a real <label htmlFor>, never
 *   placeholder-only (placeholder text disappears on input and fails
 *   WCAG 1.3.1 / 3.3.2 for anyone who loses their place).
 * - aria-invalid is set exactly when errorMessage is present.
 * - aria-describedby points at the error node when present, else the
 *   hint node when present, else is omitted (never an empty string,
 *   which some screen readers mis-announce as "describes: nothing").
 * - 48px minimum touch target height per ui-system/SKILL.md (workshop
 *   tablet ergonomics — gloved fingers, dirty screens).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, errorMessage, hint, id, containerClassName, className, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy = errorMessage ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={inputId} className="text-sm font-medium text-[#f9fafb]">
        {label}
      </label>
      <input
        {...inputProps}
        ref={ref}
        id={inputId}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-[48px] w-full rounded-md border bg-[#111827] px-3 py-2 text-base text-[#f9fafb]",
          "placeholder:text-[#6b7280]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
          errorMessage ? "border-[#ef4444]" : "border-[#374151]",
          className,
        )}
      />
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-[#fca5a5]">
          {errorMessage}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-[#9ca3af]">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
