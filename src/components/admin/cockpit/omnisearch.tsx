"use client";

/**
 * OS-CAR Cockpit — OMNISEARCH UNIVERSAL (Ctrl+K).
 * Búsqueda instantánea y simultánea por Patente, Cliente, N° de Orden,
 * SKU de almacén (26 items) y Posición de Rack del hotel de neumáticos.
 * Navegación completa por teclado: ↑ ↓ Enter Esc.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CarFront,
  CircleDot,
  ClipboardList,
  Loader2,
  Package,
  Search,
  UserRound,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlateBadge, StatusBadge } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import type { OrderRowDTO, SearchDTO, IntakePrefill, InventoryItemDTO, TireSetDTO } from "@/components/admin/cockpit/shared";
import type { CockpitPanel } from "@/lib/router";
import { cn } from "@/lib/utils";

type OmniOption =
  | { kind: "order"; id: string; orderNumber: string; plate: string; status: SearchDTO["orders"][number]["status"] }
  | { kind: "vehicle"; plate: string; label: string; customerName: string }
  | { kind: "customer"; id: string; fullName: string; phone: string }
  | { kind: "part"; item: InventoryItemDTO }
  | { kind: "tire"; set: TireSetDTO };

const KIND_META: Record<OmniOption["kind"], { label: string; icon: typeof Search; hint: string }> = {
  order: { label: "Órdenes", icon: ClipboardList, hint: "↵ abrir ficha" },
  vehicle: { label: "Vehículos", icon: CarFront, hint: "↵ ingreso express" },
  customer: { label: "Clientes", icon: UserRound, hint: "↵ ingreso express" },
  part: { label: "Almacén · SKUs", icon: Package, hint: "↵ ver stock" },
  tire: { label: "Hotel · Racks", icon: CircleDot, hint: "↵ abrir orden" },
};

const KIND_ORDER: OmniOption["kind"][] = ["order", "vehicle", "customer", "part", "tire"];

export interface OmnisearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Órdenes activas del cockpit — para resolver patente→orden en racks. */
  orders: OrderRowDTO[];
  onSelectOrder: (orderId: string) => void;
  onPrefillIntake: (prefill: IntakePrefill) => void;
  onOpenPanel: (panel: CockpitPanel) => void;
}

/**
 * Cuerpo del palette — monta fresco en cada apertura (Radix desmonta el
 * contenido al cerrar), por lo que el estado de búsqueda se resetea solo.
 */
