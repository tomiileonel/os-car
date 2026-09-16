"use client";

/**
 * OS-CAR Cockpit — ZONA CENTRAL: TABLERO DE ACCIÓN DINÁMICO.
 * [1] Bahías en vivo · [2] Cola de recepción & ingreso express · [3] Kanban
 * del pipeline de producción (7 estados del workflow).
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CarFront,
  ChevronRight,
  CircleDot,
  ClipboardList,
  DoorOpen,
  FolderKanban,
  Hourglass,
  Inbox,
  MapPin,
  Timer,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlateBadge, StatusBadge, TechProgressBar } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import {
  formatLiveElapsed,
  liveMinutes,
  bayLed,
  BAY_KIND_LABELS,
  moneyCompact,
  type BayDTO,
  type CockpitRole,
  type OrderRowDTO,
} from "@/components/admin/cockpit/shared";
import { ORDER_STATUS_FLOW, ORDER_STATUS_META, elapsedSince } from "@/lib/oscar";
import type { CockpitTab } from "@/lib/router";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ─────────────────────────── Barra de pestañas ─────────────────────────── */

const TABS: { id: CockpitTab; label: string; icon: typeof CarFront; key: string }[] = [
  { id: "bahias", label: "Bahías en vivo", icon: CarFront, key: "1" },
  { id: "recepcion", label: "Recepción", icon: ClipboardList, key: "2" },
  { id: "ordenes", label: "Pipeline", icon: FolderKanban, key: "3" },
];

export interface WorkboardProps {
  role: CockpitRole;
  tab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  now: number;
  bays: BayDTO[];
  waiting: OrderRowDTO[];
  orders: OrderRowDTO[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOpenQuickIntake: () => void;
  todayIntakes: number | null;
  pendingApprovals: number | null;
  /** Overlay anclado al fondo del workboard (drawer retráctil) — nunca tapa el dock. */
  overlay?: ReactNode;
}

export function CockpitWorkboard({
  role,
  tab,
  onTabChange,
  now,
  bays,
  waiting,
  orders,
  selectedOrderId,
  onSelectOrder,
  onOpenQuickIntake,
  todayIntakes,
  pendingApprovals,
  overlay,
}: WorkboardProps) {
  const visibleTabs = TABS.filter((t) => role === "jefe" || t.id !== "recepcion");

  return (
    <section className="relative flex min-w-0 flex-1 flex-col" aria-label="Tablero de acción dinámico">
      {/* Pestañas ergonómicas de perfil bajo */}
      <div
        className="flex shrink-0 items-center gap-1 border-b border-carbon-800 bg-carbon-950/60 px-3 pt-2 sm:px-4"
        role="tablist"
        aria-label="Cuadrantes del tablero"
      >
        {visibleTabs.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          const badge =
            t.id === "bahias"
              ? `${bays.filter((b) => b.current).length}/${bays.length}`
              : t.id === "recepcion"
                ? String(waiting.length)
                : String(orders.filter((o) => o.status !== "ENTREGADO" && o.status !== "CANCELADA").length);
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.id)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-t-md border border-b-0 px-3.5 py-2 font-display text-sm font-bold uppercase tracking-wide transition-all sm:px-4",
                active
                  ? "border-carbon-800 bg-carbon-900 text-oscar-yellow"
                  : "border-transparent text-steel hover:bg-carbon-900/60 hover:text-titanium",
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.id === "bahias" ? "Bahías" : t.id === "recepcion" ? "Fila" : "Pipeline"}</span>
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-px font-mono text-[0.58rem] tabular-nums",
                  active ? "border-oscar-yellow/40 bg-oscar-yellow/10 text-oscar-yellow" : "border-carbon-700 text-lead",
                )}
              >
                {badge}
              </span>
              <kbd
                className="ml-1 hidden rounded border border-carbon-700 bg-carbon-950 px-1 font-mono text-[0.55rem] text-lead lg:inline"
                aria-hidden
              >
                {t.key}
              </kbd>
            </button>
          );
        })}
        <div className="ml-auto hidden items-center gap-3 pb-2 pr-1 font-mono text-[0.58rem] uppercase tracking-widest text-carbon-600 xl:flex">
          <span className="flex items-center gap-1"><span className="led led-green" aria-hidden /> libre</span>
          <span className="flex items-center gap-1"><span className="led led-yellow" aria-hidden /> proceso</span>
          <span className="flex items-center gap-1"><span className="led led-red" aria-hidden /> repuesto</span>
          <span className="flex items-center gap-1"><span className="led led-cyan" aria-hidden /> control</span>
        </div>
      </div>

      {/* Contenido del cuadrante */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-carbon-900/30 p-3 sm:p-4" role="tabpanel">
        {tab === "bahias" && (
          <BaysGrid bays={bays} now={now} selectedOrderId={selectedOrderId} onSelectOrder={onSelectOrder} />
        )}
        {tab === "recepcion" && (
          <ReceptionQueue
            waiting={waiting}
            bays={bays}
            selectedOrderId={selectedOrderId}
            onSelectOrder={onSelectOrder}
            onOpenQuickIntake={onOpenQuickIntake}
            todayIntakes={todayIntakes}
            pendingApprovals={pendingApprovals}
          />
        )}
        {tab === "ordenes" && (
          <OrdersKanban
            orders={orders}
            role={role}
            selectedOrderId={selectedOrderId}
            onSelectOrder={onSelectOrder}
          />
        )}
      </div>

      {/* Overlay inferior del workboard (drawer de inventario/telemetría) */}
      {overlay}
    </section>
  );
}

