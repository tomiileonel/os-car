"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  telemetryApi,
  type WorkshopTelemetryDto,
  type TelemetryPeriod,
  ApiClientError,
} from "@/lib/api-client";
import { Badge, OrderStatusBadge, type OrderStatus } from "@/components/ui/badge";

const PERIOD_OPTIONS: Array<{ id: TelemetryPeriod; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta Semana" },
  { id: "month", label: "Este Mes" },
  { id: "quarter", label: "Trimestre" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function TelemetriaPage(): React.JSX.Element {
  const [period, setPeriod] = useState<TelemetryPeriod>("month");
  const [data, setData] = useState<WorkshopTelemetryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function loadTelemetry(selectedPeriod: TelemetryPeriod) {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const report = await telemetryApi.getReport(selectedPeriod);
      setData(report);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : "Error al sincronizar telemetría de taller.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadTelemetry(period);
  }, [period]);

  function handlePeriodChange(newPeriod: TelemetryPeriod) {
    startTransition(() => {
      setPeriod(newPeriod);
    });
  }

  return (
    <main className="min-h-screen bg-[#090d16] text-[#f9fafb] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3 text-xs tracking-widest text-[#e0c700] uppercase font-mono mb-1">
              <Link href="/admin" className="hover:underline text-zinc-400">
                ADMIN
              </Link>
              <span>/</span>
              <span>TELEMETRÍA INDUSTRIAL</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>Panel de Rendimiento Operativo</span>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Agregación en tiempo real de tiempos de ciclo FSM, rotación de bahías y volumen financiero.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Switcher */}
            <div
              className="inline-flex rounded-lg bg-[#111827] border border-zinc-800 p-1"
              role="group"
              aria-label="Selector de Período"
            >
              {PERIOD_OPTIONS.map((opt) => {
                const isActive = period === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handlePeriodChange(opt.id)}
                    aria-pressed={isActive}
                    className={`min-h-[48px] min-w-[48px] px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                      isActive
                        ? "bg-[#e0c700] text-black shadow-sm"
                        : "text-zinc-300 hover:text-white hover:bg-zinc-800/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void loadTelemetry(period)}
              disabled={isLoading}
              className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors flex items-center justify-center gap-2"
              aria-label="Actualizar datos"
            >
              {isLoading ? (
                <span className="inline-block animate-spin">⟳</span>
              ) : (
                <span>Actualizar</span>
              )}
            </button>
          </div>
        </header>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-sm flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void loadTelemetry(period)}
              className="underline font-semibold ml-4 min-h-[48px] px-3 py-2"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Main Content */}
        {isLoading && !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-[#111827] rounded-xl border border-zinc-800" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* KPI Cards Grid */}
            <section
              aria-label="Indicadores Clave de Rendimiento"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
            >
              {/* KPI 1: Lead Time Promedio */}
              <div className="bg-[#111827] rounded-xl border border-zinc-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-xs font-mono uppercase tracking-wider">Lead Time Total</span>
                  <span className="text-base" aria-hidden="true">⏱</span>
                </div>
                <div>
                  <div className="text-3xl font-black tracking-tight text-white">
                    {data.cycleTimes.avgLeadTimeHours}{" "}
                    <span className="text-base font-normal text-zinc-400">hs</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">
                    ≈ {data.cycleTimes.avgLeadTimeDays} días promedio
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span>Diag: {data.cycleTimes.avgDiagnosisTimeHours}h</span>
                  <span>Rep: {data.cycleTimes.avgRepairTimeHours}h</span>
                </div>
              </div>

              {/* KPI 2: Ocupación de Bahías */}
              <div className="bg-[#111827] rounded-xl border border-zinc-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-xs font-mono uppercase tracking-wider">Ocupación Bahías</span>
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      data.bays.utilizationRate > 85
                        ? "bg-red-500"
                        : data.bays.utilizationRate > 60
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    }`}
                  />
                </div>
                <div>
                  <div className="text-3xl font-black tracking-tight text-white">
                    {data.bays.utilizationRate}%
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">
                    {data.bays.occupiedBays} de {data.bays.totalBays} bahías ocupadas
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span>Libres: {data.bays.freeBays}</span>
                  <span>Habilitadas: {data.bays.enabledBays}</span>
                </div>
              </div>

              {/* KPI 3: Aprobación de Presupuestos */}
              <div className="bg-[#111827] rounded-xl border border-zinc-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-xs font-mono uppercase tracking-wider">Tasa Aprobación</span>
                  <span className="text-base" aria-hidden="true">✓</span>
                </div>
                <div>
                  <div className="text-3xl font-black tracking-tight text-[#e0c700]">
                    {data.budgets.approvalRate}%
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">
                    {data.budgets.approvedBudgets} aprobados / {data.budgets.totalBudgets} emitidos
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span>Líneas: {data.budgets.lineApprovalRate}%</span>
                  <span>Rechazados: {data.budgets.rejectedBudgets}</span>
                </div>
              </div>

              {/* KPI 4: Throughput Financiero */}
              <div className="bg-[#111827] rounded-xl border border-zinc-800 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="text-xs font-mono uppercase tracking-wider">Facturado Período</span>
                  <span className="text-base" aria-hidden="true">$</span>
                </div>
                <div>
                  <div className="text-2xl md:text-3xl font-black tracking-tight text-emerald-400 truncate">
                    {formatCurrency(data.financials.deliveredRevenue)}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 font-mono">
                    {data.cycleTimes.deliveredOrdersCount} órdenes entregadas
                  </div>
                </div>
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span>WIP Estimado:</span>
                  <span className="text-zinc-300 font-mono">
                    {formatCurrency(data.financials.workInProgressEstimated)}
                  </span>
                </div>
              </div>
            </section>

            {/* FSM Distribution & Flow Pipeline */}
            <section
              aria-label="Distribución de Estados FSM"
              className="bg-[#111827] rounded-xl border border-zinc-800 p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Distribución de Flujo FSM ({data.fsmDistribution.totalInPeriod} órdenes en período)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    {data.fsmDistribution.totalActive} órdenes activas en piso actualmente.
                  </p>
                </div>
              </div>

              {/* Visual Multi-segment Progress Bar */}
              {data.fsmDistribution.totalInPeriod > 0 ? (
                <div
                  className="h-4 w-full bg-zinc-900 rounded-full overflow-hidden flex border border-zinc-800"
                  aria-hidden="true"
                >
                  {(
                    [
                      { key: "INGRESADO", color: "bg-zinc-500" },
                      { key: "DIAGNOSTICO", color: "bg-blue-500" },
                      { key: "ESPERANDO_REPARACION", color: "bg-amber-500" },
                      { key: "EN_REPARACION", color: "bg-indigo-500" },
                      { key: "CONTROL", color: "bg-yellow-400" },
                      { key: "LISTO", color: "bg-emerald-400" },
                      { key: "ENTREGADO", color: "bg-teal-600" },
                      { key: "CANCELADA", color: "bg-red-500" },
                    ] as const
                  ).map(({ key, color }) => {
                    const count = data.fsmDistribution[key];
                    if (count === 0) return null;
                    const pct = (count / data.fsmDistribution.totalInPeriod) * 100;
                    return (
                      <div
                        key={key}
                        style={{ width: `${pct}%` }}
                        className={`${color} transition-all duration-300`}
                        title={`${key}: ${count} (${Math.round(pct)}%)`}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-zinc-900/50 rounded-lg text-center text-xs text-zinc-400">
                  Sin órdenes registradas en el período seleccionado.
                </div>
              )}

              {/* Status Breakdown Chips */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2">
                {(
                  [
                    "INGRESADO",
                    "DIAGNOSTICO",
                    "ESPERANDO_REPARACION",
                    "EN_REPARACION",
                    "CONTROL",
                    "LISTO",
                    "ENTREGADO",
                    "CANCELADA",
                  ] as OrderStatus[]
                ).map((st) => {
                  const count = data.fsmDistribution[st];
                  return (
                    <div
                      key={st}
                      className="bg-zinc-900/70 border border-zinc-800/80 rounded-lg p-3 text-center space-y-1"
                    >
                      <OrderStatusBadge status={st} />
                      <div className="text-xl font-black text-white">{count}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Split Section: Bahías & Bottlenecks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bahías Grid (2 cols) */}
              <section
                aria-label="Estado en Vivo de Bahías"
                className="lg:col-span-2 bg-[#111827] rounded-xl border border-zinc-800 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Estado de Bahías Operativas
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Disponibilidad y asignaciones en tiempo real.
                    </p>
                  </div>
                  <Link
                    href="/admin/bahias"
                    className="min-h-[48px] px-3 py-2 text-xs font-semibold text-[#e0c700] hover:underline flex items-center"
                  >
                    Ver WorkBoard →
                  </Link>
                </div>

                {data.bays.bays.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-sm">
                    No hay bahías configuradas para este taller.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {data.bays.bays.map((bay) => {
                      const isOccupied = bay.status === "OCUPADA";
                      return (
                        <div
                          key={bay.id}
                          className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4 flex flex-col justify-between gap-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-zinc-300">
                              {bay.code}
                            </span>
                            <Badge tone={isOccupied ? "warning" : "success"}>
                              {isOccupied ? "OCUPADA" : "LIBRE"}
                            </Badge>
                          </div>

                          {bay.activeWorkOrder ? (
                            <div className="space-y-1 bg-black/40 rounded p-2 border border-zinc-800 text-xs">
                              <div className="font-mono font-bold text-white tracking-wider">
                                {bay.activeWorkOrder.licensePlate}
                              </div>
                              <div className="text-zinc-400 truncate">
                                {bay.activeWorkOrder.vehicleModel}
                              </div>
                              <div className="text-[10px] text-zinc-500 uppercase">
                                Estado: {bay.activeWorkOrder.status}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-500 italic py-2">
                              Bahía disponible para asignación
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Bottlenecks & Operational Queue */}
              <section
                aria-label="Cuellos de Botella"
                className="bg-[#111827] rounded-xl border border-zinc-800 p-6 space-y-4"
              >
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Cuellos de Botella
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Etapas activas ordenadas por acumulación y tiempo en cola.
                  </p>
                </div>

                <div className="space-y-3">
                  {data.bottlenecks.map((item) => (
                    <div
                      key={item.status}
                      className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-zinc-200">
                          {item.status}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {item.count === 0
                            ? "Sin órdenes pendientes"
                            : `Espera máx: ${item.oldestPendingHours} hs`}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${
                            item.count > 3
                              ? "bg-red-950 text-red-300 border border-red-800"
                              : item.count > 0
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {item.count} en cola
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