function OmniPaletteBody({
  orders,
  onSelectOrder,
  onPrefillIntake,
  onOpenPanel,
  onClose,
}: Omit<OmnisearchProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const trimmed = debounced.trim();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setActiveIndex(0);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = trimmed.length >= 2;

  const { data: searchData, isFetching: searchBusy } = useQuery({
    queryKey: ["admin-search", trimmed],
    queryFn: () => api.get<SearchDTO>(`/api/admin/search?q=${encodeURIComponent(trimmed)}`),
    enabled,
    staleTime: 10_000,
  });

  const { data: inventoryData, isFetching: partsBusy } = useQuery({
    queryKey: ["admin-inventory", trimmed],
    queryFn: () => api.get<{ items: InventoryItemDTO[] }>(`/api/admin/inventory?q=${encodeURIComponent(trimmed)}`),
    enabled,
    staleTime: 10_000,
  });

  const { data: tiresData, isFetching: tiresBusy } = useQuery({
    queryKey: ["tire-hotel", "EN_CUSTODIA", trimmed],
    queryFn: () =>
      api.get<{ sets: TireSetDTO[] }>(`/api/admin/tire-hotel?status=EN_CUSTODIA&q=${encodeURIComponent(trimmed)}`),
    enabled,
    staleTime: 10_000,
  });

  const busy = enabled && (searchBusy || partsBusy || tiresBusy);

  const options = useMemo<OmniOption[]>(() => {
    if (!enabled) return [];
    const list: OmniOption[] = [];
    for (const o of searchData?.orders ?? []) {
      list.push({ kind: "order", id: o.id, orderNumber: o.orderNumber, plate: o.plate, status: o.status });
    }
    for (const v of searchData?.vehicles ?? []) {
      list.push({ kind: "vehicle", plate: v.plate, label: v.label, customerName: v.customerName });
    }
    for (const c of searchData?.customers ?? []) {
      list.push({ kind: "customer", id: c.id, fullName: c.fullName, phone: c.phone });
    }
    for (const p of inventoryData?.items ?? []) {
      list.push({ kind: "part", item: p });
    }
    for (const s of tiresData?.sets ?? []) {
      list.push({ kind: "tire", set: s });
    }
    return list.slice(0, 40);
  }, [enabled, searchData, inventoryData, tiresData]);

  // Agrupar preservando el orden canónico de secciones.
  const grouped = useMemo(() => {
    const groups: { kind: OmniOption["kind"]; items: OmniOption[] }[] = [];
    for (const kind of KIND_ORDER) {
      const items = options.filter((o) => o.kind === kind);
      if (items.length > 0) groups.push({ kind, items });
    }
    return groups;
  }, [options]);

  useEffect(() => {
    // Mantener la opción activa visible al navegar.
    const el = listRef.current?.querySelector<HTMLElement>(`[data-omni-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function execute(option: OmniOption): void {
    switch (option.kind) {
      case "order":
        onSelectOrder(option.id);
        onClose();
        break;
      case "vehicle": {
        const [make, ...rest] = option.label.split(" ");
        onPrefillIntake({ plate: option.plate, make: make ?? "", model: rest.join(" "), fullName: option.customerName });
        onClose();
        break;
      }
      case "customer":
        onPrefillIntake({ fullName: option.fullName, phone: option.phone });
        onClose();
        break;
      case "part":
        onOpenPanel("stock");
        onClose();
        break;
      case "tire": {
        const match = orders.find((o) => o.plate === option.set.plate);
        if (match) {
          onSelectOrder(match.id);
        }
        onClose();
        break;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (options.length === 0 ? 0 : (i + 1) % options.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (options.length === 0 ? 0 : (i - 1 + options.length) % options.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) execute(option);
    }
  }

  let runningIndex = -1;

  return (
    <>
      {/* Input principal */}
      <div className="flex items-center gap-3 border-b border-carbon-800 px-4 py-3">
        <Search className="size-5 shrink-0 text-oscar-yellow" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="AA123BB · Giménez · ORD-2584 · filtro · RACK-A2…"
          autoFocus
          className="min-w-0 flex-1 bg-transparent font-mono text-base tracking-wide text-titanium outline-none placeholder:text-carbon-600"
          aria-label="Consulta de búsqueda universal"
          autoComplete="off"
          spellCheck={false}
        />
        {busy && <Loader2 className="size-4 animate-spin text-oscar-yellow" aria-hidden />}
        <kbd className="hidden shrink-0 rounded border border-carbon-700 bg-carbon-950 px-1.5 py-0.5 font-mono text-[0.6rem] text-steel sm:inline" aria-hidden>
          ESC
        </kbd>
      </div>

        {/* Resultados */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto" role="listbox" aria-label="Resultados de búsqueda">
          {q.trim().length < 2 && (
            <div className="space-y-2 px-5 py-8 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-lead">
                Escribí al menos 2 caracteres
              </p>
              <p className="text-xs text-carbon-600">
                Filtra simultáneamente órdenes, clientes, vehículos, los 26 SKUs del almacén y racks del hotel de neumáticos.
              </p>
            </div>
          )}

          {q.trim().length >= 2 && !busy && options.length === 0 && (
            <p className="px-5 py-8 text-center font-mono text-xs text-lead">
              Sin resultados para “{q.trim()}”
            </p>
          )}

          {grouped.map((group) => {
            const meta = KIND_META[group.kind];
            const Icon = meta.icon;
            return (
              <div key={group.kind}>
                <p className="label-tech sticky top-0 z-10 flex items-center gap-2 border-y border-carbon-800/70 bg-carbon-900/95 px-4 py-1.5 backdrop-blur-sm">
                  <Icon className="size-3" aria-hidden /> {meta.label}
                  <span className="ml-auto font-mono text-[0.55rem] tracking-widest text-carbon-600">{meta.hint}</span>
                </p>
                {group.items.map((option) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={`${option.kind}-${index}`}
                      role="option"
                      aria-selected={active}
                      data-omni-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => execute(option)}
                      className={cn(
                        "flex w-full items-center gap-3 border-l-2 px-4 py-2.5 text-left transition-colors",
                        active ? "border-oscar-yellow bg-oscar-yellow/8" : "border-transparent hover:bg-carbon-800/60",
                      )}
                    >
                      <OmniOptionRow option={option} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 border-t border-carbon-800 bg-carbon-950/60 px-4 py-2 font-mono text-[0.58rem] uppercase tracking-widest text-carbon-600">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>esc cerrar</span>
          <span className="ml-auto text-steel">{options.length} resultados</span>
        </div>
    </>
  );
}

/** Wrapper del dialog — el cuerpo monta fresco en cada apertura. */
export function CockpitOmnisearch(props: OmnisearchProps) {
  const { open, onOpenChange, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 border-carbon-700 bg-carbon-900 p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Búsqueda universal del taller</DialogTitle>
          <DialogDescription>Patente, cliente, orden, SKU de almacén o posición de rack.</DialogDescription>
        </DialogHeader>
        {open && <OmniPaletteBody {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function OmniOptionRow({ option }: { option: OmniOption }) {
  switch (option.kind) {
    case "order":
      return (
        <>
          <PlateBadge plate={option.plate} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-xs font-bold text-titanium">{option.orderNumber}</span>
            <span className="block text-[0.65rem] text-lead">Abrir ficha técnica en el dock</span>
          </span>
          <StatusBadge status={option.status} withIcon={false} />
        </>
      );
    case "vehicle":
      return (
        <>
          <PlateBadge plate={option.plate} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-titanium">{option.label}</span>
            <span className="block truncate font-mono text-[0.65rem] text-lead">{option.customerName}</span>
          </span>
          <span className="shrink-0 rounded border border-oscar-yellow/40 bg-oscar-yellow/5 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase text-oscar-yellow">
            Prefill alta
          </span>
        </>
      );
    case "customer":
      return (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-carbon-700 bg-carbon-950 text-steel">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-titanium">{option.fullName}</span>
            <span className="block font-mono text-[0.65rem] text-lead">{option.phone}</span>
          </span>
          <span className="shrink-0 rounded border border-oscar-yellow/40 bg-oscar-yellow/5 px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase text-oscar-yellow">
            Prefill alta
          </span>
        </>
      );
    case "part": {
      const p = option.item;
      const low = p.stockQuantity <= p.reorderPoint;
      return (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-carbon-700 bg-carbon-950 font-mono text-[0.55rem] font-bold text-steel">
            SKU
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-titanium">
              <span className="font-mono text-xs font-bold text-oscar-yellow">{p.sku}</span> — {p.description}
            </span>
            <span className="block font-mono text-[0.65rem] text-lead">
              {p.location ? `Ubicación ${p.location} · ` : ""}reponer en {p.reorderPoint}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.6rem] font-bold tabular-nums",
              low ? "border-oscar-red/50 bg-oscar-red/10 text-oscar-red" : "border-bay-free/40 bg-bay-free/10 text-bay-free",
            )}
          >
            stock {p.stockQuantity}
          </span>
        </>
      );
    }
    case "tire": {
      const s = option.set;
      return (
        <>
          <span className="grid size-9 shrink-0 place-items-center rounded-md border border-bay-test/40 bg-bay-test/10 text-bay-test">
            <CircleDot className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-titanium">
              {s.brand} {s.size} — <span className="font-mono font-bold text-bay-test">{s.rack}/{s.level}/{s.position}</span>
            </span>
            <span className="block truncate font-mono text-[0.65rem] text-lead">
              {s.plate} · {s.customer}
            </span>
          </span>
          <PlateBadge plate={s.plate} size="sm" />
        </>
      );
    }
  }
}
