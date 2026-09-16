"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Radar,
  CheckCircle2,
  XCircle,
  Clock,
  Phone,
  ShieldAlert,
  FileCheck2,
  RefreshCw,
  History,
  ChevronLeft,
  AlertTriangle,
  Wrench,
  Package,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PlateBadge, StatusBadge, LoadingBlock, ErrorBlock } from "@/components/oscar/kit";
import { api, ApiClientError } from "@/lib/api-client";
import {
  money,
  minutes,
  dateTime,
  elapsedSince,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_META,
  TIMELINE_EVENT_LABELS,
  WORKSHOP,
  type TrackingSnapshot,
  type OrderStatus,
} from "@/lib/oscar";
import { navigate } from "@/lib/router";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function TrackingView({ code }: { code: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const { data, isLoading, error } = useQuery({
    queryKey: ["tracking", code],
    queryFn: () => api.get<TrackingSnapshot>(`/api/public/tracking/${encodeURIComponent(code)}`),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <LoadingBlock label="Consultando telemetría del vehículo…" />
      </div>
    );
  }

  if (error) {
    const notFound = error instanceof ApiClientError && error.status === 404;
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <ErrorBlock
          message={
            notFound
              ? "No encontramos ninguna orden con ese código. Verificá que esté completo (a veces queda cortado al copiar)."
              : "No pudimos consultar el estado. Reintentá en unos segundos."
          }
          action={
            <div className="flex gap-2">
              <Button variant="carbon" onClick={() => navigate({ view: "seguimiento" })}>
                <ChevronLeft className="size-4" aria-hidden /> Volver a intentar
              </Button>
              <Button asChild variant="outline">
                <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Phone className="size-4" aria-hidden /> Soporte
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const snap = data!;
  const { order } = snap;
  const currentStep = ORDER_STATUS_META[order.status as OrderStatus]?.step ?? 0;
  const cancelled = order.status === "CANCELADA";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      {/* ───────── Encabezado del vehículo ───────── */}
      <button
        onClick={() => navigate({ view: "seguimiento" })}
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-lead transition-colors hover:text-oscar-yellow"
      >
        <ChevronLeft className="size-3.5" aria-hidden /> Otro código
      </button>

      <div className="bevel clip-corner rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-tech mb-2 flex items-center gap-1.5">
              <span className="led led-green" aria-hidden /> Seguimiento en vivo · actualiza cada 15 s
            </p>
            <h1 className="display-impact text-2xl text-titanium sm:text-3xl">
              Hola, {order.customerFirstName} 👋
            </h1>
            <p className="mt-1 font-mono text-xs text-steel">
              Orden {order.orderNumber} · ingresada {dateTime(order.openedAt)} · hace {elapsedSince(order.openedAt)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PlateBadge plate={order.vehicle.plate} size="lg" />
            <StatusBadge status={order.status as OrderStatus} />
          </div>
        </div>
        <p className="mt-3 text-sm text-steel">
          {order.vehicle.make} {order.vehicle.model}
          {order.vehicle.color ? ` · ${order.vehicle.color}` : ""}
        </p>
      </div>

      {/* ───────── Riel de progreso ───────── */}
      {cancelled ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-oscar-red/50 bg-oscar-red/10 p-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-oscar-red" aria-hidden />
          <div>
            <p className="font-display font-bold uppercase tracking-wide text-oscar-red">Orden cancelada</p>
            <p className="mt-0.5 text-xs text-steel">Esta orden fue cancelada. Si es un error, contactanos por WhatsApp.</p>
          </div>
        </div>
      ) : (
        <div className="bevel mt-5 rounded-xl p-5">
          <p className="label-tech mb-4">Avance de la reparación</p>
          <ol className="grid grid-cols-7 gap-1" aria-label="Estados de la orden">
            {ORDER_STATUS_FLOW.map((s) => {
              const meta = ORDER_STATUS_META[s];
              const stepIdx = meta.step;
              const done = stepIdx < currentStep;
              const current = stepIdx === currentStep;
              const Icon = meta.icon;
              return (
                <li key={s} className="flex flex-col items-center gap-1.5 text-center" aria-current={current ? "step" : undefined}>
                  <span className="flex items-center w-full" aria-hidden>
                    <span className={cn("h-1 flex-1 rounded", stepIdx === 0 ? "opacity-0" : done || current ? "bg-oscar-yellow" : "bg-carbon-700")} />
                  </span>
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-md border transition-all",
                      done && "border-bay-free/50 bg-bay-free/10 text-bay-free",
                      current && "glow-yellow border-oscar-yellow bg-oscar-yellow text-carbon-950",
                      !done && !current && "border-carbon-700 bg-carbon-950 text-lead",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "hidden font-mono text-[0.55rem] uppercase leading-tight tracking-wide sm:block",
                      current ? "text-oscar-yellow" : done ? "text-steel" : "text-lead",
                    )}
                  >
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ───────── Bloqueos ───────── */}
      {snap.blockers.length > 0 && (
        <div className="mt-5 space-y-2.5">
          {snap.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-oscar-red/50 bg-oscar-red/10 p-4">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-oscar-red" aria-hidden />
              <div>
                <p className="font-display font-bold uppercase tracking-wide text-oscar-red">
                  {b.type === "APROBACION_PRESUPUESTO" ? "Esperando tu aprobación" : "Orden en espera"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-steel">{b.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───────── Presupuesto ───────── */}
      {snap.budget && (
        <BudgetPanel
          snapshot={snap}
          code={code}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["tracking", code] })}
        />
      )}

      {/* ───────── Historial ───────── */}
      <div className="bevel mt-5 rounded-xl p-5">
        <p className="label-tech mb-4 flex items-center gap-1.5">
          <History className="size-3" aria-hidden /> Historial de eventos
        </p>
        <ol className="relative space-y-0">
          {snap.timeline.map((ev, i) => {
            const label = TIMELINE_EVENT_LABELS[ev.eventType] ?? ev.title;
            return (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {i < snap.timeline.length - 1 && (
                  <span className="absolute left-[13px] top-7 h-full w-px bg-carbon-700" aria-hidden />
                )}
                <span
                  className={cn(
                    "relative z-10 grid size-7 shrink-0 place-items-center rounded-full border",
                    i === 0
                      ? "border-oscar-yellow bg-oscar-yellow text-carbon-950"
                      : "border-carbon-700 bg-carbon-900 text-steel",
                  )}
                >
                  <span className="size-2 rounded-full bg-current" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={cn("text-sm font-semibold", i === 0 ? "text-oscar-yellow" : "text-titanium")}>{label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-steel">{ev.description}</p>
                  <p className="mt-1 font-mono text-[0.62rem] text-lead">
                    {dateTime(ev.at)}
                    {ev.actor ? ` · ${ev.actor}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ───────── Soporte ───────── */}
      <div className="bevel mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md border border-bay-free/40 bg-bay-free/10 text-bay-free">
            <Phone className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-wide text-titanium">¿Dudas con tu orden?</p>
            <p className="font-mono text-xs text-steel">Respuesta directa del taller</p>
          </div>
        </div>
        <Button asChild>
          <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp {WORKSHOP.phoneDisplay}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ═════════════ Panel de presupuesto con aprobación por línea ═════════════ */

function BudgetPanel({
  snapshot,
  code,
  onDone,
}: {
  snapshot: TrackingSnapshot;
  code: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const budget = snapshot.budget!;
  const isPending = budget.status === "PENDIENTE_APROBACION";

  const [selectedLabor, setSelectedLabor] = useState<Set<string>>(() =>
    new Set(budget.laborLines.map((l) => l.id)),
  );
  const [selectedParts, setSelectedParts] = useState<Set<string>>(() =>
    new Set(budget.partLines.map((l) => l.id)),
  );
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Si el presupuesto cambia de estado (v2 → aprobado), reset selección
  useEffect(() => {
    if (!isPending) return;
    setSelectedLabor(new Set(budget.laborLines.map((l) => l.id)));
    setSelectedParts(new Set(budget.partLines.map((l) => l.id)));
  }, [budget.status, budget.versionNumber]);

  const selectionTotal = useMemo(() => {
    const labor = budget.laborLines.filter((l) => selectedLabor.has(l.id)).reduce((a, l) => a + l.lineTotal, 0);
    const parts = budget.partLines.filter((l) => selectedParts.has(l.id)).reduce((a, l) => a + l.lineTotal, 0);
    return { labor, parts, total: labor + parts };
  }, [budget, selectedLabor, selectedParts]);

  async function decide(decision: "APROBADO" | "RECHAZADO", reason?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/api/public/budget/${encodeURIComponent(code)}/decide`, {
        decision,
        laborLineIds: decision === "APROBADO" ? Array.from(selectedLabor) : [],
        partLineIds: decision === "APROBADO" ? Array.from(selectedParts) : [],
        reason: reason || undefined,
      });
      toast({
        title: decision === "APROBADO" ? "¡Presupuesto aprobado! ✔" : "Presupuesto rechazado",
        description:
          decision === "APROBADO"
            ? "El taller ya recibió tu aprobación y continúa con la reparación."
            : "El taller se pondrá en contacto para revisar las alternativas.",
      });
      onDone();
      setRejectOpen(false);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "No pudimos registrar tu decisión.";
      toast({ title: "Error al registrar la decisión", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return (
    <div className={cn("bevel mt-5 rounded-xl", isPending && "glow-yellow")}>
      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="label-tech flex items-center gap-1.5">
            <FileCheck2 className="size-3" aria-hidden /> Presupuesto v{budget.versionNumber}
          </p>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-widest",
              budget.status === "PENDIENTE_APROBACION" && "border-oscar-yellow/50 bg-oscar-yellow/10 text-oscar-yellow",
              budget.status === "APROBADO" && "border-bay-free/50 bg-bay-free/10 text-bay-free",
              budget.status === "RECHAZADO" && "border-oscar-red/50 bg-oscar-red/10 text-oscar-red",
            )}
          >
            {budget.status === "PENDIENTE_APROBACION" ? "Requiere tu decisión" : budget.status}
          </span>
        </div>

        {/* Mano de obra */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-steel">
            <Wrench className="size-3 text-oscar-yellow" aria-hidden /> Mano de obra
          </p>
          {budget.laborLines.length === 0 && <p className="text-xs text-lead">Sin ítems de mano de obra.</p>}
          {budget.laborLines.map((l) => (
            <BudgetLine
              key={l.id}
              selectable={isPending}
              checked={isPending ? selectedLabor.has(l.id) : l.isApproved}
              onToggle={() => setSelectedLabor((s) => toggle(s, l.id))}
              icon={<Wrench className="size-3.5" aria-hidden />}
              title={l.description}
              meta={`${minutes(l.estimatedMinutes)} de taller`}
              amount={l.lineTotal}
            />
          ))}
        </div>

        <Separator className="my-4 bg-carbon-800" />

        {/* Repuestos */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-steel">
            <Package className="size-3 text-oscar-yellow" aria-hidden /> Repuestos
          </p>
          {budget.partLines.length === 0 && <p className="text-xs text-lead">Sin repuestos en este presupuesto.</p>}
          {budget.partLines.map((l) => (
            <BudgetLine
              key={l.id}
              selectable={isPending}
              checked={isPending ? selectedParts.has(l.id) : l.isApproved}
              onToggle={() => setSelectedParts((s) => toggle(s, l.id))}
              icon={<Package className="size-3.5" aria-hidden />}
              title={l.description}
              meta={`${l.quantity} × ${money(l.unitPrice)}`}
              amount={l.lineTotal}
            />
          ))}
        </div>

        <Separator className="my-4 bg-carbon-800" />

        {/* Totales */}
        <div className="space-y-1.5">
          {isPending ? (
            <>
              <Row label="Mano de obra (seleccionada)" value={money(selectionTotal.labor)} />
              <Row label="Repuestos (seleccionados)" value={money(selectionTotal.parts)} />
              <div className="mt-2 flex items-baseline justify-between rounded-md border border-oscar-yellow/40 bg-oscar-yellow/5 p-3">
                <span className="display-impact text-base text-titanium">Total a aprobar</span>
                <span className="display-impact text-2xl text-oscar-yellow">{money(selectionTotal.total)}</span>
              </div>
            </>
          ) : (
            <>
              <Row label="Mano de obra" value={money(budget.subtotalLabor)} />
              <Row label="Repuestos" value={money(budget.subtotalParts)} />
              <div className="mt-2 flex items-baseline justify-between rounded-md border border-carbon-700 bg-carbon-950/60 p-3">
                <span className="display-impact text-base text-titanium">Total del presupuesto</span>
                <span className={cn("display-impact text-2xl", budget.status === "APROBADO" ? "text-bay-free" : "text-oscar-red")}>
                  {money(budget.total)}
                </span>
              </div>
            </>
          )}
        </div>

        {budget.status === "RECHAZADO" && (
          <p className="mt-3 flex items-start gap-2 text-xs text-steel">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-oscar-red" aria-hidden />
            Presupuesto rechazado. El taller se comunicará con vos para encontrar una alternativa.
          </p>
        )}
      </div>

      {/* Acciones de aprobación */}
      {isPending && (
        <div className="border-t border-carbon-800 bg-carbon-950/60 p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button
              size="lg"
              className="flex-1"
              disabled={busy || (selectedLabor.size === 0 && selectedParts.size === 0)}
              onClick={() => decide("APROBADO")}
            >
              {busy ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-5" aria-hidden />}
              Aprobar selección ({money(selectionTotal.total)})
            </Button>
            <Button size="lg" variant="destructive" className="flex-1" disabled={busy} onClick={() => setRejectOpen(true)}>
              <XCircle className="size-4" aria-hidden />
              Rechazar presupuesto
            </Button>
          </div>
          <p className="mt-2.5 text-center font-mono text-[0.62rem] text-lead">
            Podés aprobar línea por línea: desmarcá lo que no quieras autorizar.
          </p>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="border-carbon-700 bg-carbon-850 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="display-impact text-lg text-titanium">¿Rechazar el presupuesto?</DialogTitle>
            <DialogDescription className="text-sm text-steel">
              Contanos brevemente por qué (opcional). Esto ayuda al taller a ofrecerte una alternativa.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ej: El valor excede lo que pensaba invertir este mes…"
            rows={3}
            maxLength={500}
            className="bg-carbon-950/70"
          />
          <DialogFooter className="gap-2">
            <Button variant="carbon" onClick={() => setRejectOpen(false)}>Volver</Button>
            <Button variant="destructive" disabled={busy} onClick={() => decide("RECHAZADO", rejectReason)}>
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetLine({
  selectable,
  checked,
  onToggle,
  icon,
  title,
  meta,
  amount,
}: {
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  meta: string;
  amount: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 transition-all",
        selectable ? "cursor-pointer border-carbon-800 bg-carbon-950/50 hover:border-carbon-600" : "border-carbon-800 bg-carbon-950/50",
        selectable && checked && "border-oscar-yellow/45 bg-oscar-yellow/5",
        !selectable && checked === false && "opacity-45",
      )}
      onClick={selectable ? onToggle : undefined}
      role={selectable ? "checkbox" : undefined}
      aria-checked={selectable ? checked : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={
        selectable
          ? (e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
    >
      {selectable ? (
        <Checkbox checked={checked} onCheckedChange={onToggle} className="data-[state=checked]:border-carbon-950 data-[state=checked]:bg-oscar-yellow data-[state=checked]:text-carbon-950" />
      ) : checked ? (
        <BadgeCheck className="size-5 shrink-0 text-bay-free" aria-label="Ítem aprobado" />
      ) : (
        <XCircle className="size-5 shrink-0 text-lead" aria-label="Ítem no aprobado" />
      )}
      <span className="grid size-8 shrink-0 place-items-center rounded border border-carbon-700 bg-carbon-900 text-steel">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-titanium">{title}</span>
        <span className="block font-mono text-[0.62rem] text-lead">{meta}</span>
      </span>
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-titanium">{money(amount)}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-steel">{label}</span>
      <span className="font-mono font-bold tabular-nums text-titanium">{value}</span>
    </div>
  );
}
