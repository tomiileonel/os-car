"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  tireHotelApi,
  ApiClientError,
  type TireSetDto,
  type CheckInTireSetInput,
  type TireSeason,
} from "@/lib/api-client";

const TOTAL_SLOTS = 40;

function formatPlate(plate: string): string {
  const clean = plate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (clean.length === 7) {
    return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 7)}`;
  }
  if (clean.length === 6) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)}`;
  }
  return plate.toUpperCase();
}

function calculateDaysInStorage(checkInDateStr: string): number {
  const checkIn = new Date(checkInDateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - checkIn.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export default function HotelNeumaticosPage(): React.JSX.Element {
  const [tireSets, setTireSets] = useState<TireSetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"ALL" | "WARNING" | "DELIVERED">("ALL");

  // Modales
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [qrModalSet, setQrModalSet] = useState<TireSetDto | null>(null);

  // Formulario nuevo check-in
  const [checkInForm, setCheckInForm] = useState<CheckInTireSetInput>({
    licensePlate: "",
    customerName: "",
    customerPhone: "",
    make: "Toyota",
    model: "Corolla",
    brand: "Pirelli",
    size: "205/55 R16",
    season: "VERANO",
    dot: "DOT 1224",
    rack: "Rack Aéreo N-15",
    level: "Nivel 2",
    position: "Posición 15",
    avgTreadDepthMm: 5.5,
    notes: "Fundas plásticas protectoras colocadas.",
  });
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Carga de sets en custodia
  const fetchTireSets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await tireHotelApi.list();
      setTireSets(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(`Error al cargar el Hotel de Neumáticos: ${err.message}`);
      } else {
        setError("Ocurrió un error inesperado al cargar las custodias.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTireSets();
  }, [fetchTireSets]);

  // Métricas de ocupación
  const metrics = useMemo(() => {
    const activeSets = tireSets.filter((s) => s.status === "EN_CUSTODIA");
    const warningSets = activeSets.filter((s) => s.suggestReplacement || s.minTreadDepthMm <= 2.0);
    const occupancyPercentage = Math.round((activeSets.length / TOTAL_SLOTS) * 100);
    return {
      activeCount: activeSets.length,
      warningCount: warningSets.length,
      occupancyPercentage,
      totalSlots: TOTAL_SLOTS,
    };
  }, [tireSets]);

  // Filtrado de la lista
  const filteredSets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tireSets.filter((set) => {
      // Filtro de estado
      if (filterMode === "DELIVERED") {
        if (set.status !== "ENTREGADO") return false;
      } else if (filterMode === "WARNING") {
        if (set.status !== "EN_CUSTODIA") return false;
        if (!set.suggestReplacement && set.minTreadDepthMm > 2.0) return false;
      } else {
        // "ALL": mostrar custodias activas por defecto
        if (set.status !== "EN_CUSTODIA") return false;
      }

      // Filtro de texto
      if (query) {
        const matchPlate = set.vehiclePlate.toLowerCase().includes(query);
        const matchCustomer = set.customerName.toLowerCase().includes(query);
        const matchPhone = set.customerPhone.toLowerCase().includes(query);
        const matchBrand = set.brand.toLowerCase().includes(query);
        const matchRack = set.rack.toLowerCase().includes(query);
        const matchVehicle = set.vehicleLabel.toLowerCase().includes(query);
        return matchPlate || matchCustomer || matchPhone || matchBrand || matchRack || matchVehicle;
      }

      return true;
    });
  }, [tireSets, search, filterMode]);

  // Registro de nuevo check-in
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const plate = checkInForm.licensePlate?.trim() || checkInForm.vehiclePlate?.trim() || "";
    if (!plate || !checkInForm.customerName.trim() || !checkInForm.brand.trim() || !checkInForm.size.trim()) {
      setModalError("Patente, nombre de cliente, marca y medida son obligatorios.");
      return;
    }

    try {
      setSubmittingCheckIn(true);
      setModalError(null);
      const created = await tireHotelApi.checkIn(checkInForm);
      setTireSets((prev) => [created, ...prev]);
      setShowCheckInModal(false);
      showToast(`Juego de neumáticos ingresado en ${created.rack}. Generando etiquetas QR...`);
      setCheckInForm({
        licensePlate: "",
        customerName: "",
        customerPhone: "",
        make: "Toyota",
        model: "Corolla",
        brand: "Pirelli",
        size: "205/55 R16",
        season: "VERANO",
        dot: "DOT 1224",
        rack: "Rack Aéreo N-15",
        level: "Nivel 2",
        position: "Posición 15",
        avgTreadDepthMm: 5.5,
        notes: "Fundas plásticas protectoras colocadas.",
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setModalError(err.message);
      } else {
        setModalError("Ocurrió un error al ingresar la custodia.");
      }
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  // Entrega / Checkout de juego
  const handleCheckOut = async (set: TireSetDto) => {
    const confirmDelivery = window.confirm(
      `¿Confirmar entrega del juego en ${set.rack} a ${set.customerName}?`,
    );
    if (!confirmDelivery) return;

    try {
      const updated = await tireHotelApi.checkOut(set.id, {
        deliveredTo: set.customerName,
      });
      setTireSets((prev) => prev.map((s) => (s.id === set.id ? updated : s)));
      showToast(`Juego entregado con éxito a ${set.customerName}. Slot ${set.rack} liberado.`);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al registrar entrega";
      showToast(`Error: ${msg}`);
    }
  };

  // Notificación de cotización por desgaste
  const handleNotifyQuote = (set: TireSetDto) => {
    showToast(`Preparando presupuesto de cubiertas ${set.size} para ${set.customerName} (+54 WhatsApp)...`);
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
                Logística inmediata de fosa, reposición crítica y resguardo estacional de clientes
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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2 text-sm font-bold uppercase text-[#9ca3af] transition-colors hover:bg-[#1f2937] hover:text-[#f9fafb]"
            >
              <span>Insumos & Repuestos</span>
            </Link>
            <Link
              href="/admin/hotel-neumaticos"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#1f2937] px-4 py-2 text-sm font-bold uppercase text-[#f9fafb] shadow-sm"
              aria-current="page"
            >
              <span>Hotel Neumáticos</span>
              <span className="rounded bg-[#090d16] px-2 py-0.5 text-xs font-mono text-[#60a5fa]">
                {metrics.activeCount}/{TOTAL_SLOTS} SLOTS
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {/* Hotel Status & Capacity Banner */}
        <div className="flex flex-col justify-between gap-6 rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-sm xl:flex-row xl:items-center">
          <div className="flex max-w-2xl flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md bg-[#1f2937] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#60a5fa]">
                Capacidad: {metrics.occupancyPercentage}% Ocupación
              </span>
              <span className="font-mono text-xs font-semibold text-[#9ca3af]">
                {metrics.activeCount} DE {TOTAL_SLOTS} JUEGOS ALMACENADOS
              </span>
              {metrics.warningCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-950/60 border border-red-800/60 px-2.5 py-0.5 text-xs font-bold text-red-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                  {metrics.warningCount} con desgaste crítico
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[#f9fafb]">
              Guarda Segura con Control Telemétrico de Desgaste
            </h1>
            <p className="text-sm text-[#9ca3af]">
              Cada juego ingresa protegido en funda termocontraíble, etiquetado con QR serializado y con medición en fosa del relieve milimétrico para venta preventiva de cubiertas nuevas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowCheckInModal(true)}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg transition-transform hover:bg-[#1d4ed8] active:scale-95"
            >
              <span>+</span>
              <span>Ingresar Nuevo Juego a Custodia</span>
            </button>
          </div>
        </div>

        {/* Rack Visual Map Mini-Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col rounded-lg border border-[#1f2937] bg-[#111827] p-3">
            <span className="font-mono text-xs font-semibold text-[#9ca3af]">RACK A (AÉREO)</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-lg font-bold text-[#f9fafb]">Slots 01 - 10</span>
              <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                Operativo
              </span>
            </div>
          </div>
          <div className="flex flex-col rounded-lg border border-[#1f2937] bg-[#111827] p-3">
            <span className="font-mono text-xs font-semibold text-[#9ca3af]">RACK B (MEDIO)</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-lg font-bold text-[#f9fafb]">Slots 11 - 20</span>
              <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                Operativo
              </span>
            </div>
          </div>
          <div className="flex flex-col rounded-lg border border-[#1f2937] bg-[#111827] p-3">
            <span className="font-mono text-xs font-semibold text-[#9ca3af]">RACK C (INFERIOR)</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-lg font-bold text-[#f9fafb]">Slots 21 - 30</span>
              <span className="rounded bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                Operativo
              </span>
            </div>
          </div>
          <div className="flex flex-col rounded-lg border border-[#1f2937] bg-[#111827] p-3">
            <span className="font-mono text-xs font-semibold text-[#9ca3af]">RACK D (ESPECIAL)</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-lg font-bold text-[#f9fafb]">Slots 31 - 40</span>
              <span className="rounded bg-blue-950/50 px-1.5 py-0.5 font-mono text-[11px] text-blue-400">
                Guarda Larga
              </span>
            </div>
          </div>
        </div>

        {/* Quick Search & Status Filter Strip */}
        <div className="flex flex-col gap-4 rounded-xl border border-[#1f2937] bg-[#111827] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <label htmlFor="tires-search" className="sr-only">
              Buscar en hotel de neumáticos
            </label>
            <input
              id="tires-search"
              type="text"
              placeholder="Buscar por cliente, teléfono, patente, medida o rack..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-4 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280] focus-visible:border-[#2563eb] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterMode("ALL")}
              className={`inline-flex min-h-[48px] items-center rounded-md px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                filterMode === "ALL"
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "border border-[#374151] bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151] hover:text-[#f9fafb]"
              }`}
            >
              En Custodia Activa ({metrics.activeCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("WARNING")}
              className={`inline-flex min-h-[48px] items-center rounded-md px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                filterMode === "WARNING"
                  ? "bg-red-900/80 text-white shadow-sm"
                  : "border border-[#374151] bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151] hover:text-[#f9fafb]"
              }`}
            >
              Sugerir Reemplazo (≤ 2.0 mm)
              {metrics.warningCount > 0 && (
                <span className="ml-1.5 rounded-full bg-red-800 px-1.5 py-0.5 text-[10px] text-white">
                  {metrics.warningCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("DELIVERED")}
              className={`inline-flex min-h-[48px] items-center rounded-md px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                filterMode === "DELIVERED"
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "border border-[#374151] bg-[#1f2937] text-[#9ca3af] hover:bg-[#374151] hover:text-[#f9fafb]"
              }`}
            >
              Historial Entregas
            </button>
          </div>
        </div>

        {/* Tire Hotel Custody Table */}
        <div className="overflow-hidden rounded-xl border border-[#1f2937] bg-[#111827] shadow-sm">
          <div className="flex flex-wrap items-center justify-between border-b border-[#1f2937] bg-[#0e131f] px-5 py-3 text-xs text-[#9ca3af]">
            <div className="flex items-center gap-2 font-mono font-bold uppercase text-[#f9fafb]">
              <span>⊡ Planilla de Custodia Activa & Calibración de Huella</span>
            </div>
            <div className="font-mono text-[11px] text-[#9ca3af]">
              CUSTODIA RESPALDADA CON PÓLIZA Nº TR-9941
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[250px] items-center justify-center text-sm text-[#9ca3af]">
              Cargando registros de custodia...
            </div>
          ) : error ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-red-400">
              <span>{error}</span>
              <Button variant="secondary" onClick={() => void fetchTireSets()}>
                Reintentar
              </Button>
            </div>
          ) : filteredSets.length === 0 ? (
            <div className="flex min-h-[250px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#9ca3af]">
              <span className="font-bold text-[#f9fafb]">No se encontraron juegos en custodia</span>
              <span>Probá cambiando el filtro o ingresá un nuevo juego con el botón superior.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm" data-testid="tires-table">
                <thead className="border-b border-[#1f2937] bg-[#0e131f] text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
                  <tr>
                    <th scope="col" className="px-4 py-3.5">Rack Asignado</th>
                    <th scope="col" className="px-4 py-3.5">Cliente & Teléfono</th>
                    <th scope="col" className="px-4 py-3.5">Vehículo & Patente</th>
                    <th scope="col" className="px-4 py-3.5">Neumáticos & Medida</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Temporada</th>
                    <th scope="col" className="px-4 py-3.5 text-center">Dibujo Remanente</th>
                    <th scope="col" className="px-4 py-3.5">Fecha Depósito</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2937]">
                  {filteredSets.map((set) => {
                    const isCriticalTread = set.suggestReplacement || set.minTreadDepthMm <= 2.0;
                    const daysInStorage = calculateDaysInStorage(set.checkInAt);
                    const isDelivered = set.status === "ENTREGADO";

                    return (
                      <tr
                        key={set.id}
                        data-testid="tire-set-row"
                        className="transition-colors hover:bg-[#1a2333]"
                      >
                        {/* Rack Asignado */}
                        <td className="px-4 py-4 font-mono font-bold text-[#60a5fa]">
                          <div className="flex items-center gap-1.5">
                            <span>⊞</span>
                            <span>{set.rack}</span>
                          </div>
                        </td>

                        {/* Cliente & Teléfono */}
                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#f9fafb]">{set.customerName}</div>
                          <div className="font-mono text-xs text-[#9ca3af]">
                            {set.customerPhone || "Sin teléfono"}
                          </div>
                        </td>

                        {/* Vehículo & Patente */}
                        <td className="px-4 py-4">
                          <div className="text-[#f9fafb]">{set.vehicleLabel}</div>
                          <div className="mt-1 inline-block rounded border border-[#374151] bg-[#090d16] px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest text-[#f9fafb]">
                            {formatPlate(set.vehiclePlate)}
                          </div>
                        </td>

                        {/* Neumáticos & Medida */}
                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#f9fafb]">
                            {set.size} (x{set.tires.length || 4})
                          </div>
                          <div className="text-xs text-[#9ca3af]">
                            {set.brand} {set.dot ? `• ${set.dot}` : ""}
                          </div>
                        </td>

                        {/* Temporada */}
                        <td className="px-4 py-4 text-center">
                          <span className="rounded bg-[#1f2937] px-2.5 py-1 text-xs font-medium uppercase text-[#d1d5db]">
                            {set.season === "VERANO"
                              ? "☀️ Verano"
                              : set.season === "INVIERNO"
                                ? "❄️ Invierno M+S"
                                : "🍂 Todo Clima"}
                          </span>
                        </td>

                        {/* Dibujo Remanente */}
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span
                              className={`font-mono text-lg font-bold ${
                                isCriticalTread ? "text-red-400" : "text-[#f9fafb]"
                              }`}
                            >
                              {set.minTreadDepthMm.toFixed(1)} mm
                            </span>
                            {isCriticalTread ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-red-950/70 border border-red-800/80 px-2 py-0.5 text-[10px] font-bold text-red-200 animate-pulse">
                                Sugerir Reemplazo
                              </span>
                            ) : (
                              <span className="mt-0.5 rounded bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-300">
                                Óptimo (+65%)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Fecha Depósito */}
                        <td className="px-4 py-4 font-mono text-xs text-[#9ca3af]">
                          <div>{new Date(set.checkInAt).toLocaleDateString("es-AR")}</div>
                          <div className="text-[11px] text-[#6b7280]">
                            {daysInStorage} días en guarda
                          </div>
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {isCriticalTread && !isDelivered && (
                              <button
                                type="button"
                                onClick={() => handleNotifyQuote(set)}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded bg-[#2563eb] px-3 py-1.5 text-xs font-bold uppercase text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
                              >
                                Presupuestar Nuevos
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setQrModalSet(set)}
                              title="Reimprimir etiquetas térmicas QR"
                              className="inline-flex min-h-[44px] items-center gap-1 rounded border border-[#374151] bg-[#1f2937] px-3 py-1.5 text-xs font-semibold text-[#f9fafb] transition-colors hover:bg-[#374151]"
                            >
                              <span>QR</span>
                            </button>

                            {!isDelivered ? (
                              <button
                                type="button"
                                onClick={() => void handleCheckOut(set)}
                                className="inline-flex min-h-[44px] items-center rounded border border-emerald-800/60 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-900/50"
                              >
                                Entregar
                              </button>
                            ) : (
                              <span className="rounded bg-[#1f2937] px-2.5 py-1 text-xs text-[#9ca3af]">
                                Entregado
                              </span>
                            )}
                          </div>
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

      {/* Modal: + Ingresar Nuevo Juego a Custodia */}
      {showCheckInModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-checkin-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={(e) => void handleCheckInSubmit(e)}
            className="flex w-full max-w-2xl flex-col rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
              <div>
                <h2 id="modal-checkin-title" className="text-lg font-bold text-[#f9fafb]">
                  Ingreso de Juego a Custodia (Hotel Neumáticos)
                </h2>
                <p className="text-xs text-[#9ca3af]">
                  Calibración de huella milimétrica y asignación de slot en rack
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckInModal(false)}
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
              {/* Patente */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Patente del Vehículo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: AF 419 LK / AB 123 CD"
                  value={checkInForm.licensePlate}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, licensePlate: e.target.value.toUpperCase() }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] uppercase placeholder:normal-case placeholder:text-[#6b7280]"
                />
              </div>

              {/* Nombre Cliente */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Nombre y Apellido Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mauricio Benítez"
                  value={checkInForm.customerName}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, customerName: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Teléfono */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="Ej: +54 376 449-0129"
                  value={checkInForm.customerPhone || ""}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, customerPhone: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Vehículo Modelo */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Modelo del Vehículo
                </label>
                <input
                  type="text"
                  placeholder="Ej: Volkswagen Amarok V6"
                  value={checkInForm.model || ""}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, model: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Marca Neumático */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Marca de Cubierta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Bridgestone / Pirelli / Michelin"
                  value={checkInForm.brand}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, brand: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Medida */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Medida y Rodado *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 255/60 R18"
                  value={checkInForm.size}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, size: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Temporada */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Temporada
                </label>
                <select
                  value={checkInForm.season}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, season: e.target.value as TireSeason }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                >
                  <option value="VERANO">☀️ Verano</option>
                  <option value="INVIERNO">❄️ Invierno M+S</option>
                  <option value="TODO_CLIMA">🍂 Todo Clima</option>
                </select>
              </div>

              {/* Código DOT */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Código DOT Fabricación
                </label>
                <input
                  type="text"
                  placeholder="Ej: DOT 3823"
                  value={checkInForm.dot || ""}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, dot: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb] placeholder:text-[#6b7280]"
                />
              </div>

              {/* Rack Asignado */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Rack Asignado
                </label>
                <select
                  value={checkInForm.rack}
                  onChange={(e) =>
                    setCheckInForm((p) => ({ ...p, rack: e.target.value }))
                  }
                  className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm text-[#f9fafb]"
                >
                  <option value="Rack Aéreo N-15">Rack Aéreo N-15 (Vacante)</option>
                  <option value="Rack Aéreo N-16">Rack Aéreo N-16 (Vacante)</option>
                  <option value="Rack Inferior S-04">Rack Inferior S-04 (Vacante)</option>
                  <option value="Rack Especial R-01">Rack Especial R-01 (Guarda Larga)</option>
                </select>
              </div>

              {/* Profundidad Promedio */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-[#9ca3af]">
                  Dibujo Remanente (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="12"
                  value={checkInForm.avgTreadDepthMm || 5.5}
                  onChange={(e) =>
                    setCheckInForm((p) => ({
                      ...p,
                      avgTreadDepthMm: Number(e.target.value) || 5.0,
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
               
                onClick={() => setShowCheckInModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
               
                loading={submittingCheckIn}
                loadingLabel="Guardando Custodia..."
              >
                Confirmar Ingreso & Imprimir QR
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Vista Previa Etiquetas QR */}
      {qrModalSet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-qr-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-xl flex-col rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1f2937] pb-4">
              <div>
                <h2 id="modal-qr-title" className="text-lg font-bold text-[#f9fafb]">
                  Etiquetas Térmicas Zebra (4x)
                </h2>
                <p className="text-xs text-[#9ca3af]">
                  Identificación adhesiva termocontraíble para fundas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalSet(null)}
                className="rounded p-2 text-[#9ca3af] hover:bg-[#1f2937] hover:text-[#f9fafb]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 grid grid-cols-2 gap-3">
              {["DELANTERO IZQ", "DELANTERO DER", "TRASERO IZQ", "TRASERO DER"].map((pos, idx) => (
                <div
                  key={pos}
                  className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#374151] bg-[#090d16] p-4 text-center"
                >
                  <div className="font-mono text-2xl font-bold text-[#60a5fa]">⊞ QR-{idx + 1}</div>
                  <div className="mt-2 font-mono text-xs font-bold uppercase text-[#f9fafb]">
                    {formatPlate(qrModalSet.vehiclePlate)}
                  </div>
                  <div className="font-mono text-[11px] text-[#9ca3af]">{qrModalSet.rack}</div>
                  <div className="mt-1 rounded bg-[#1f2937] px-2 py-0.5 font-mono text-[10px] text-[#bfdbfe]">
                    {pos} • {qrModalSet.size}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#1f2937] pt-4">
              <Button
                variant="secondary"
               
                onClick={() => setQrModalSet(null)}
              >
                Cerrar
              </Button>
              <Button
                variant="primary"
               
                onClick={() => {
                  setQrModalSet(null);
                  showToast("Enviando 4 etiquetas térmicas a impresora Zebra...");
                }}
              >
                Imprimir 4 Etiquetas
              </Button>
            </div>
          </div>
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

