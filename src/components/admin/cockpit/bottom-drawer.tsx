"use client";

/**
 * OS-CAR Cockpit — ZONA INFERIOR: INVENTARIO & TELEMETRÍA ON-DEMAND.
 * Barra retráctil colapsable (full width, pie del cockpit) + panel expandible
 * que SOLO cubre el workboard (nunca el dock contextual). Alertas oscar-red
 * de reposición de stock y auditoría/cola del Outbox Worker en tiempo real.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  Inbox,
  Minus,
  Package,
  Plus,
  Send,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TechProgressBar } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import { money } from "@/lib/oscar";
import { formatLiveElapsed, type CockpitRole, type InventoryDTO, type TelemetryDTO } from "@/components/admin/cockpit/shared";
import { useNow } from "@/lib/clock";
import type { CockpitPanel } from "@/lib/router";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const OUTBOX_STATUS_META: Record<string, { label: string; tone: string; led: string }> = {
  COMPLETED: { label: "Completados", tone: "text-bay-free border-bay-free/40 bg-bay-free/10", led: "led led-green" },
  PENDING: { label: "Pendientes", tone: "text-oscar-yellow border-oscar-yellow/40 bg-oscar-yellow/10", led: "led led-yellow" },
  PROCESSING: { label: "Procesando", tone: "text-bay-test border-bay-test/40 bg-bay-test/10", led: "led led-cyan" },
  FAILED: { label: "Fallidos", tone: "text-oscar-red border-oscar-red/40 bg-oscar-red/10", led: "led led-red" },
  DEAD_LETTER: { label: "Dead letter", tone: "text-oscar-red border-oscar-red/40 bg-oscar-red/10", led: "led led-red" },
};

export interface BottomDrawerProps {
  role: CockpitRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: CockpitPanel;
  onPanelChange: (panel: CockpitPanel) => void;
}

/* ─────────────── Métricas compartidas (queries deduplicadas por cache-key) ─────────────── */

function useDrawerMetrics(open: boolean) {
  const { data: telemetry } = useQuery({
    queryKey: ["admin-telemetry"],
    queryFn: () => api.get<TelemetryDTO>("/api/admin/telemetry"),
    refetchInterval: 15_000,
  });

  const { data: inventory } = useQuery({
    queryKey: ["admin-inventory", ""],
    queryFn: () => api.get<InventoryDTO>("/api/admin/inventory"),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  const items = inventory?.items ?? [];
  const lowStock = items.filter((i) => i.stockQuantity <= i.reorderPoint);
  const outboxPending = (telemetry?.outbox.byStatus.PENDING ?? 0) + (telemetry?.outbox.byStatus.PROCESSING ?? 0);
  const outboxFailed = (telemetry?.outbox.byStatus.FAILED ?? 0) + (telemetry?.outbox.byStatus.DEAD_LETTER ?? 0);

  return { telemetry, items, lowStock, outboxPending, outboxFailed };
}

function useDrawerAdjust() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; delta: number; note: string }) =>
      api.post(`/api/admin/inventory/${payload.id}/adjust`, { delta: payload.delta, note: payload.note }),
    onSuccess: (_d, v) => {
      toast({
        title: v.delta > 0 ? `+${v.delta} unidad(es) ✔` : `${v.delta} unidad(es) descontadas`,
        description: "Movimiento de ajuste registrado.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
    },
    onError: (e) => toast({ title: "No se pudo ajustar", description: e.message, variant: "destructive" }),
  });
}

/* ─────────────── Panel expandible — vive DENTRO del workboard (no tapa el dock) ─────────────── */