/* ─────────────────────────── [1] Bahías en vivo ─────────────────────────── */

function BaysGrid({
  bays,
  now,
  selectedOrderId,
  onSelectOrder,
}: {
  bays: BayDTO[];
  now: number;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assignBay, setAssignBay] = useState<BayDTO | null>(null);

  const release = useMutation({
    mutationFn: (bay: BayDTO) => api.post(`/api/admin/bays/${bay.id}/release`, { reason: "Liberada desde el cockpit" }),
    onSuccess: (_d, bay) => {
      toast({ title: `Bahía ${bay.code} liberada`, description: "Disponible para el próximo vehículo." });
      queryClient.invalidateQueries({ queryKey: ["admin-bays"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast({ title: "No se pudo liberar", description: e.message, variant: "destructive" }),
  });

  if (bays.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-carbon-700 p-10 text-center">
        <div>
          <Activity className="mx-auto size-8 text-lead" aria-hidden />
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-lead">Sincronizando bahías…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {bays.map((bay) => {
          const led = bayLed(bay);
          const current = bay.current;
          const selected = !!current && current.orderId === selectedOrderId;
          const elapsedMin = current ? liveMinutes(now, current.assignedAt) : 0;
          const overTime =
            !!current && current.estimatedMinutes > 0 && elapsedMin > current.estimatedMinutes * 1.25;

          return (
            <article
              key={bay.id}
              className={cn(
                "bevel clip-corner-sm relative flex flex-col rounded-lg transition-colors",
                led.tone,
                selected && "border-oscar-yellow shadow-[0_0_0_1px_rgba(255,230,0,0.45)]",
                overTime && "glow-red",
                current ? "cursor-pointer hover:border-oscar-yellow/60" : "",
              )}
              onClick={() => current && onSelectOrder(current.orderId)}
              role={current ? "button" : undefined}
              tabIndex={current ? 0 : undefined}
              onKeyDown={(e) => {
                if (current && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelectOrder(current.orderId);
                }
              }}
              aria-label={current ? `Bahía ${bay.code}: ${current.orderNumber}, abrir ficha` : `Bahía ${bay.code} libre`}
            >
              {/* Cabecera */}
              <header className="flex items-center justify-between gap-2 border-b border-carbon-800 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md border border-carbon-700 bg-carbon-950 font-display text-base font-bold text-titanium">
                    {bay.code}
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate font-mono text-[0.58rem] uppercase tracking-[0.16em] text-lead">
                      {BAY_KIND_LABELS[bay.kind] ?? bay.kind}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.62rem] font-bold tracking-wider text-steel">
                      <span className={led.led} aria-hidden /> {led.label}
                    </p>
                  </div>
                </div>
                {current ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="hidden font-mono text-[0.65rem] font-bold tabular-nums text-oscar-yellow sm:inline" suppressHydrationWarning>
                      {formatLiveElapsed(now, current.assignedAt)}
                    </span>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Liberar bahía ${bay.code}`}
                      title="Liberar bahía"
                      onClick={(e) => {
                        e.stopPropagation();
                        release.mutate(bay);
                      }}
                      disabled={release.isPending}
                    >
                      <DoorOpen className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="carbon"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignBay(bay);
                    }}
                  >
                    <CarFront className="size-3.5" aria-hidden /> Asignar
                  </Button>
                )}
              </header>

              {/* Cuerpo */}
              {current ? (
                <div className="flex flex-1 flex-col gap-2.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <PlateBadge plate={current.plate} size="md" />
                    <ChevronRight
                      className={cn("size-4 shrink-0", selected ? "text-oscar-yellow" : "text-lead")}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-titanium">{current.vehicle}</p>
                    <p className="truncate font-mono text-[0.6rem] text-lead">
                      {current.orderNumber} · {current.mechanic ?? "sin mecánico"}
                    </p>
                  </div>

                  <StatusBadge status={current.status} withIcon={false} />

                  {/* Cronómetro vs estimado */}
                  <div className="rounded-md border border-carbon-800 bg-carbon-950/60 p-2.5">
                    <div className="mb-1 flex items-center justify-between font-mono text-[0.62rem]">
                      <span className="flex items-center gap-1.5 text-steel">
                        <Timer className="size-3" aria-hidden /> en bahía {formatLiveElapsed(now, current.assignedAt)}
                      </span>
                      <span className={cn("tabular-nums", overTime ? "font-bold text-oscar-red" : "text-steel")}>
                        est. {current.estimatedMinutes > 0 ? `${Math.round((current.estimatedMinutes / 60) * 10) / 10} h` : "—"}
                      </span>
                    </div>
                    <TechProgressBar
                      value={elapsedMin}
                      max={Math.max(current.estimatedMinutes, elapsedMin, 60)}
                      tone={overTime ? "red" : elapsedMin >= current.estimatedMinutes * 0.9 ? "yellow" : "cyan"}
                    />
                    {overTime && (
                      <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.58rem] font-bold uppercase tracking-widest text-oscar-red">
                        <Hourglass className="size-3" aria-hidden /> Excedida en {Math.round(((elapsedMin - current.estimatedMinutes) / 6)) / 10} h
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssignBay(bay);
                  }}
                  className="flex flex-1 flex-col items-center justify-center gap-2 p-6 transition-colors hover:bg-carbon-900/40"
                  aria-label={`Asignar vehículo a bahía ${bay.code}`}
                >
                  <span className="tech-grid-fine grid size-12 place-items-center rounded-full border border-dashed border-carbon-700">
                    <CircleDot className="size-5 text-carbon-600" aria-hidden />
                  </span>
                  <p className="font-display text-xs font-bold uppercase tracking-widest text-lead">Bahía disponible</p>
                  <p className="font-mono text-[0.55rem] text-carbon-600">Elevador habilitado y operativo</p>
                </button>
              )}
            </article>
          );
        })}
      </div>

      <PairBayOrderDialog bay={assignBay} onOpenChange={(v) => !v && setAssignBay(null)} />
    </>
  );
}

/* ─────────────────────────── [2] Cola de recepción ─────────────────────────── */

function ReceptionQueue({
  waiting,
  bays,
  selectedOrderId,
  onSelectOrder,
  onOpenQuickIntake,
  todayIntakes,
  pendingApprovals,
}: {
  waiting: OrderRowDTO[];
  bays: BayDTO[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOpenQuickIntake: () => void;
  todayIntakes: number | null;
  pendingApprovals: number | null;
}) {
  const [pairOrder, setPairOrder] = useState<OrderRowDTO | null>(null);
  const freeBays = bays.filter((b) => !b.current);

  return (
    <div className="space-y-4">
      {/* CTA + KPIs del mostrador */}
      <div className="bevel flex flex-wrap items-center gap-3 rounded-lg p-4">
        <Button size="xl" className="flex-1 sm:flex-none" onClick={onOpenQuickIntake}>
          <Zap className="size-5" aria-hidden /> Ingreso rápido — 3 pasos
        </Button>
        <p className="hidden min-w-0 flex-1 font-mono text-[0.62rem] leading-relaxed text-lead lg:block">
          Patente → Síntoma → Bahía. El vehículo entra al sistema sin dejar el mostrador.
        </p>
        <div className="flex w-full gap-2 sm:w-auto sm:flex-1 sm:justify-end">
          <QueueChip label="Altas hoy" value={todayIntakes == null ? "…" : String(todayIntakes)} tone="yellow" />
          <QueueChip label="Bahías libres" value={`${freeBays.length}/${bays.length}`} tone={freeBays.length > 0 ? "green" : "red"} />
          <QueueChip
            label="Pend. aprob."
            value={pendingApprovals == null ? "…" : String(pendingApprovals)}
            tone={pendingApprovals && pendingApprovals > 0 ? "red" : "green"}
          />
        </div>
      </div>

      {/* Fila */}
      <div className="bevel rounded-lg p-4">
        <p className="label-tech mb-3 flex items-center gap-1.5">
          <Hourglass className="size-3" aria-hidden /> Fila de recepción — vehículos esperando bahía
          <span className="ml-auto font-mono text-xs font-bold text-oscar-yellow">{waiting.length}</span>
        </p>

        {waiting.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-carbon-700 p-8 text-center">
            <Inbox className="size-7 text-lead" aria-hidden />
            <p className="font-display text-sm font-bold uppercase tracking-widest text-lead">Fila vacía</p>
            <p className="font-mono text-[0.62rem] text-carbon-600">Todo vehículo ingresado tiene bahía asignada.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {waiting.map((o) => {
              const selected = o.id === selectedOrderId;
              return (
                <li key={o.id}>
                  <div
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-md border bg-carbon-950/50 p-3 transition-all",
                      selected ? "border-oscar-yellow bg-oscar-yellow/5" : "border-carbon-800 hover:border-steel/40",
                    )}
                  >
                    <button
                      onClick={() => onSelectOrder(o.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={`Abrir ficha de ${o.orderNumber}`}
                    >
                      <PlateBadge plate={o.plate} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-titanium">{o.vehicle}</span>
                        <span className="block truncate font-mono text-[0.62rem] text-lead">
                          {o.orderNumber} · {o.customer}
                        </span>
                      </span>
                      <span className="hidden shrink-0 font-mono text-[0.62rem] text-lead sm:inline">
                        espera {elapsedSince(o.openedAt)}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-lead" aria-hidden />
                    </button>
                    <Button
                      variant="carbon"
                      size="sm"
                      onClick={() => setPairOrder(o)}
                      disabled={freeBays.length === 0}
                      title={freeBays.length === 0 ? "Taller a plena capacidad" : "Asignar a una bahía libre"}
                    >
                      <MapPin className="size-3.5" aria-hidden /> A bahía
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PairBayOrderDialog order={pairOrder} onOpenChange={(v) => !v && setPairOrder(null)} />
    </div>
  );
}

function QueueChip({ label, value, tone }: { label: string; value: string; tone: "green" | "yellow" | "red" }) {
  const tones = {
    green: "border-bay-free/35 text-bay-free",
    yellow: "border-oscar-yellow/35 text-oscar-yellow",
    red: "border-oscar-red/40 text-oscar-red",
  } as const;
  return (
    <span className={cn("flex min-w-24 flex-1 items-center justify-between gap-2 rounded-md border bg-carbon-950/60 px-2.5 py-1.5 sm:flex-none", tones[tone])}>
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-lead">{label}</span>
      <span className="font-mono text-sm font-bold tabular-nums">{value}</span>
    </span>
  );
}

/* ─────────────────────────── [3] Kanban del pipeline ─────────────────────────── */

function OrdersKanban({
  orders,
  role,
  selectedOrderId,
  onSelectOrder,
}: {
  orders: OrderRowDTO[];
  role: CockpitRole;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
}) {
  const active = orders.filter((o) => o.status !== "CANCELADA");

  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2" role="list" aria-label="Pipeline de producción por estado">
      {ORDER_STATUS_FLOW.map((status) => {
        const meta = ORDER_STATUS_META[status];
        const Icon = meta.icon;
        const items = active.filter((o) => o.status === status);
        return (
          <section
            key={status}
            className="flex w-[15.5rem] shrink-0 flex-col rounded-lg border border-carbon-800 bg-carbon-950/50"
            aria-label={`${meta.label}: ${items.length} órdenes`}
          >
            <header className="flex items-center gap-2 border-b border-carbon-800 px-3 py-2.5">
              <span className={meta.led} aria-hidden />
              <Icon className="size-3.5 shrink-0 text-steel" aria-hidden />
              <h3 className="min-w-0 flex-1 truncate font-display text-[0.7rem] font-bold uppercase tracking-wider text-titanium">
                {meta.label}
              </h3>
              <span className="rounded-sm border border-carbon-700 px-1.5 font-mono text-[0.58rem] font-bold tabular-nums text-steel">
                {items.length}
              </span>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 19rem)" }}>
              {items.length === 0 && (
                <p className="rounded-md border border-dashed border-carbon-800 p-3 text-center font-mono text-[0.58rem] uppercase tracking-widest text-carbon-600">
                  sin vehículos
                </p>
              )}
              {items.map((o) => {
                const selected = o.id === selectedOrderId;
                return (
                  <button
                    key={o.id}
                    onClick={() => onSelectOrder(o.id)}
                    role="listitem"
                    aria-label={`Orden ${o.orderNumber}, ${meta.label}`}
                    className={cn(
                      "w-full rounded-md border p-2.5 text-left transition-all",
                      selected
                        ? "border-oscar-yellow bg-oscar-yellow/8 shadow-[0_0_0_1px_rgba(255,230,0,0.35)]"
                        : "border-carbon-800 bg-carbon-900/70 hover:border-oscar-yellow/45 hover:bg-carbon-900",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <PlateBadge plate={o.plate} size="sm" />
                      {o.bayCode && (
                        <span className="flex items-center gap-1 rounded border border-bay-test/40 bg-bay-test/10 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold text-bay-test">
                          <MapPin className="size-2.5" aria-hidden /> {o.bayCode}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-xs font-semibold text-titanium">{o.vehicle}</p>
                    <p className="truncate font-mono text-[0.58rem] text-lead">
                      {o.orderNumber} · {o.customer.split(" ")[0]}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-[0.55rem] uppercase tracking-wide text-carbon-600">
                        {elapsedSince(o.openedAt)}
                      </span>
                      {role === "jefe" && o.totalEstimated > 0 && (
                        <span className="font-mono text-[0.62rem] font-bold tabular-nums text-oscar-yellow">
                          {moneyCompact(o.totalEstimated)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ─────────────────── Dialog de emparejamiento bahía ↔ orden ─────────────────── */

function PairBayOrderDialog({
  bay,
  order,
  onOpenChange,
}: {
  bay?: BayDTO | null;
  order?: OrderRowDTO | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const open = !!bay || !!order;

  const { data: waiting } = useQueryWaiting(open);
  const { data: baysData } = useQueryBaysFree(open);

  async function assign(targetBayId: string, orderId: string, label: string): Promise<void> {
    setBusy(true);
    try {
      await api.post(`/api/admin/bays/${targetBayId}/assign`, { workOrderId: orderId });
      toast({ title: `${label} asignado ✔`, description: "Vehículo posicionado, el mecánico verá la orden." });
      queryClient.invalidateQueries({ queryKey: ["admin-bays"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "No se pudo asignar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-carbon-700 bg-carbon-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="display-impact flex items-center gap-2 text-lg text-titanium">
            {bay ? (
              <>Asignar a Bahía {bay.code}</>
            ) : (
              <>Asignar bahía a {order?.orderNumber}</>
            )}
          </DialogTitle>
          <DialogDescription>
            {bay
              ? "Elegí qué vehículo ingresa a esta bahía. Solo se listan órdenes INGRESADAS."
              : "Elegí una bahía libre para este vehículo de la fila."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {/* Modo: bahía fija → elegir orden */}
          {bay &&
            (waiting && waiting.length > 0 ? (
              waiting.map((o) => (
                <button
                  key={o.id}
                  onClick={() => assign(bay.id, o.id, o.orderNumber)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-md border border-carbon-700 bg-carbon-950/60 p-3 text-left transition-colors hover:border-oscar-yellow/50 disabled:opacity-50"
                >
                  <PlateBadge plate={o.plate} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-titanium">{o.vehicle}</span>
                    <span className="block truncate font-mono text-[0.62rem] text-lead">{o.orderNumber} · {o.customer}</span>
                  </span>
                  <User className="size-4 text-lead" aria-hidden />
                </button>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-carbon-700 p-4 text-center font-mono text-xs text-lead">
                No hay órdenes INGRESADAS esperando bahía.
              </p>
            ))}

          {/* Modo: orden fija → elegir bahía libre */}
          {order &&
            (baysData && baysData.length > 0 ? (
              baysData.map((b) => (
                <button
                  key={b.id}
                  onClick={() => assign(b.id, order.id, order.orderNumber)}
                  disabled={busy}
                  className="flex w-full items-center gap-3 rounded-md border border-carbon-700 bg-carbon-950/60 p-3 text-left transition-colors hover:border-oscar-yellow/50 disabled:opacity-50"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md border border-carbon-700 bg-carbon-950 font-display text-sm font-bold text-titanium">
                    {b.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-titanium">{BAY_KIND_LABELS[b.kind] ?? b.kind}</span>
                    <span className="block font-mono text-[0.62rem] text-lead">elevador habilitado y operativo</span>
                  </span>
                  <span className="led led-green" aria-hidden />
                </button>
              ))
            ) : (
              <p className="rounded-md border border-oscar-red/40 bg-oscar-red/10 p-4 text-center font-mono text-xs text-oscar-red">
                Taller a plena capacidad — liberá una bahía primero.
              </p>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Queries locales del dialog (no duplican las del orquestador por cache key). */
function useQueryWaiting(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-orders", "INGRESADO"],
    queryFn: () => api.get<{ items: OrderRowDTO[] }>("/api/admin/orders?status=INGRESADO"),
    enabled,
    select: (data) => data.items,
  });
}

function useQueryBaysFree(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-bays"],
    queryFn: () => api.get<{ bays: BayDTO[] }>("/api/admin/bays"),
    enabled,
    select: (data) => data.bays.filter((b) => !b.current),
  });
}
