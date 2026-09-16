"use client";

/**
 * Kit OS-CAR — Piezas visuales compartidas de la cabina del taller.
 */
import type { ReactNode } from "react";
import { Loader2, Inbox, AlertTriangle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_META, formatPlateDisplay, type OrderStatus } from "@/lib/oscar";

/* ─────────── Badge de estado tipo indicador de tablero ─────────── */

export function StatusBadge({ status, className, withIcon = true }: { status: OrderStatus; className?: string; withIcon?: boolean }) {
  const meta = ORDER_STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em]",
        meta.tone,
        className,
      )}
    >
      {withIcon && <Icon className="size-3.5" aria-hidden />}
      {meta.label}
    </span>
  );
}

/* ─────────── Patente de exhibición ─────────── */

export function PlateBadge({ plate, size = "md", className }: { plate: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "plate-mercosur inline-flex items-center justify-center font-bold",
        size === "sm" && "min-w-[4.5rem] px-2 py-1 text-xs",
        size === "md" && "min-w-[5.5rem] px-2.5 py-1 text-sm",
        size === "lg" && "min-w-[8rem] px-4 py-1.5 text-xl",
        className,
      )}
    >
      {formatPlateDisplay(plate)}
    </span>
  );
}

/* ─────────── Encabezado de sección instrumental ─────────── */

export function SectionHeader({
  kicker,
  title,
  icon: Icon,
  right,
  className,
}: {
  kicker?: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {kicker && <p className="label-tech mb-1">{kicker}</p>}
        <h2 className="display-impact flex items-center gap-2.5 text-xl text-titanium sm:text-2xl">
          {Icon && (
            <span className="grid size-8 place-items-center rounded-md border border-oscar-yellow/30 bg-oscar-yellow/10 text-oscar-yellow">
              <Icon className="size-4.5" aria-hidden />
            </span>
          )}
          {title}
        </h2>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/* ─────────── Tile KPI de tablero ─────────── */

export function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "yellow" | "red" | "green" | "cyan";
  className?: string;
}) {
  const tones = {
    default: "border-carbon-800 text-titanium",
    yellow: "border-oscar-yellow/35 text-oscar-yellow",
    red: "border-oscar-red/40 text-oscar-red",
    green: "border-bay-free/35 text-bay-free",
    cyan: "border-bay-test/35 text-bay-test",
  } as const;
  return (
    <div className={cn("bevel clip-corner-sm flex items-center gap-2.5 rounded-lg p-3 sm:gap-3 sm:p-4", tones[tone], className)}>
      {Icon && (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border bg-carbon-950/60 max-sm:size-8", tones[tone])}>
          <Icon className="size-4.5 max-sm:size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="label-tech truncate">{label}</p>
        <p className="display-impact mt-0.5 text-[1.06rem] leading-none tracking-normal sm:text-2xl">{value}</p>
        {sub && <p className="mt-1 truncate font-mono text-[0.65rem] text-lead">{sub}</p>}
      </div>
    </div>
  );
}

/* ─────────── Medidor de combustible ─────────── */

export function FuelGauge({ level, className }: { level: string; className?: string }) {
  const bars = { VACIO: 0, CUARTO: 1, MITAD: 2, TRES_CUARTOS: 3, LLENO: 4 }[level] ?? 2;
  return (
    <div className={cn("flex items-end gap-1", className)} aria-label={`Combustible: ${level}`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-2.5 rounded-[2px] border border-carbon-700 transition-colors",
            i === 4 ? "h-5" : i === 3 ? "h-4" : i === 2 ? "h-3" : "h-2",
            i <= bars ? (bars === 1 ? "bg-oscar-red" : "bg-oscar-yellow") : "bg-carbon-800",
          )}
        />
      ))}
    </div>
  );
}

/* ─────────── Estados de carga / error / vacío ─────────── */

export function LoadingBlock({ label = "Sincronizando con el taller…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-carbon-700 bg-carbon-900/40 p-10 text-center">
      <Loader2 className="size-7 animate-spin text-oscar-yellow" aria-hidden />
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-steel">{label}</p>
    </div>
  );
}

export function ErrorBlock({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-oscar-red/40 bg-oscar-red/10 p-8 text-center">
      <AlertTriangle className="size-7 text-oscar-red" aria-hidden />
      <p className="max-w-md text-sm text-titanium/90">{message}</p>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, icon: Icon = Inbox }: { title: string; hint?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-carbon-700 bg-carbon-900/40 p-10 text-center">
      <Icon className="size-8 text-lead" aria-hidden />
      <p className="font-display text-sm font-bold uppercase tracking-wider text-steel">{title}</p>
      {hint && <p className="max-w-sm text-xs text-lead">{hint}</p>}
    </div>
  );
}

/* ─────────── Cinta ticker de taller ─────────── */

export function WorkshopTicker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-carbon-800 bg-carbon-900" role="marquee" aria-label="Novedades del taller">
      <div className="animate-ticker flex w-max items-center gap-10 py-1.5 pl-4">
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-2.5 whitespace-nowrap font-mono text-[0.65rem] uppercase tracking-[0.18em] text-steel">
            <Wrench className="size-3 text-oscar-yellow" aria-hidden />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────── Barra de progreso técnica ─────────── */

export function TechProgressBar({
  value,
  max,
  tone = "yellow",
  className,
  label,
}: {
  value: number;
  max: number;
  tone?: "yellow" | "red" | "green" | "cyan";
  className?: string;
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const tones = { yellow: "bg-oscar-yellow", red: "bg-oscar-red", green: "bg-bay-free", cyan: "bg-bay-test" } as const;
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1 flex items-baseline justify-between font-mono text-[0.65rem] text-steel">
          <span className="uppercase tracking-widest">{label}</span>
          <span className="tabular-nums">{Math.round(value)}/{Math.round(max)}</span>
        </div>
      )}
      <div className="tech-grid-fine h-2.5 overflow-hidden rounded-sm border border-carbon-700 bg-carbon-950">
        <div
          className={cn("h-full rounded-[2px] transition-[width] duration-500", tones[tone])}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
