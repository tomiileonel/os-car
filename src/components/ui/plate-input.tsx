/**
 * OS-CAR · Gate G6 — PlateInput (Design System Stitch, OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Input de patente argentina/Mercosur con normalización idéntica al contrato
 * Zod del backend (Especificación §21): mayúsculas, sin espacios ni guiones,
 * 5..10 caracteres alfanuméricos. Validación visual inmediata y feedback
 * accesible (aria-invalid + mensajes de estado).
 */
"use client";

import { Input } from "@/components/ui/input";

export const PLATE_MIN_LENGTH = 5;
export const PLATE_MAX_LENGTH = 10;
export const PLATE_PATTERN = /^[A-Z0-9]+$/;

/** Normaliza al contrato del backend: mayúsculas, sin espacios/guiones, máx. 10. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "").slice(0, PLATE_MAX_LENGTH);
}

/** Validez de contrato (idéntica al pipe Zod de §21). */
export function isValidPlate(value: string): boolean {
  return (
    value.length >= PLATE_MIN_LENGTH &&
    value.length <= PLATE_MAX_LENGTH &&
    PLATE_PATTERN.test(value)
  );
}

/** Formato argentino histórico: ABC123. */
export function isLegacyArgentinePlate(value: string): boolean {
  return /^[A-Z]{3}[0-9]{3}$/.test(value);
}

/** Formato Mercosur: AB123CD / AB123CDE. */
export function isMercosurPlate(value: string): boolean {
  return /^[A-Z]{2}[0-9]{3}[A-Z]{2,3}$/.test(value);
}

export type PlateValidity = "empty" | "incomplete" | "valid";

export function getPlateValidity(value: string): PlateValidity {
  if (value.length === 0) return "empty";
  return isValidPlate(value) ? "valid" : "incomplete";
}

export interface PlateInputProps {
  id?: string | undefined;
  name?: string | undefined;
  label?: string | undefined;
  /** Valor SIEMPRE normalizado (controlado por el padre). */
  value: string;
  /** Recibe el valor ya normalizado (mayúsculas, sin espacios/guiones). */
  onChange: (normalized: string) => void;
  onBlur?: (() => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
  hint?: string | undefined;
  required?: boolean | undefined;
}

export function PlateInput({
  id,
  name,
  label = "Patente",
  value,
  onChange,
  onBlur,
  placeholder = "ABC123 · AB123CDE",
  disabled,
  autoFocus,
  hint,
  required,
}: PlateInputProps) {
  const validity = getPlateValidity(value);

  const errorMessage =
    validity === "incomplete"
      ? `Patente incompleta: faltan ${PLATE_MIN_LENGTH - value.length} caracteres.`
      : undefined;

  const successMessage =
    validity === "valid"
      ? isMercosurPlate(value)
        ? "Formato Mercosur válido."
        : isLegacyArgentinePlate(value)
          ? "Formato argentino válido."
          : "Formato válido."
      : undefined;

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        name={name}
        label={label}
        mono
        value={value}
        onChange={(event) => onChange(normalizePlate(event.target.value))}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        maxLength={PLATE_MAX_LENGTH}
        error={errorMessage}
        hint={hint ?? "Se normaliza automáticamente: mayúsculas, sin espacios ni guiones."}
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
      />
      {successMessage ? (
        <p className="text-xs font-medium text-emerald-400" role="status">
          {successMessage}
        </p>
      ) : null}
    </div>
  );
}
