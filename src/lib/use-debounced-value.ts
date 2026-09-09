"use client";

import { useEffect, useState } from "react";

/**
 * useDebouncedValue — returns `value` re-emitted only after `delayMs`
 * of quiescence. Standard leading-edge-suppressed debounce via
 * setTimeout; cancels the pending timer on unmount or on a new value
 * arriving before the delay elapses.
 *
 * Does not itself cancel in-flight network requests — pair with
 * AbortController in the calling effect, keyed off the debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
