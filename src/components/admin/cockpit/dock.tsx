"use client";

/**
 * OS-CAR Cockpit — ZONA LATERAL DERECHA: DOCK CONTEXTUAL DE FICHA & LOGÍSTICA.
 * Al tocar un vehículo, bahía u orden del tablero, este panel se actualiza
 * instantáneamente SIN cambiar de página: ficha del vehículo, transición de
 * estado en 1 clic, checklist técnico, repuestos con almacén en vivo,
 * presupuesto reactivo, hotel de neumáticos y auditoría.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  FileCheck2,
  Fuel,
  Gauge,
  History,
  Layers,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  PlusCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlateBadge, StatusBadge, FuelGauge, LoadingBlock, ErrorBlock, TechProgressBar } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import {
  nextPrimaryStatus,
  PART_STATUS_TONES,
  WORK_STATUS_TONES,
  type CockpitRole,
  type OrderDetailDTO,
  type TireSetDTO,
} from "@/components/admin/cockpit/shared";
import { PartPicker } from "@/components/admin/cockpit/part-picker";
import { WorkItemDialog, CustomPartDialog, CancelOrderDialog } from "@/components/admin/cockpit/dock-dialogs";
import {
  dateTime,
  elapsedSince,
  money,
  minutes,
  ORDER_STATUS_META,
  ORDER_TRANSITIONS,
  TIMELINE_EVENT_LABELS,
  WHEEL_POSITION_LABELS,
  treadTone,
  type OrderStatus,
} from "@/lib/oscar";
import type { CockpitPanel } from "@/lib/router";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface DockProps {
  orderId: string;
  onClose: () => void;
  role: CockpitRole;
  onOpenPanel: (panel: CockpitPanel) => void;
}

export function CockpitDock({ orderId, onClose, role, onOpenPanel }: DockProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [workDialog, setWorkDialog] = useState(false);
  const [customPartDialog, setCustomPartDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => api.get<OrderDetailDTO>(`/api/admin/orders/${orderId}`),
  });

  /* Hotel de neumáticos — sets en custodia (match por patente). */
  const { data: tireSets } = useQuery({
    queryKey: ["tire-hotel", "custody-list"],
    queryFn: () => api.get<{ sets: TireSetDTO[] }>("/api/admin/tire-hotel?status=EN_CUSTODIA"),
  });

  const invalidate = (): void => {
    queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-bays"] });
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
  };

  const transition = useMutation({
    mutationFn: (payload: { targetStatus: string; reason?: string }) =>
      api.post(`/api/admin/orders/${orderId}/transition`, payload),
    onSuccess: (_d, v) => {
      toast({
        title: `Estado → ${ORDER_STATUS_META[v.targetStatus as OrderStatus]?.label ?? v.targetStatus}`,
        description: "Transición registrada en el historial de auditoría.",
      });
      invalidate();
    },
    onError: (e) => toast({ title: "Transición rechazada", description: e.message, variant: "destructive" }),
  });

  const workToggle = useMutation({
    mutationFn: (payload: { itemId: string; status: string }) =>
      api.patch(`/api/admin/orders/${orderId}/work-items/${payload.itemId}`, { status: payload.status }),
    onSuccess: (_d, v) => {
      toast({
        title:
          v.status === "COMPLETADO"
            ? "Trabajo completado ✔"
            : v.status === "EN_CURSO"
              ? "Trabajo en curso"
              : "Trabajo actualizado",
      });
      invalidate();
    },
    onError: (e) => toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" }),
  });

  const publishBudget = useMutation({
    mutationFn: () => api.post(`/api/admin/orders/${orderId}/budget/publish`),
    onSuccess: () => {
      toast({ title: "Presupuesto publicado ✔", description: "El cliente ya puede aprobarlo desde su portal de seguimiento." });
      invalidate();
    },
    onError: (e) => toast({ title: "No se pudo publicar", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <DockHeaderSkeleton />
        <div className="p-5"><LoadingBlock label="Abriendo ficha técnica…" /></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex h-full flex-col">
        <DockCloseRow onClose={onClose} />
        <div className="p-5">
          <ErrorBlock message="No pudimos abrir esta orden. Puede haber sido eliminada." />
        </div>
      </div>
    );
  }

  const o = order;
  const allowed = ORDER_TRANSITIONS[o.status] ?? [];
  const primary = nextPrimaryStatus(o.status);
  const others = allowed.filter((t) => t !== primary && t !== "CANCELADA");
  const canCancel = allowed.includes("CANCELADA");
  const marginPct = o.totals.totalEstimated > 0 ? Math.round((o.totals.margin / o.totals.totalEstimated) * 100) : 0;
  const custodySet = tireSets?.sets.find((s) => s.plate === o.vehicle.plate) ?? null;
  const workDone = o.workItems.filter((w) => w.status === "COMPLETADO").length;
  const waUrl = `https://wa.me/${o.customer.phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hola ${o.customer.fullName.split(" ")[0]}, te escribimos de OS-CAR por tu orden ${o.orderNumber} (${o.vehicle.make} ${o.vehicle.model}).`,
  )}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-carbon-900/40">
      {/* ═══ Header del vehículo ═══ */}
      <header className="shrink-0 border-b border-carbon-800 bg-carbon-900/80 p-4">
        <DockCloseRow onClose={onClose} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display-impact text-xl text-titanium">{o.orderNumber}</h2>
              <StatusBadge status={o.status} />
              {o.bay && (
                <span className="flex items-center gap-1.5 rounded-md border border-bay-test/40 bg-bay-test/10 px-2 py-0.5 font-mono text-[0.62rem] font-bold text-bay-test">
                  <MapPin className="size-3" aria-hidden /> {o.bay.code} · {elapsedSince(o.bay.since)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-titanium">
              {o.vehicle.make} {o.vehicle.model}
              {o.vehicle.modelYear ? <span className="font-normal text-lead"> · {o.vehicle.modelYear}</span> : null}
              {o.vehicle.color ? <span className="font-normal text-lead"> · {o.vehicle.color}</span> : null}
            </p>
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-[0.68rem] text-steel transition-colors hover:text-bay-free"
            >
              <MessageCircle className="size-3" aria-hidden />
              {o.customer.fullName} · {o.customer.phoneE164}
            </a>
          </div>
          <PlateBadge plate={o.vehicle.plate} size="lg" />
        </div>

        {o.blockers.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {o.blockers.map((b, i) => (
              <p key={i} className="flex items-start gap-2 rounded-md border border-oscar-red/40 bg-oscar-red/10 p-2 text-xs text-steel">
                <Ban className="mt-0.5 size-3.5 shrink-0 text-oscar-red" aria-hidden />
                <span>
                  <span className="font-mono font-bold uppercase text-oscar-red">{b.type.replaceAll("_", " ")}</span>: {b.reason}
                </span>
              </p>
            ))}
          </div>
        )}
      </header>

      {/* ═══ Transición de estado — 1 clic ═══ */}
      <section className="shrink-0 border-b border-carbon-800 bg-carbon-950/40 p-4" aria-label="Transición de estado">
        {primary ? (
          <>
            <Button
              size="xl"
              className="w-full text-base"
              disabled={transition.isPending}
              onClick={() => transition.mutate({ targetStatus: primary })}
              aria-label={`Avanzar a ${ORDER_STATUS_META[primary].label}`}
            >
              {transition.isPending ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <ChevronRight className="size-5" aria-hidden />
              )}
              Avanzar a {ORDER_STATUS_META[primary].label}
            </Button>
            {(others.length > 0 || canCancel) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {others.map((t) => (
                  <Button
                    key={t}
                    variant="carbon"
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ targetStatus: t })}
                  >
                    {ORDER_STATUS_META[t].label}
                  </Button>
                ))}
                {canCancel && (
                  <Button variant="ghost" size="sm" className="text-oscar-red hover:bg-oscar-red/10 hover:text-oscar-red" onClick={() => setCancelDialog(true)}>
                    Cancelar orden…
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 rounded-md border border-carbon-800 bg-carbon-900/60 p-3 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-lead">
            <ShieldCheck className="size-4 text-bay-free" aria-hidden />
            {o.status === "ENTREGADO" ? "Orden entregada — flujo cerrado" : "Orden cancelada — flujo cerrado"}
          </p>
        )}
      </section>

      {/* ═══ Contenido scrollable ═══ */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* KPIs / progreso */}
        {role === "jefe" ? (
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <MiniTile label="Mano de obra" value={money(o.totals.laborSubtotal)} icon={Wrench} />
            <MiniTile label="Repuestos" value={money(o.totals.partsSubtotal)} icon={Package} />
            <MiniTile label="Total est." value={money(o.totals.totalEstimated)} icon={FileCheck2} tone="yellow" />
            <MiniTile
              label={`Margen ${marginPct}%`}
              value={money(o.totals.margin)}
              icon={TrendingUp}
              tone={marginPct >= 30 ? "green" : marginPct >= 15 ? "yellow" : "red"}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-carbon-800 bg-carbon-950/50 p-3.5">
            <div className="mb-1.5 flex items-center justify-between font-mono text-[0.65rem] text-steel">
              <span className="uppercase tracking-widest">Checklist técnico</span>
              <span className="tabular-nums">{workDone}/{o.workItems.length} trabajos</span>
            </div>
            <TechProgressBar value={workDone} max={Math.max(o.workItems.length, 1)} tone={workDone === o.workItems.length && o.workItems.length > 0 ? "green" : "yellow"} />
            <p className="mt-2 font-mono text-[0.6rem] text-lead">
              {o.partItems.length} repuestos · bahía {o.bay?.code ?? "sin asignar"}
            </p>
          </div>
        )}

        {/* Checklist de trabajos */}
        <section className="bevel rounded-lg p-4" aria-label="Mano de obra">
          <div className="mb-3 flex items-center justify-between">
            <p className="label-tech flex items-center gap-1.5"><Wrench className="size-3" aria-hidden /> Mano de obra ({o.workItems.length})</p>
            <Button variant="carbon" size="sm" onClick={() => setWorkDialog(true)}>
              <PlusCircle className="size-3.5" aria-hidden /> Trabajo
            </Button>
          </div>
          {o.workItems.length === 0 && (
            <p className="rounded-md border border-dashed border-carbon-700 p-3 text-center font-mono text-[0.65rem] text-lead">
              Sin ítems de trabajo cargados.
            </p>
          )}
          <div className="space-y-1.5">
            {o.workItems.map((w) => (
              <div
                key={w.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md border p-2.5",
                  w.status === "COMPLETADO" ? "border-bay-free/25 bg-bay-free/5" : "border-carbon-800 bg-carbon-950/50",
                )}
              >
                <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-wider", WORK_STATUS_TONES[w.status] ?? WORK_STATUS_TONES.PENDIENTE)}>
                  {w.status.replaceAll("_", " ")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-titanium">{w.description}</p>
                  <p className="truncate font-mono text-[0.58rem] text-lead">
                    {minutes(w.estimatedMinutes)}
                    {w.assignedTo ? ` · ${w.assignedTo}` : ""}
                    {role === "jefe" ? ` · ${money((w.estimatedMinutes / 60) * w.hourlyRateCharged)}` : ""}
                  </p>
                </div>
                {w.status !== "CANCELADO" && (
                  <div className="flex shrink-0 items-center gap-1">
                    {w.status === "PENDIENTE" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={workToggle.isPending}
                        onClick={() => workToggle.mutate({ itemId: w.id, status: "EN_CURSO" })}
                      >
                        Iniciar
                      </Button>
                    )}
                    {w.status === "EN_CURSO" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-bay-free hover:bg-bay-free/10 hover:text-bay-free"
                        disabled={workToggle.isPending}
                        onClick={() => workToggle.mutate({ itemId: w.id, status: "COMPLETADO" })}
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden /> Terminar
                      </Button>
                    )}
                    {w.status === "COMPLETADO" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Reabrir trabajo"
                        aria-label="Reabrir trabajo"
                        disabled={workToggle.isPending}
                        onClick={() => workToggle.mutate({ itemId: w.id, status: "EN_CURSO" })}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Repuestos + almacén en vivo */}
        <section className="bevel rounded-lg p-4" aria-label="Repuestos">
          <div className="mb-3 flex items-center justify-between">
            <p className="label-tech flex items-center gap-1.5"><Package className="size-3" aria-hidden /> Repuestos ({o.partItems.length})</p>
            <Button variant="carbon" size="sm" onClick={() => setCustomPartDialog(true)}>
              <PlusCircle className="size-3.5" aria-hidden /> Fuera de stock
            </Button>
          </div>

          {o.partItems.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {o.partItems.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-carbon-800 bg-carbon-950/50 p-2.5">
                  <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-wider", PART_STATUS_TONES[p.status] ?? PART_STATUS_TONES.PENDIENTE)}>
                    {p.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-titanium">{p.description}</p>
                    <p className="truncate font-mono text-[0.58rem] text-lead">
                      {p.quantity} × {role === "jefe" ? money(p.unitPriceCharged) : "un."}
                      {p.partNumber ? ` · ${p.partNumber}` : ""}
                    </p>
                  </div>
                  {role === "jefe" && (
                    <p className="shrink-0 font-mono text-xs font-bold tabular-nums text-titanium">{money(p.quantity * p.unitPriceCharged)}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <PartPicker orderId={orderId} onDone={invalidate} onOpenPanel={() => onOpenPanel("stock")} />
        </section>

        {/* Presupuesto reactivo (rol jefe) */}
        {role === "jefe" && (
          <section className="bevel rounded-lg p-4" aria-label="Presupuesto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="label-tech flex items-center gap-1.5"><FileCheck2 className="size-3" aria-hidden /> Presupuesto</p>
              {o.budget ? (
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-widest",
                    o.budget.status === "PENDIENTE_APROBACION" && "border-oscar-yellow/50 bg-oscar-yellow/10 text-oscar-yellow",
                    o.budget.status === "APROBADO" && "border-bay-free/50 bg-bay-free/10 text-bay-free",
                    o.budget.status === "RECHAZADO" && "border-oscar-red/50 bg-oscar-red/10 text-oscar-red",
                  )}
                >
                  v{o.budget.versionNumber} · {o.budget.status.replaceAll("_", " ")}
                </span>
              ) : (
                <Button size="sm" onClick={() => publishBudget.mutate()} disabled={publishBudget.isPending}>
                  {publishBudget.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                  Publicar al cliente
                </Button>
              )}
            </div>

            {o.budget ? (
              <div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniTile label="MO" value={money(o.budget.subtotalLabor)} compact />
                  <MiniTile label="Repuestos" value={money(o.budget.subtotalParts)} compact />
                  <MiniTile label="Total" value={money(o.budget.totalEstimated)} tone="yellow" compact />
                </div>
                <div className="mt-3 space-y-1">
                  {o.budget.laborLines.map((l) => (
                    <BudgetLine key={l.id} approved={l.isApproved} desc={l.description} meta={minutes(l.estimatedMinutes)} total={l.lineTotal} />
                  ))}
                  {o.budget.partLines.map((l) => (
                    <BudgetLine key={l.id} approved={l.isApproved} desc={l.description} meta={`${l.quantity} × ${money(l.unitPrice)}`} total={l.lineTotal} />
                  ))}
                </div>
                {o.budget.approvals.length > 0 && (
                  <p className="mt-2.5 flex items-center gap-1.5 font-mono text-[0.58rem] text-lead">
                    <CheckCircle2 className="size-3 shrink-0 text-bay-free" aria-hidden />
                    {o.budget.approvals[0].decision} · {o.budget.approvals[0].actorType === "CLIENTE" ? "cliente (web)" : "taller"} · {dateTime(o.budget.approvals[0].decidedAt)}
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-carbon-700 p-3 text-center font-mono text-[0.65rem] text-lead">
                Cargá trabajos y repuestos, y publicá el presupuesto para la aprobación del cliente.
              </p>
            )}
          </section>
        )}

        {/* Hotel de neumáticos */}
        {custodySet && (
          <section className="bevel rounded-lg p-4" aria-label="Hotel de neumáticos">
            <p className="label-tech mb-3 flex items-center gap-1.5"><Layers className="size-3" aria-hidden /> Neumáticos en custodia</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-lg font-bold tracking-wider text-bay-test">
                {custodySet.rack} <span className="text-carbon-600">/</span> {custodySet.level} <span className="text-carbon-600">/</span> {custodySet.position}
              </p>
              <span className="font-mono text-[0.62rem] text-lead">{custodySet.brand} · {custodySet.size}</span>
            </div>
            <p className="mt-1 font-mono text-[0.58rem] text-lead">ingresado {dateTime(custodySet.checkInAt)}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {custodySet.tires.map((t) => (
                <div key={t.wheelPosition} className="rounded-md border border-carbon-800 bg-carbon-950/50 p-2">
                  <div className="flex items-center justify-between font-mono text-[0.58rem] text-steel">
                    <span>{WHEEL_POSITION_LABELS[t.wheelPosition] ?? t.wheelPosition}</span>
                    <span className={cn("font-bold tabular-nums", t.treadDepthMm < 3 ? "text-oscar-red" : t.treadDepthMm < 4.5 ? "text-oscar-yellow" : "text-bay-free")}>
                      {t.treadDepthMm.toFixed(1)} mm
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm border border-carbon-700 bg-carbon-950">
                    <div className={cn("h-full", treadTone(t.treadDepthMm))} style={{ width: `${Math.min(100, (t.treadDepthMm / 8) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {custodySet.tires.some((t) => t.treadDepthMm < 3) && (
              <p className="mt-2.5 flex items-center gap-1.5 rounded-md border border-oscar-red/40 bg-oscar-red/10 p-2 font-mono text-[0.6rem] font-bold uppercase tracking-wider text-oscar-red">
                <Ban className="size-3.5 shrink-0" aria-hidden /> alerta: dibujo menor a 3 mm — sugerir reemplazo
              </p>
            )}
          </section>
        )}

        {/* Recepción del vehículo */}
        {o.intake && (
          <section className="bevel rounded-lg p-4" aria-label="Recepción del vehículo">
            <p className="label-tech mb-2.5 flex items-center gap-1.5"><Gauge className="size-3" aria-hidden /> Recepción</p>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-steel">Odómetro</span>
              <span className="font-mono font-bold tabular-nums text-titanium">{o.intake.odometerAtIntake.toLocaleString("es-AR")} km</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-steel"><Fuel className="size-3.5" aria-hidden /> Combustible</span>
              <FuelGauge level={o.intake.fuelLevel} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-steel">“{o.intake.customerComplaint}”</p>
            {o.intake.visualChecklist?.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {o.intake.visualChecklist.map((s) => (
                  <span key={s} className="rounded border border-oscar-yellow/30 bg-oscar-yellow/5 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase text-oscar-yellow">{s}</span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Auditoría */}
        <section className="bevel rounded-lg p-4" aria-label="Auditoría de eventos">
          <p className="label-tech mb-3 flex items-center gap-1.5"><History className="size-3" aria-hidden /> Auditoría</p>
          <ol className="max-h-52 space-y-0 overflow-y-auto pr-1">
            {o.history.slice(0, 10).map((h, i) => (
              <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                {i < Math.min(o.history.length, 10) - 1 && <span className="absolute left-[5px] top-3.5 h-full w-px bg-carbon-700" aria-hidden />}
                <span className={cn("relative z-10 mt-1 size-3 shrink-0 rounded-full border-2", i === 0 ? "border-oscar-yellow bg-oscar-yellow" : "border-carbon-600 bg-carbon-900")} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-semibold text-titanium">{TIMELINE_EVENT_LABELS[h.eventType] ?? h.eventType}</p>
                  <p className="mt-0.5 truncate text-[0.68rem] text-steel">{h.description}</p>
                  <p className="mt-0.5 font-mono text-[0.55rem] text-lead">{dateTime(h.at)}{h.actor ? ` · ${h.actor}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* ═══ Dialogs ═══ */}
      <WorkItemDialog open={workDialog} onOpenChange={setWorkDialog} orderId={orderId} onDone={invalidate} />
      <CustomPartDialog open={customPartDialog} onOpenChange={setCustomPartDialog} orderId={orderId} onDone={invalidate} />
      <CancelOrderDialog
        open={cancelDialog}
        onOpenChange={setCancelDialog}
        orderId={orderId}
        orderNumber={o.orderNumber}
        busy={transition.isPending}
        onConfirm={(reason) => transition.mutate({ targetStatus: "CANCELADA", reason })}
      />
    </div>
  );
}

/* ─────────────────────────── Piezas visuales del dock ─────────────────────────── */

function DockCloseRow({ onClose }: { onClose: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <span className="label-tech flex items-center gap-1.5">
        <Cpu className="size-3" aria-hidden /> Ficha técnica & logística
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label="Cerrar ficha (Esc)"
        title="Cerrar ficha (Esc)"
        className="text-steel hover:text-oscar-red"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function DockHeaderSkeleton() {
  return (
    <div className="border-b border-carbon-800 bg-carbon-900/80 p-4">
      <div className="flex items-center justify-between">
        <span className="label-tech">Ficha técnica & logística</span>
      </div>
    </div>
  );
}

function MiniTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  compact,
}: {
  label: string;
  value: string;
  icon?: typeof Wrench;
  tone?: "default" | "yellow" | "red" | "green";
  compact?: boolean;
}) {
  const tones = {
    default: "border-carbon-800 text-titanium",
    yellow: "border-oscar-yellow/35 text-oscar-yellow",
    red: "border-oscar-red/40 text-oscar-red",
    green: "border-bay-free/35 text-bay-free",
  } as const;
  return (
    <div className={cn("rounded-md border bg-carbon-950/60 p-2.5", tones[tone])}>
      <p className="label-tech flex items-center gap-1 truncate">
        {Icon && <Icon className="size-2.5" aria-hidden />} {label}
      </p>
      <p className={cn("display-impact mt-0.5 tracking-normal tabular-nums", compact ? "text-sm" : "text-base")}>{value}</p>
    </div>
  );
}

function BudgetLine({ approved, desc, meta, total }: { approved: boolean; desc: string; meta: string; total: number }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border p-2", approved ? "border-carbon-800 bg-carbon-950/40" : "border-carbon-800/60 bg-carbon-950/40 opacity-55")}>
      {approved ? <CheckCircle2 className="size-3.5 shrink-0 text-bay-free" aria-hidden /> : <Clock3 className="size-3.5 shrink-0 text-lead" aria-hidden />}
      <span className="min-w-0 flex-1 truncate text-xs text-steel">{desc}</span>
      <span className="hidden shrink-0 font-mono text-[0.55rem] text-lead sm:inline">{meta}</span>
      <span className="shrink-0 font-mono text-[0.68rem] font-bold tabular-nums text-titanium">{money(total)}</span>
    </div>
  );
}

/** Placeholder cuando no hay selección (dock desktop persistente). */
export function DockPlaceholder() {
  return (
    <div className="tech-grid flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="grid size-20 place-items-center rounded-full border border-dashed border-carbon-700 bg-carbon-950/60">
        <Gauge className="size-9 text-carbon-600" aria-hidden />
      </span>
      <div className="max-w-xs">
        <p className="display-impact text-lg text-steel">Centro de comando</p>
        <p className="mt-1.5 text-sm leading-relaxed text-lead">
          Tocá una bahía, una orden del pipeline o un vehículo de la fila para desplegar su ficha técnica aquí.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 font-mono text-[0.55rem] uppercase tracking-widest text-carbon-600">
        <kbd className="rounded border border-carbon-800 px-1.5 py-0.5">1 bahías</kbd>
        <kbd className="rounded border border-carbon-800 px-1.5 py-0.5">2 recepción</kbd>
        <kbd className="rounded border border-carbon-800 px-1.5 py-0.5">3 pipeline</kbd>
        <kbd className="rounded border border-carbon-800 px-1.5 py-0.5">Ctrl+K buscar</kbd>
        <kbd className="rounded border border-carbon-800 px-1.5 py-0.5">Esc cerrar</kbd>
      </div>
    </div>
  );
}
