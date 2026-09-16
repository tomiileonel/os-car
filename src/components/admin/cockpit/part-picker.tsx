"use client";

/**
 * OS-CAR Cockpit — SELECTOR DE REPUESTOS DEL ALMACÉN (en vivo).
 * Conexión directa con los 26 SKUs: buscador instantáneo, stepper de
 * cantidad, precio editable (sugerido +35% sobre costo) y descuento de
 * stock al confirmar (movimiento RESERVA vía API).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { money } from "@/lib/oscar";
import type { InventoryDTO, InventoryItemDTO } from "@/components/admin/cockpit/shared";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Precio sugerido +35% sobre el costo, redondeado a $100. */
function suggestedPrice(item: InventoryItemDTO): string {
  if (item.unitCost == null || item.unitCost <= 0) return "";
  return String(Math.ceil((item.unitCost * 1.35) / 100) * 100);
}

export function PartPicker({
  orderId,
  onDone,
  onOpenPanel,
}: {
  orderId: string;
  onDone: () => void;
  onOpenPanel: () => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory", debounced],
    queryFn: () =>
      api.get<InventoryDTO>(`/api/admin/inventory${debounced.length >= 2 ? `?q=${encodeURIComponent(debounced)}` : ""}`),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  function expand(item: InventoryItemDTO): void {
    setExpandedId((prev) => (prev === item.id ? null : item.id));
    setQty("1");
    setPrice(suggestedPrice(item));
  }

  async function confirm(item: InventoryItemDTO): Promise<void> {
    const quantity = Math.max(1, Math.round(Number(qty) || 1));
    const unitPrice = Math.max(0, Number(price) || 0);
    if (busy) return;
    if (quantity > item.stockQuantity) {
      toast({
        title: "Stock insuficiente",
        description: `${item.sku}: disponible ${item.stockQuantity}, solicitado ${quantity}.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/admin/orders/${orderId}/part-items`, {
        description: item.description,
        quantity,
        unitPriceCharged: unitPrice,
        inventoryItemId: item.id,
        unitCost: item.unitCost ?? undefined,
        partNumber: item.sku,
      });
      toast({
        title: `${item.sku} agregado ✔`,
        description: `Stock descontado: ${quantity} un. — ${item.description}`,
      });
      setExpandedId(null);
      setQty("1");
      setPrice("");
      onDone();
    } catch (e) {
      toast({ title: "No se pudo agregar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-carbon-800 bg-carbon-950/60 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="label-tech flex items-center gap-1.5">
          <Package className="size-3" aria-hidden /> Desde almacén — descuento en vivo
        </p>
        <button
          onClick={onOpenPanel}
          className="font-mono text-[0.58rem] uppercase tracking-widest text-lead underline-offset-2 transition-colors hover:text-oscar-yellow hover:underline"
        >
          ver stock completo ↓
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-lead" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar SKU o repuesto… (filtro de aceite, pastillas…)"
          className="h-10 pl-9 text-sm"
        />
      </div>

      <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 py-6 font-mono text-xs text-lead">
            <Loader2 className="size-4 animate-spin text-oscar-yellow" aria-hidden /> consultando almacén…
          </p>
        )}
        {!isLoading && items.length === 0 && (
          <p className="py-6 text-center font-mono text-xs text-lead">Sin SKUs que coincidan.</p>
        )}
        {items.map((item) => {
          const low = item.stockQuantity <= item.reorderPoint;
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-md border transition-colors",
                expanded ? "border-oscar-yellow/50 bg-oscar-yellow/5" : "border-carbon-800 bg-carbon-900/70 hover:border-steel/40",
              )}
            >
              <button
                onClick={() => expand(item)}
                className="flex w-full items-center gap-2.5 p-2.5 text-left"
                aria-expanded={expanded}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-titanium">
                    <span className="font-mono font-bold text-oscar-yellow">{item.sku}</span> — {item.description}
                  </span>
                  <span className="block font-mono text-[0.58rem] text-lead">
                    {item.location ? `Ubic. ${item.location} · ` : ""}
                    costo {item.unitCost != null ? money(item.unitCost) : "—"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.58rem] font-bold tabular-nums",
                    low ? "border-oscar-red/50 bg-oscar-red/10 text-oscar-red" : "border-bay-free/40 bg-bay-free/10 text-bay-free",
                  )}
                >
                  {item.stockQuantity} un
                </span>
              </button>

              {expanded && (
                <div className="flex flex-wrap items-end gap-2 border-t border-carbon-800/70 p-2.5">
                  <div>
                    <p className="mb-1 font-mono text-[0.55rem] uppercase tracking-widest text-lead">Cantidad</p>
                    <div className="flex items-center gap-1">
                      <Button variant="carbon" size="icon-sm" aria-label="Restar unidad" onClick={() => setQty((v) => String(Math.max(1, Number(v) - 1)))}>
                        <Minus className="size-3.5" aria-hidden />
                      </Button>
                      <span className="w-10 text-center font-mono text-sm font-bold tabular-nums text-titanium">{qty}</span>
                      <Button
                        variant="carbon"
                        size="icon-sm"
                        aria-label="Sumar unidad"
                        disabled={Number(qty) >= item.stockQuantity}
                        onClick={() => setQty((v) => String(Number(v) + 1))}
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-28 flex-1">
                    <p className="mb-1 font-mono text-[0.55rem] uppercase tracking-widest text-lead">Precio un. (sugerido +35%)</p>
                    <Input
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      className="h-9 text-sm"
                      placeholder="0"
                    />
                  </div>
                  <Button onClick={() => confirm(item)} disabled={busy || item.stockQuantity < 1} size="sm">
                    {busy && expanded ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                    Agregar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
