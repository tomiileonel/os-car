"use client";

/**
 * OS-CAR Cockpit — ZONA SUPERIOR: Heads-Up Display.
 * Ticker de estado del taller, omnisearch universal (Ctrl+K),
 * selector de rol/perspectiva y reloj vivo del taller.
 */
import type { ComponentType } from "react";
import { Activity, CarFront, CircleDot, LogOut, Search, Timer, TrendingUp } from "lucide-react";
import { OscarLogo } from "@/components/oscar/logo";
import { formatClock, ROLE_META, type CockpitRole } from "@/components/admin/cockpit/shared";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";

interface TickerChipProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  led?: string;
  tone?: "default" | "yellow" | "red" | "green" | "cyan";
  title?: string;
}

function TickerChip({ icon: Icon, label, value, led, tone = "default", title }: TickerChipProps) {
  const tones = {
    default: "text-titanium",
    yellow: "text-oscar-yellow",
    red: "text-oscar-red",
    green: "text-bay-free",
    cyan: "text-bay-test",
  } as const;
  return (
    <span
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md border border-carbon-800 bg-carbon-900/70 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em]",
        tones[tone],
      )}
    >
      {led && <span className={led} aria-hidden />}
      <Icon className="size-3.5 opacity-70" aria-hidden />
      <span className="text-lead">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

export interface HudProps {
  role: CockpitRole;
  onRoleChange: (role: CockpitRole) => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  /* Telemetría del taller (ya consultada por el orquestador). */
  baysTotal: number;
  baysOccupied: number;
  waitingParts: number;
  pendingApprovals: number;
  tiresInCustody: number;
  todayBilling: number | null;
  activeOrders: number;
}

