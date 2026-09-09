"use client";

import { forwardRef, useId } from "react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Hard cap on normalized plate length. Chosen to match the backend
 * Zod contract in OS-CAR-ESPECIFICACION-MAESTRA.md §21:
 *   normalizedPlate = ... .pipe(z.string().min(5).max(10) ...)
 * Kept as a named constant (not inlined) so client and any future
 * shared-schema package stay verifiably in sync.
 */
export const PLATE_MAX_LENGTH = 10;
export const PLATE_MIN_LENGTH = 5;
const PLATE_CHAR_PATTERN = /^[A-Z0-9]*$/;

export interface PlateNormalizationResult {
  value: string;
  isValid: boolean;
  /** True once the value is long enough to be judged, false while still typing a short prefix. */
  isComplete: boolean;
}

/**
 * normalizePlate — pure function mirroring the backend's Zod pipeline
 * exactly (trim -> uppercase -> strip whitespace/hyphens -> clamp to
 * 10 chars -> validate against [A-Z0-9]{5,10}). Kept separate from the
 * component so:
 *   1. it is independently unit-testable without React/jsdom, and
 *   2. the component and any server-side pre-check use identical logic,
 *      preventing "looked valid on the client, backend rejected it"
 *      UX gaps.
 */
export function normalizePlate(raw: string): PlateNormalizationResult {
  const stripped = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .slice(0, PLATE_MAX_LENGTH);

  const isComplete = stripped.length >= PLATE_MIN_LENGTH;
  const isValid = isComplete && PLATE_CHAR_PATTERN.test(stripped);

  return { value: stripped, isValid, isComplete };
}

export interface PlateInputProps {
  value: string;
  onChange: (result: PlateNormalizationResult) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Shown only once the field has enough characters to be judged (avoids flashing an error while typing char 1-4). */
  showValidation?: boolean;
}

export const PlateInput = forwardRef<HTMLInputElement, PlateInputProps>(function PlateInput(
  {
    value,
    onChange,
    label = "Patente",
    id,
    disabled,
    className,
    showValidation = true,
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  const result = normalizePlate(value);
  const showError = showValidation && result.isComplete && !result.isValid;

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(normalizePlate(event.target.value));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-[#f9fafb]">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={PLATE_MAX_LENGTH}
        value={result.value}
        onChange={handleChange}
        disabled={disabled}
        aria-invalid={showError ? true : undefined}
        aria-describedby={showError ? errorId : undefined}
        className={cn(
          "min-h-[48px] w-full rounded-md border bg-[#111827] px-3 py-2 font-mono text-lg uppercase tracking-wider text-[#f9fafb]",
          "placeholder:text-[#6b7280] placeholder:tracking-normal placeholder:normal-case",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]",
          showError ? "border-[#ef4444]" : "border-[#374151]",
          className,
        )}
        placeholder="AB123CD"
      />
      {showError ? (
        <p id={errorId} role="alert" className="text-sm text-[#fca5a5]">
          Patente inválida: 5 a 10 caracteres alfanuméricos, sin espacios ni guiones.
        </p>
      ) : null}
    </div>
  );
});
