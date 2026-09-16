"use client";

/**
 * Logo OS-CAR — Recreación vectorial del isotipo del taller.
 * Badge horizontal motorsport: 3 íconos (Check Engine · Termómetro · Aceitera)
 * sobre líneas de velocidad, "TALLER MECÁNICO" y "OS-CAR" con stroke negro.
 */
import { cn } from "@/lib/utils";

export function OscarLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <svg viewBox="0 0 64 64" className={cn("h-10 w-10", className)} role="img" aria-label="OS-CAR">
        <rect x="2" y="2" width="60" height="60" rx="10" fill="#0A0B0E" stroke="#FFE600" strokeWidth="3" />
        <path d="M14 46 L26 46 L30 38 L42 38 L46 30 L52 30 L52 46 L46 52 L20 52 L14 46 Z" fill="#FFE600" stroke="#0A0B0E" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 20 l5 5 l9 -11" fill="none" stroke="#0A0B0E" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 20 l5 5 l9 -11" fill="none" stroke="#FFE600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 460 130" className={cn("h-auto w-full max-w-md", className)} role="img" aria-label="Taller Mecánico OS-CAR">
      <defs>
        <linearGradient id="oscar-yg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF66B" />
          <stop offset="55%" stopColor="#FFE600" />
          <stop offset="100%" stopColor="#D9BC00" />
        </linearGradient>
      </defs>

      {/* Líneas de velocidad */}
      <g stroke="#FFE600" strokeWidth="4" strokeLinecap="round" opacity="0.9">
        <line x1="8" y1="30" x2="52" y2="30" />
        <line x1="2" y1="44" x2="34" y2="44" />
        <line x1="12" y1="58" x2="44" y2="58" />
      </g>
      <g stroke="#F8FAFC" strokeWidth="2.5" strokeLinecap="round" opacity="0.55">
        <line x1="418" y1="34" x2="456" y2="34" />
        <line x1="428" y1="48" x2="456" y2="48" />
      </g>

      {/* Íconos de taller */}
      <g transform="translate(60,14)">
        {/* Check Engine */}
        <g>
          <rect x="0" y="4" width="46" height="34" rx="5" fill="url(#oscar-yg)" stroke="#0A0B0E" strokeWidth="3" />
          <path d="M9 31 L15 31 L18 24 L29 24 L32 18 L38 18 L38 31 L34 35 L13 35 Z" fill="#0A0B0E" opacity="0.9" />
          <path d="M11 13 l4 4 l7 -8" fill="none" stroke="#0A0B0E" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x="23" y="46" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fontWeight="700" fill="#94A3B8" letterSpacing="0.5">CHECK ENG.</text>
        </g>
        {/* Termómetro */}
        <g transform="translate(66,0)">
          <rect x="10" y="2" width="10" height="28" rx="5" fill="none" stroke="#0A0B0E" strokeWidth="3" />
          <rect x="13" y="8" width="4" height="18" rx="2" fill="#FF1E27" />
          <circle cx="15" cy="33" r="7" fill="#FF1E27" stroke="#0A0B0E" strokeWidth="3" />
          <g stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round">
            <line x1="24" y1="7" x2="29" y2="7" />
            <line x1="24" y1="14" x2="29" y2="14" />
            <line x1="24" y1="21" x2="29" y2="21" />
          </g>
          <text x="16" y="46" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fontWeight="700" fill="#94A3B8">TEMP</text>
        </g>
        {/* Aceitera */}
        <g transform="translate(128,4)">
          <path d="M4 26 L10 14 L24 12 L34 15 L34 22 L26 24 L26 26 Z" fill="#FF1E27" stroke="#0A0B0E" strokeWidth="3" strokeLinejoin="round" />
          <path d="M10 14 L2 10 L6 5 L14 10 Z" fill="#FF1E27" stroke="#0A0B0E" strokeWidth="3" strokeLinejoin="round" />
          <rect x="26" y="16" width="4" height="6" rx="1" fill="#F8FAFC" />
          <path d="M28 24 c0 3 -4 3 -4 0 c0 -2 4 -6 4 -6 c0 0 4 4 4 6 c0 3 -4 3 -4 0" fill="#FF1E27" stroke="#0A0B0E" strokeWidth="2" />
          <text x="19" y="46" textAnchor="middle" fontFamily="monospace" fontSize="7.5" fontWeight="700" fill="#94A3B8">OIL</text>
        </g>
      </g>

      {/* Marca */}
      <text
        x="230"
        y="88"
        textAnchor="middle"
        fontFamily="var(--font-saira), 'Saira Condensed', sans-serif"
        fontSize="17"
        fontWeight="700"
        fontStyle="italic"
        fill="#F8FAFC"
        stroke="#0A0B0E"
        strokeWidth="4"
        paintOrder="stroke"
        letterSpacing="6"
      >
        TALLER MECÁNICO
      </text>
      <text
        x="230"
        y="123"
        textAnchor="middle"
        fontFamily="var(--font-saira), 'Saira Condensed', sans-serif"
        fontSize="46"
        fontWeight="800"
        fill="url(#oscar-yg)"
        stroke="#0A0B0E"
        strokeWidth="8"
        paintOrder="stroke"
        letterSpacing="4"
      >
        OS-CAR
      </text>
    </svg>
  );
}