export function CockpitHud({
  role,
  onRoleChange,
  onOpenSearch,
  onLogout,
  baysTotal,
  baysOccupied,
  waitingParts,
  pendingApprovals,
  tiresInCustody,
  todayBilling,
  activeOrders,
}: HudProps) {
  const now = useNow(1000);
  const nowClock = formatClock(now);

  const occupancyTone = baysTotal > 0 && baysOccupied >= baysTotal ? "red" : baysOccupied >= baysTotal * 0.75 ? "yellow" : "green";
  const occupancyLed =
    occupancyTone === "red" ? "led led-red" : occupancyTone === "yellow" ? "led led-yellow" : "led led-green";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-carbon-800 bg-carbon-950/97 backdrop-blur-md" aria-label="Barra de telemetría y control rápido">
      <div className="h-0.5 diag-stripes" aria-hidden />

      {/* Fila principal */}
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        {/* Identidad */}
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => onOpenSearch()}
            className="grid size-9 shrink-0 place-items-center rounded-md transition-transform hover:scale-105 sm:hidden"
            aria-label="Búsqueda universal"
          >
            <OscarLogo compact className="size-9" />
          </button>
          <span className="hidden sm:grid sm:size-10 sm:place-items-center">
            <OscarLogo compact className="size-10" />
          </span>
          <div className="min-w-0 leading-none">
            <p className="display-impact truncate text-base text-oscar-yellow">OS-CAR</p>
            <p className="label-tech hidden sm:block">Centro de mando</p>
          </div>
        </div>

        {/* Omnisearch trigger */}
        <button
          onClick={onOpenSearch}
          className="group ml-1 flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-carbon-700 bg-carbon-900/80 px-3 text-left transition-colors hover:border-oscar-yellow/50 hover:bg-carbon-800 md:max-w-lg"
          aria-label="Abrir búsqueda universal (Ctrl+K)"
        >
          <Search className="size-4 shrink-0 text-lead transition-colors group-hover:text-oscar-yellow" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-lead group-hover:text-steel">
            Buscar patente, cliente, orden, SKU o rack…
          </span>
          <kbd className="hidden shrink-0 rounded border border-carbon-700 bg-carbon-950 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-steel sm:inline" aria-hidden>
            Ctrl K
          </kbd>
        </button>

        {/* Selector de rol / perspectiva */}
        <div
          className="hidden shrink-0 rounded-md border border-carbon-700 bg-carbon-900/80 p-1 sm:flex"
          role="group"
          aria-label="Selector de perspectiva de rol"
        >
          {(Object.keys(ROLE_META) as CockpitRole[]).map((r) => {
            const meta = ROLE_META[r];
            const Icon = meta.icon;
            const active = role === r;
            return (
              <button
                key={r}
                onClick={() => onRoleChange(r)}
                aria-pressed={active}
                title={meta.sub}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-sm px-3 font-display text-xs font-bold uppercase tracking-wide transition-all",
                  active ? "bg-oscar-yellow text-carbon-950" : "text-steel hover:bg-carbon-800 hover:text-titanium",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden lg:inline">{meta.title}</span>
              </button>
            );
          })}
        </div>

        {/* Reloj vivo */}
        <div className="hidden shrink-0 items-center gap-2 rounded-md border border-carbon-800 bg-carbon-900/70 px-3 py-1.5 md:flex" aria-label="Hora del taller">
          <span className="led led-yellow" aria-hidden />
          <span className="font-mono text-sm font-bold tabular-nums text-oscar-yellow" suppressHydrationWarning>
            {nowClock}
          </span>
        </div>

        {/* Sesión */}
        <button
          onClick={onLogout}
          className="grid size-11 shrink-0 place-items-center rounded-md border border-carbon-700 text-steel transition-colors hover:border-oscar-red/50 hover:text-oscar-red"
          aria-label="Cerrar sesión y volver al portal"
        >
          <LogOut className="size-4.5" aria-hidden />
        </button>
      </div>

      {/* Ticker de estado del taller */}
      <div
        className="no-scrollbar flex items-center gap-2 overflow-x-auto border-t border-carbon-800/80 bg-carbon-900/40 px-3 py-1.5 sm:px-4"
        aria-label="Ticker de estado del taller"
      >
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] text-lead sm:hidden">
          <span className="led led-yellow" aria-hidden /> {nowClock}
        </span>
        <TickerChip
          icon={CarFront}
          label="Elevadores"
          value={`${baysOccupied}/${baysTotal || 6}`}
          led={occupancyLed}
          tone={occupancyTone as TickerChipProps["tone"]}
          title={`Ocupación de elevadores y fosas: ${baysOccupied} de ${baysTotal}`}
        />
        <TickerChip
          icon={Timer}
          label="Cuello botella"
          value={String(waitingParts)}
          led={waitingParts >= 3 ? "led led-red" : waitingParts > 0 ? "led led-yellow" : "led led-green"}
          tone={waitingParts >= 3 ? "red" : waitingParts > 0 ? "yellow" : "green"}
          title="Órdenes esperando repuesto / aprobación para reparar"
        />
        <TickerChip
          icon={Activity}
          label="Aprob. pend."
          value={String(pendingApprovals)}
          led={pendingApprovals > 0 ? "led led-yellow" : "led led-green"}
          tone={pendingApprovals > 0 ? "yellow" : "green"}
          title="Presupuestos publicados esperando decisión del cliente"
        />
        <TickerChip
          icon={CircleDot}
          label="Neumáticos"
          value={String(tiresInCustody)}
          tone="cyan"
          title="Sets de neumáticos en custodia activa del hotel"
        />
        {role === "jefe" ? (
          <TickerChip
            icon={TrendingUp}
            label="Factur. jornada"
            value={todayBilling == null ? "…" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", notation: "compact", maximumFractionDigits: 1 }).format(todayBilling)}
            tone="green"
            title="Facturación estimada de la jornada (órdenes abiertas hoy)"
          />
        ) : (
          <TickerChip
            icon={WrenchChipIcon}
            label="Órdenes activas"
            value={String(activeOrders)}
            tone="yellow"
            title="Vehículos actualmente en proceso del taller"
          />
        )}
        <span className="ml-auto hidden shrink-0 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-carbon-600 lg:inline" aria-hidden>
          Cockpit unificado · 1 bahías · 2 recepción · 3 órdenes · Ctrl+K buscar
        </span>
      </div>
    </header>
  );
}

/** Ícono local para no duplicar import de Wrench en el ticker de piso. */
function WrenchChipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
