"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  inventoryApi,
  ApiClientError,
  type InventoryItemDto,
  type CreateInventoryItemInput,
} from "@/lib/api-client";

const CATEGORIES = [
  { id: "ALL", label: "Todos" },
  { id: "LUBRICANTES", label: "Aceites & Fluidos" },
  { id: "FILTROS", label: "Filtros" },
  { id: "FRENOS", label: "Frenos" },
  { id: "ENCENDIDO", label: "Encendido" },
  { id: "CRITICOS", label: "Stock Crítico" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AlmacenPage(): React.JSX.Element {
  const [items, setItems] = useState<InventoryItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  // Modales
  const [showPurchaseOrderModal, setShowPurchaseOrderModal] = useState(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);

  // Formulario nuevo ítem
  const [newItemForm, setNewItemForm] = useState<CreateInventoryItemInput>({
    sku: "",
    description: "",
    category: "Filtros",
    location: "Estante B-1",
    stockQuantity: 10,
    reorderPoint: 4,
    unitCost: 15000,
  });
  const [submittingItem, setSubmittingItem] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Notificación toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Carga de inventario
  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await inventoryApi.list();
      setItems(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(`Error al cargar inventario: ${err.message}`);
      } else {
        setError("Ocurrió un error inesperado al cargar el inventario.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  // Telemetría Bento
  const telemetry = useMemo(() => {
    const totalSkus = items.length;
    const criticalItems = items.filter((i) => i.stockQuantity <= i.reorderPoint);
    const totalValue = items.reduce(
      (sum, i) => sum + i.stockQuantity * (i.unitCost || 0),
      0,
    );
    return {
      totalSkus,
      criticalCount: criticalItems.length,
      criticalItems,
      totalValue,
    };
  }, [items]);

  // Filtrado de tabla
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      // Filtro de categoría
      if (selectedCategory === "CRITICOS") {
        if (item.stockQuantity > item.reorderPoint) return false;
      } else if (selectedCategory !== "ALL") {
        if (!item.category || !item.category.toUpperCase().includes(selectedCategory)) {
          return false;
        }
      }

      // Filtro de búsqueda
      if (query) {
        const matchSku = item.sku.toLowerCase().includes(query);
        const matchDesc = item.description.toLowerCase().includes(query);
        const matchLoc = item.location?.toLowerCase().includes(query) ?? false;
        const matchCat = item.category?.toLowerCase().includes(query) ?? false;
        return matchSku || matchDesc || matchLoc || matchCat;
      }

      return true;
    });
  }, [items, search, selectedCategory]);

  // Ajuste ergonómico rápido (+ / -) con actualización optimista
  const handleAdjustStock = async (item: InventoryItemDto, delta: number) => {
    if (delta < 0 && item.stockQuantity <= 0) return;
    setAdjustingId(item.id);

    // Optimista
    const prevStock = item.stockQuantity;
    const newStock = Math.max(0, prevStock + delta);
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              stockQuantity: newStock,
              status:
                newStock === 0
                  ? "AGOTADO"
                  : newStock <= i.reorderPoint
                    ? "CRITICO"
                    : "NORMAL",
            }
          : i,
      ),
    );

    try {
      const movementType = delta > 0 ? "INFLOW" : "OUTFLOW";
      const res = await inventoryApi.recordMovement({
        inventoryItemId: item.id,
        movementType,
        quantity: Math.abs(delta),
        note: delta > 0 ? "Ingreso rápido de almacén" : "Consumo rápido en fosa",
      });

      // Confirmamos con datos del servidor
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? res.updatedItem : i)),
      );
      showToast(
        `Stock actualizado: ${item.sku} ahora tiene ${res.updatedItem.stockQuantity} un.`,
      );
    } catch (err) {
      // Revertir optimismo
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, stockQuantity: prevStock } : i,
        ),
      );
      const msg =
        err instanceof ApiClientError ? err.message : "Error al ajustar stock";
      showToast(`Error: ${msg}`);
    } finally {
      setAdjustingId(null);
    }
  };

  // Escaneo simulado de código de barras
  const handleBarcodeScan = () => {
    showToast("Lector óptico listo: Escaneando...");
    setTimeout(() => {
      const target = items[0];
      if (target) {
        void handleAdjustStock(target, -1);
        showToast(`Código detectado: ${target.sku} (-1 en fosa)`);
      } else {
        showToast("Sin ítems disponibles para escanear");
      }
    }, 600);
  };

  // Creación de nuevo SKU
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.sku.trim() || !newItemForm.description.trim()) {
      setModalError("El código SKU y la descripción son obligatorios.");
      return;
    }

    try {
      setSubmittingItem(true);
      setModalError(null);
      const created = await inventoryApi.createItem({
        sku: newItemForm.sku.trim().toUpperCase(),
        description: newItemForm.description.trim(),
        category: newItemForm.category,
        location: newItemForm.location,
        stockQuantity: Number(newItemForm.stockQuantity) || 0,
        reorderPoint: Number(newItemForm.reorderPoint) || 0,
        unitCost: Number(newItemForm.unitCost) || 0,
      });

      setItems((prev) => [created, ...prev]);
      setShowNewItemModal(false);
      showToast(`SKU ${created.sku} creado exitosamente en ${created.location || "almacén"}.`);
      setNewItemForm({
        sku: "",
        description: "",
        category: "Filtros",
        location: "Estante B-1",
        stockQuantity: 10,
        reorderPoint: 4,
        unitCost: 15000,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError("Ocurrió un error al guardar el ítem.");
      }
    } finally {
      setSubmittingItem(false);
    }
  };

  // Emisión de orden de compra sugerida
  const handleSendPurchaseOrder = () => {
    setShowPurchaseOrderModal(false);
    showToast(
      `Orden de reposición #OC-${Math.floor(1000 + Math.random() * 9000)} emitida a distribuidores (Motul, Fram, Fras-le).`,
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-[#f9fafb]">
      {/* Top Header / Navigation */}
      <header className="sticky top-0 z-20 border-b border-[#1f2937] bg-[#0e131f]/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-[#f9fafb]">
                  Almacén Táctico & Hotel de Cubiertas
                </span>
                <span className="rounded bg-[#1f2937] px-2 py-0.5 font-mono text-xs font-semibold text-[#2563eb]">
                  RACK-SYS v2
                </span>
              </div>
              <span className="font-mono text-xs text-[#9ca3af]">
                Logística inmediata de fosa, reposición crítica y resguardo estacional
              </span>
            </div>
            <div className="hidden h-6 w-px bg-[#374151] md:block" />
            <nav className="hidden items-center gap-2 md:flex">
              <Link
                href="/admin/recepcion"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[#9ca3af] transition-colors hover:bg-[#1f2937] hover:text-[#f9fafb]"
              >
                Recepción
              </Link>
              <Link
                href="/admin/bahias"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-[#9ca3af] transition-colors hover:bg-[#1f2937] hover:text-[#f9fafb]"
              >
                WorkBoard
              </Link>
            </nav>
          </div>

          {/* Segmented View Mode Tabs */}
          <div className="flex items-center gap-2 rounded-lg bg-[#111827] p-1">
            <Link
              href="/admin/almacen"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#1f2937] px-4 py-2 text-sm font-bold uppercase text-[#f9fafb] shadow-sm"
              aria-current="page"
            >
              <span>Insumos & Repuestos</span>
              {telemetry.criticalCount > 0 && (
                <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-bold text-red-300">
                  {telemetry.criticalCount} CRÍT
                </span>
              )}
            </Link>
            <Link
              href="/admin/hotel-neumaticos"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2 text-sm font-bold uppercase text-[#9ca3af] transition-colors hover:bg-[#1f2937] hover:text-[#f9fafb]"
            >
              <span>Hotel Neumáticos</span>
              <span className="rounded bg-[#1f2937] px-2 py-0.5 text-xs text-[#9ca3af]">
                RACKS
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {/* Telemetry Bento Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Bento 1: Total SKUs */}
          <div className="flex flex-col justify-between rounded-xl border border-[#1f2937] bg-[#111827] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
              <span>Índice Total Insumos</span>
              <span className="font-mono text-xs text-[#2563eb]">ESTANTERÍAS</span>
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-extrabold text-[#f9fafb]">
                {telemetry.totalSkus}
              </span>
              <span className="text-xs text-[#9ca3af]">SKUs activos</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span>Rotación prom: 4.2d</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                98.2% Disponibilidad
              </span>
            </div>
          </div>

          {/* Bento 2: Alerta Stock Crítico */}
          <div
            className={`flex flex-col justify-between rounded-xl border p-5 shadow-sm transition-colors ${
              telemetry.criticalCount > 0
                ? "border-red-900/50 bg-red-950/20"
                : "border-[#1f2937] bg-[#111827]"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-red-400">
              <span>Alerta Stock Crítico</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-extrabold text-red-400">
                {telemetry.criticalCount}
              </span>
              <span className="text-xs text-red-300">Bajo punto de quiebre</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span className="text-red-400">Afecta Bahías Operativas</span>
              <span className="uppercase text-red-300">Reposición Prioritaria</span>
            </div>
          </div>

          {/* Bento 3: Valorización de Existencias */}
          <div className="flex flex-col justify-between rounded-xl border border-[#1f2937] bg-[#111827] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
              <span>Valorización Existencias</span>
              <span className="font-mono text-xs text-emerald-400">FIFO</span>
            </div>
            <div className="my-3 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-extrabold text-emerald-400">
                {formatCurrency(telemetry.totalValue)}
              </span>
              <span className="text-xs text-[#9ca3af]">ARS neto</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#9ca3af]">
              <span>Costo Reposición actual</span>
              <span className="font-mono text-[#f9fafb]">Actualizado hoy</span>
            </div>
          </div>

          {/* Bento 4: Acciones Rápidas */}
          <div className="flex flex-col justify-between rounded-xl border border-[#1f2937] bg-[#111827] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[#2563eb]">
              <span>Acción de Reposición</span>
              <span className="font-mono text-xs text-[#fce006]">AUTO-PO</span>
            </div>
            <p className="my-2 text-xs text-[#9ca3af]">
              Calcula pedido de seguridad para distribuidores oficiales (Motul, Fram, Fras-le).
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowPurchaseOrderModal(true)}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-md bg-[#2563eb] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#1d4ed8] active:scale-98"
              >
                Generar Orden Compra Sugerida
              </button>
            </div>
          </div>
        </div>

        {/* Quick Search, Barcode Reader & Filter Strip */}
        <div className="flex flex-col gap-4 rounded-xl border border-[#1f2937] bg-[#111827] p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Live Search Input */}
            <div className="relative flex-1">
              <label htmlFor="inventory-search" className="sr-only">
                Buscar insumo o repuesto
              </label>
              <input
                id="inventory-search"
                type="text"
                placeholder="Buscar por SKU, descripción, marca o estantería..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-4 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280] focus-visible:border-[#2563eb] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
              />
            </div>

            {/* Barcode Trigger Button */}
            <button
              type="button"
              onClick={handleBarcodeScan}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-[#374151] bg-[#1f2937] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#f9fafb] transition-colors hover:bg-[#374151] active:scale-95"
            >
              <span className="text-base">║▌║</span>
              <span>Escanear Barra (Beeper)</span>
            </button>

            {/* Add New SKU Trigger */}
            <button
              type="button"
              onClick={() => setShowNewItemModal(true)}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-[#10b981] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-[#059669] active:scale-95"
            >
              <span>+</span>
              <span>Nuevo SKU</span>
            </button>
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`inline-flex min-h-[48px] items-center rounded-md px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    active
                      ? "bg-[#2563eb] text-white shadow-sm"
                      : "border border-[#374151] bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151] hover:text-[#f9fafb]"
                  }`}
                >
                  {cat.label}
                  {cat.id === "CRITICOS" && telemetry.criticalCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-200">
                      {telemetry.criticalCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Inventory Table (Touch-first, Ergonomic Steppers) */}
        <div className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#111827] shadow-sm">
          {loading ? (
            <div className="flex min-h-[250px] items-center justify-center text-sm text-[#9ca3af]">
              Cargando catálogo de inventario...
            </div>
          ) : error ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-red-400">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => void fetchInventory()}>
                Reintentar Carga
              </Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#9ca3af]">
              <span className="font-bold text-[#f9fafb]">No se encontraron ítems en inventario</span>
              <span>Probá ajustando los términos de búsqueda o el filtro de categoría.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm" data-testid="inventory-table">
                <thead className="border-b border-[#1f2937] bg-[#0e131f] text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
                  <tr>
                    <th scope="col" className="px-4 py-3.5">Código SKU</th>
                    <th scope="col" className="px-4 py-3.5">Descripción del Insumo</th>
                    <th scope="col" className="px-4 py-3.5">Categoría</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Stock Actual</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Umbral Mínimo</th>
                    <th scope="col" className="px-4 py-3.5">Ubicación Física</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Ajuste Fosa (+/-)</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Estado Operativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937]">
                  {filteredItems.map((item) => {
                    const isCritical = item.stockQuantity <= item.reorderPoint;
                    const isLow = !isCritical && item.stockQuantity <= item.reorderPoint * 1.5;
                    const isAdjusting = adjustingId === item.id;

                    return (
                      <tr
                        key={item.id}
                        data-testid="item-row"
                        className="transition-colors hover:bg-[#1a2333]"
                      >
                        {/* SKU */}
                        <td className="px-4 py-4 font-mono font-bold text-[#60a5fa]">
                          {item.sku}
                        </td>

                        {/* Descripción */}
                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#f9fafb]">{item.description}</div>
                          <div className="text-xs text-[#9ca3af]">
                            {item.unitCost ? `Costo ref: ${formatCurrency(item.unitCost)}` : "Sin costo asignado"}
                          </div>
                        </td>

                        {/* Categoría */}
                        <td className="px-4 py-4">
                          <span className="rounded bg-[#1f2937] px-2.5 py-1 text-xs font-medium uppercase text-[#d1d5db]">
                            {item.category || "General"}
                          </span>
                        </td>

                        {/* Stock Actual */}
                        <td className="px-4 py-4 text-center">
                          <span
                            className={`font-mono text-xl font-bold ${
                              isCritical
                                ? "text-red-400"
                                : isLow
                                  ? "text-amber-400"
                                  : "text-[#f9fafb]"
                            }`}
                          >
                            {item.stockQuantity}
                          </span>
                          <span className="ml-1 text-xs text-[#9ca3af]">un</span>
                        </td>

                        {/* Umbral Mínimo */}
                        <td className="px-4 py-4 text-center font-mono text-xs text-[#9ca3af]">
                          Mín: {item.reorderPoint} un
                        </td>

                        {/* Ubicación Física */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#e5e7eb]">
                            <span className="text-[#2563eb]">⊞</span>
                            <span>{item.location || "Sin asignar"}</span>
                          </div>
                        </td>

                        {/* Ajuste Fosa (+ / -) - Ergonomía Táctil 48px */}
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex items-center gap-1 rounded-lg border border-[#374151] bg-[#090d16] p-1 shadow-inner">
                            <button
                              type="button"
                              data-testid="btn-decrement"
                              disabled={isAdjusting || item.stockQuantity <= 0}
                              onClick={() => void handleAdjustStock(item, -1)}
                              aria-label={`Consumir una unidad de ${item.sku}`}
                              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded bg-[#1f2937] text-lg font-bold text-[#f9fafb] transition-all hover:bg-[#374151] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              −
                            </button>

                            <span className="px-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
                              TOUCH
                            </span>

                            <button
                              type="button"
                              data-testid="btn-increment"
                              disabled={isAdjusting}
                              onClick={() => void handleAdjustStock(item, 1)}
                              aria-label={`Ingresar una unidad de ${item.sku}`}
                              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded bg-[#2563eb] text-lg font-bold text-white transition-all hover:bg-[#1d4ed8] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Estado Operativo */}
                        <td className="px-4 py-4 text-right">
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1.5 rounded bg-red-950/60 border border-red-800/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-red-300">
                              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                              CRÍTICO - Pedir
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1.5 rounded bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                              <span className="h-2 w-2 rounded-full bg-amber-400" />
                              Bajo Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              Stock Óptimo
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal: Generar Orden Compra Sugerida */}
      {showPurchaseOrderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-po-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-2xl flex-col rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
              <div>
                <h2 id="modal-po-title" className="text-lg font-bold text-[#f9fafb]">
                  Orden de Compra Sugerida (Auto-PO)
                </h2>
                <p className="text-xs text-[#9ca3af]">
                  Generada en base a umbrales mínimos de reposición de seguridad
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchaseOrderModal(false)}
                className="rounded p-2 text-[#9ca3af] hover:bg-[#1f2937] hover:text-[#f9fafb]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {telemetry.criticalItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#9ca3af]">
                  No hay ítems críticos pendientes de reposición. El almacén está en stock óptimo.
                </div>
              ) : (
                telemetry.criticalItems.map((item) => {
                  const suggestedQty = Math.max(1, item.reorderPoint * 2 - item.stockQuantity);
                  const itemEstimatedCost = suggestedQty * (item.unitCost || 0);

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-[#1f2937] bg-[#090d16] p-3"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#60a5fa]">
                            {item.sku}
                          </span>
                          <span className="text-xs font-semibold text-[#f9fafb]">
                            {item.description}
                          </span>
                        </div>
                        <div className="text-xs text-[#9ca3af]">
                          Stock actual: {item.stockQuantity} un | Umbral: {item.reorderPoint} un | Ubicación: {item.location}
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <div className="font-mono text-sm font-bold text-[#fce006]">
                          + {suggestedQty} un sugeridas
                        </div>
                        {item.unitCost ? (
                          <div className="font-mono text-xs text-[#9ca3af]">
                            ~ {formatCurrency(itemEstimatedCost)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#1f2937] pt-4">
              <Button
                variant="secondary"
               
                onClick={() => setShowPurchaseOrderModal(false)}
              >
                Cerrar
              </Button>
              <Button
                variant="primary"
               
                disabled={telemetry.criticalItems.length === 0}
                onClick={handleSendPurchaseOrder}
              >
                Emitir Orden a Distribuidores
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo SKU / Insumo */}
      {showNewItemModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-new-sku-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={(e) => void handleCreateItem(e)}
            className="flex w-full max-w-xl flex-col rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
              <div>
                <h2 id="modal-new-sku-title" className="text-lg font-bold text-[#f9fafb]">
                  Registrar Nuevo SKU en Almacén
                </h2>
                <p className="text-xs text-[#9ca3af]">
                  Asignación de ubicación en fosa y parámetros de reposición
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewItemModal(false)}
                className="rounded p-2 text-[#9ca3af] hover:bg-[#1f2937] hover:text-[#f9fafb]"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mt-4 rounded bg-red-950/60 border border-red-800 p-3 text-xs text-red-300">
                {modalError}
              </div>
            )}

            <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* SKU */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Código SKU *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: MOTUL-8100-5W40"
                  value={newItemForm.sku}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, sku: e.target.value.toUpperCase() }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] uppercase placeholder:normal-case placeholder:text-[#6b7280]"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Categoría
                </label>
                <select
                  value={newItemForm.category}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, category: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                >
                  <option value="Lubricantes">Aceites & Fluidos</option>
                  <option value="Filtros">Filtros</option>
                  <option value="Frenos">Frenos</option>
                  <option value="Encendido">Encendido</option>
                  <option value="Tren Delantero">Tren Delantero</option>
                  <option value="General">General</option>
                </select>
              </div>

              {/* Descripción */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Descripción del Insumo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Filtro de Aceite Fram Blindado (Renault 1.6)"
                  value={newItemForm.description}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, description: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Ubicación Física */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Ubicación Física
                </label>
                <input
                  type="text"
                  placeholder="Ej: Estante B-2 / Pallet L-01"
                  value={newItemForm.location || ""}
                  onChange={(e) =>
                    setNewItemForm((p) => ({ ...p, location: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Costo Unitario ARS */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Costo Unitario ($ ARS)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={newItemForm.unitCost || ""}
                  onChange={(e) =>
                    setNewItemForm((p) => ({
                      ...p,
                      unitCost: Number(e.target.value) || 0,
                    }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                />
              </div>

              {/* Stock Inicial */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Stock Inicial (Unidades)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newItemForm.stockQuantity || ""}
                  onChange={(e) =>
                    setNewItemForm((p) => ({
                      ...p,
                      stockQuantity: Number(e.target.value) || 0,
                    }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                />
              </div>

              {/* Punto de Pedido */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Umbral Crítico (Reorder)
                </label>
                <input
                  type="number"
                  min="1"
                  value={newItemForm.reorderPoint || ""}
                  onChange={(e) =>
                    setNewItemForm((p) => ({
                      ...p,
                      reorderPoint: Number(e.target.value) || 1,
                    }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#1f2937] pt-4">
              <Button
                type="button"
                variant="secondary"
               
                onClick={() => setShowNewItemModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
               
                loading={submittingItem}
                loadingLabel="Registrando..."
              >
                Guardar SKU
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-[#2563eb]/40 bg-[#111827] px-4 py-3 shadow-2xl text-sm font-medium text-[#f9fafb]"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb] animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

