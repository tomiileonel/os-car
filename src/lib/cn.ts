/**
 * cn — composes className fragments without external dependencies
 * (no clsx/tailwind-merge). Accepts strings, falsy values, and objects
 * mapping class -> boolean.
 *
 * Deliberately does NOT deduplicate conflicting Tailwind utilities
 * (that requires tailwind-merge's parsing table). Callers are
 * responsible for not passing conflicting utility pairs; this only
 * handles conditional composition.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  for (const input of inputs) {
    if (!input && input !== 0) continue;

    if (typeof input === "string" || typeof input === "number") {
      const str = String(input).trim();
      if (str) out.push(str);
      continue;
    }

    if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
      continue;
    }

    if (typeof input === "object") {
      for (const key in input) {
        if (Object.prototype.hasOwnProperty.call(input, key) && input[key]) {
          out.push(key);
        }
      }
    }
  }

  return out.join(" ");
}