export function CockpitDrawerPanel({ role, open, panel, onPanelChange }: Omit<BottomDrawerProps, "onOpenChange">) {
  const { telemetry, items, lowStock } = useDrawerMetrics(open);
  const adjust = useDrawerAdjust();
  const now = useNow(30_000);

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 overflow-hidden rounded-t-lg border-t bg-carbon-900/98 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-[max-height,opacity,border-color] duration-300 ease-out",
        open ? "max-h-[52%] border-carbon-700 opacity-100" : "max-h-0 border-transparent opacity-0",
      )}
      aria-hidden={!open}
    >
      {/* Mini-tabs */}
      <div className="flex items-center gap-1 border-b border-carbon-800 px-3 pt-2" role="tablist" aria-label="Secciones del panel">
        <button
          role="tab"
          aria-selected={panel === "stock"}
          onClick={() => onPanelChange("stock")}
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide transition-colors",
            panel === "stock"
              ? "border-carbon-800 bg-carbon-900 text-oscar-yellow"
              : "border-transparent text-steel hover:text-titanium",
          )}
        >
          <Package className="size-3.5" aria-hidden /> Stock bajo mínimo
          {lowStock.length > 0 && (
            <span className="rounded-sm border border-oscar-red/50 bg-oscar-red/10 px-1.5 font-mono text-[0.55rem] font-bold text-oscar-red">
              {lowStock.length}
            </span>
          )}
        </button>
        {role === "jefe" && (
          <button
            role="tab"
            aria-selected={panel === "outbox"}
            onClick={() => onPanelChange("outbox")}
            className={cn(
              "flex min-h-9 items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide transition-colors",
              panel === "outbox"
                ? "border-carbon-800 bg-carbon-900 text-oscar-yellow"
                : "border-transparent text-steel hover:text-titanium",
            )}
          >
            <Activity className="size-3.5" aria-hidden /> Outbox worker
            {(telemetry?.outbox.byStatus.FAILED ?? 0) + (telemetry?.outbox.byStatus.DEAD_LETTER ?? 0) > 0 && (
              <span className="rounded-sm border border-oscar-red/50 bg-oscar-red/10 px-1.5 font-mono text-[0.55rem] font-bold text-oscar-red">
                {(telemetry?.outbox.byStatus.FAILED ?? 0) + (telemetry?.outbox.byStatus.DEAD_LETTER ?? 0)}
              </span>
            )}
          </button>
        )}
        <span className="ml-auto pr-1 pb-1.5 font-mono text-[0.55rem] uppercase tracking-widest text-carbon-600">
          poll 15–30s
        </span>
      </div>

      <div className="max-h-[calc(52%-2.75rem)] overflow-y-auto p-3">
        {/* ── Stock bajo mínimo ── */}
        {panel === "stock" && (
          <div className="space-y-2">
            {items.length === 0 && (
              <p className="py-6 text-center font-mono text-xs text-lead">Consultando almacén…</p>
            )}
            {items.length > 0 && lowStock.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-md border border-bay-free/30 bg-bay-free/5 p-6 text-center">
                <Package className="size-7 text-bay-free" aria-hidden />
                <p className="font-display text-sm font-bold uppercase tracking-widest text-bay-free">Stock saludable</p>
                <p className="font-mono text-[0.62rem] text-lead">Ningún SKU está en o bajo su punto de reposición.</p>
              </div>
            )}
            {lowStock.map((item) => {
              const zero = item.stockQuantity === 0;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-md border p-3",
                    zero ? "border-oscar-red/60 bg-oscar-red/10" : "border-oscar-red/30 bg-carbon-950/60",
                  )}
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border", zero ? "border-oscar-red/50 text-oscar-red" : "border-carbon-700 text-steel")}>
                    <AlertTriangle className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="truncate text-sm text-titanium">
                      <span className="font-mono text-xs font-bold text-oscar-yellow">{item.sku}</span> — {item.description}
                    </p>
                    <p className="font-mono text-[0.6rem] text-lead">
                      {item.location ? `Ubic. ${item.location} · ` : ""}costo {item.unitCost != null ? money(item.unitCost) : "—"}
                    </p>
                    <div className="mt-1.5 max-w-56">
                      <TechProgressBar
                        value={item.stockQuantity}
                        max={Math.max(item.reorderPoint * 2, 1)}
                        tone={zero ? "red" : item.stockQuantity <= item.reorderPoint / 2 ? "red" : "yellow"}
                      />
                    </div>
                  </div>
                  <span className={cn("shrink-0 font-mono text-xs font-bold tabular-nums", zero ? "text-oscar-red" : "text-oscar-yellow")}>
                    {item.stockQuantity}/{item.reorderPoint}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="carbon"
                      size="icon-sm"
                      aria-label={`Restar 1 a ${item.sku}`}
                      disabled={adjust.isPending || item.stockQuantity === 0}
                      onClick={() => adjust.mutate({ id: item.id, delta: -1, note: "Ajuste desde cockpit" })}
                    >
                      <Minus className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      variant="carbon"
                      size="icon-sm"
                      aria-label={`Sumar 1 a ${item.sku}`}
                      disabled={adjust.isPending}
                      onClick={() => adjust.mutate({ id: item.id, delta: 1, note: "Ajuste desde cockpit" })}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-1"
                      disabled={adjust.isPending}
                      onClick={() => adjust.mutate({ id: item.id, delta: Math.max(5, item.reorderPoint), note: "Reposición rápida desde cockpit" })}
                    >
                      Reponer {Math.max(5, item.reorderPoint)}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Outbox worker ── */}
        {panel === "outbox" && telemetry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Object.entries(telemetry.outbox.byStatus).map(([status, count]) => {
                const meta = OUTBOX_STATUS_META[status] ?? { label: status, tone: "border-carbon-700 text-steel", led: "led led-off" };
                return (
                  <div key={status} className={cn("rounded-md border p-2.5", meta.tone)}>
                    <p className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-widest opacity-80">
                      <span className={meta.led} aria-hidden /> {meta.label}
                    </p>
                    <p className="display-impact mt-0.5 text-lg tabular-nums">{count}</p>
                  </div>
                );
              })}
              <div className="rounded-md border border-carbon-800 p-2.5 text-titanium">
                <p className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-widest text-lead">
                  <Timer className="size-3" aria-hidden /> Latencia worker
                </p>
                <p className="display-impact mt-0.5 text-lg tabular-nums">{Math.round(telemetry.outbox.avgLatencyMs)} ms</p>
              </div>
              <div className="rounded-md border border-carbon-800 p-2.5 text-titanium">
                <p className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-widest text-lead">
                  <Database className="size-3" aria-hidden /> Latencia BD
                </p>
                <p className="display-impact mt-0.5 text-lg tabular-nums">{Math.round(telemetry.dbLatencyMs)} ms</p>
              </div>
              <div className="rounded-md border border-carbon-800 p-2.5 text-titanium">
                <p className="flex items-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-widest text-lead">
                  <Send className="size-3" aria-hidden /> Reintentos prom.
                </p>
                <p className="display-impact mt-0.5 text-lg tabular-nums">{Math.round(telemetry.outbox.avgAttempts * 10) / 10}</p>
              </div>
            </div>

            <div>
              <p className="label-tech mb-2 flex items-center gap-1.5">
                <Activity className="size-3" aria-hidden /> Cola de eventos del worker — en vivo
              </p>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {telemetry.eventStream.length === 0 && (
                  <p className="py-4 text-center font-mono text-xs text-lead">Sin eventos en la cola.</p>
                )}
                {telemetry.eventStream.slice(0, 14).map((ev, i) => {
                  const meta = OUTBOX_STATUS_META[ev.status] ?? { led: "led led-off" };
                  return (
                    <div key={i} className="flex items-center gap-2.5 rounded-md border border-carbon-800 bg-carbon-950/60 px-2.5 py-1.5">
                      <span className={meta.led} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-mono text-[0.62rem] text-steel">
                        {ev.eventType.replaceAll("_", " ")}
                      </span>
                      {ev.lastError && (
                        <span className="max-w-40 truncate font-mono text-[0.55rem] text-oscar-red" title={ev.lastError}>
                          {ev.lastError}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[0.55rem] tabular-nums text-lead" suppressHydrationWarning>
                        {formatLiveElapsed(now, ev.at)} atrás · {ev.attempts}x
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {panel === "outbox" && !telemetry && (
          <div className="flex items-center justify-center gap-2 py-8 font-mono text-xs text-lead">
            <Inbox className="size-4 animate-pulse text-oscar-yellow" aria-hidden /> consultando telemetría…
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Barra colapsada — pie full-width del cockpit ─────────────── */

export function CockpitBottomDrawer({ role, open, onOpenChange, panel, onPanelChange }: BottomDrawerProps) {
  const { telemetry, lowStock, outboxPending, outboxFailed } = useDrawerMetrics(open);

  return (
    <footer className="relative z-20 shrink-0 border-t border-carbon-800 bg-carbon-950" aria-label="Inventario y telemetría on-demand">
      <button
        onClick={() => onOpenChange(!open)}
        className="flex h-11 w-full items-center gap-3 px-3 transition-colors hover:bg-carbon-900/60 sm:px-4"
        aria-expanded={open}
        aria-label={open ? "Colapsar panel de inventario y telemetría" : "Expandir panel de inventario y telemetría"}
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-oscar-yellow" aria-hidden /> : <ChevronUp className="size-4 shrink-0 text-oscar-yellow" aria-hidden />}
        <span className="shrink-0 font-display text-xs font-bold uppercase tracking-widest text-steel">
          Inventario <span className="text-carbon-600">&</span> Telemetría
        </span>

        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-wider",
              lowStock.length > 0 ? "border-oscar-red/50 bg-oscar-red/10 text-oscar-red" : "border-bay-free/40 bg-bay-free/10 text-bay-free",
            )}
          >
            <AlertTriangle className="size-3" aria-hidden /> reponer {lowStock.length}
          </span>
          {role === "jefe" && (
            <>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-wider",
                  outboxFailed > 0 ? "border-oscar-red/50 bg-oscar-red/10 text-oscar-red" : "border-carbon-700 text-steel",
                )}
              >
                outbox {outboxPending} pend
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 rounded border border-carbon-700 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-steel sm:flex">
                bd {telemetry ? `${Math.round(telemetry.dbLatencyMs)}ms` : "…"}
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 rounded border border-carbon-700 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-steel md:flex">
                aprobación {telemetry ? `${Math.round(telemetry.approvals.approvalRate * 100)}%` : "…"}
              </span>
            </>
          )}
        </div>

        <span className="hidden shrink-0 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-carbon-600 lg:inline">
          OS-CAR cockpit v2
        </span>
      </button>
    </footer>
  );
}
