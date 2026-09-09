/**
 * OS-CAR · Gate G6 — Debounce declarativo (OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * Soporte de la búsqueda reactiva del Mostrador Rápido de Recepción.
 */
"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue<TValue>(value: TValue, delayMs = 300): TValue {
  const [debounced, setDebounced] = useState<TValue>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
