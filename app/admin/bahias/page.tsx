"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  baysApi,
  workOrdersApi,
  ApiClientError,
  type BayDto,
  type WorkOrderSummaryDto,
  type OrderStatus,
} from "@/lib/api-client";
import { OrderStatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function getNextStatus(status: OrderStatus): { target: OrderStatus; label: string } | null {
  switch (status) {
    case "INGRESADO":
      return { target: "DIAGNOSTICO", label: "A Diagnóstico" };
    case "DIAGNOSTICO":
      return { target: "ESPERANDO_REPARACION", label: "A Espera Rep." };
    case "ESPERANDO_REPARACION":
      return { target: "EN_REPARACION", label: "Iniciar Rep." };
    case "EN_REPARACION":
      return { target: "CONTROL", label: "A Control" };
    case "CONTROL":
      return { target: "LISTO", label: "Marcar Listo" };
    case "LISTO":
      return { target: "ENTREGADO", label: "Entregar" };
    default:
      return null;
  }
}

export default function BahiasPage(): React.JSX.Element {
  const [bays, setBays] = useState<BayDto[]>([]);
  const [orders, setOrders] = useState<WorkOrderSummaryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMechanic, setSelectedMechanic] = useState<string>("TODOS");
  const [transitioningOrderId, setTransitioningOrderId] = useState<string | null>(null);

  async function loadData() {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const [baysData, ordersData] = await Promise.all([
        baysApi.list(),
        workOrdersApi.list(),
      ]);
      setBays(baysData);
      setOrders(ordersData);
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : "Error al cargar datos del tablero";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleQuickTransition(orderId: string, targetStatus: OrderStatus, version: number) {
    try {
      setTransitioningOrderId(orderId);
      await workOrdersApi.transitionStatus(orderId, {
        targetStatus,
        expectedVersion: version,
      });
      await loadData();
    } catch (error) {
      const msg = error instanceof ApiClientError ? error.message : "Error al cambiar estado";
      alert(msg);
    } finally {
      setTransitioningOrderId(null);
    }
  }

  // Telemetría de taller
  const totalBays = bays.length;
  const occupiedBays = bays.filter((b) => b.activeAssignment?.workOrder).length;
  const utilizationPercentage = totalBays > 0 ? Math.round((occupiedBays / totalBays) * 100) : 0;
  const patioOrders = useMemo(() => {
    return orders.filter(
      (o) => !o.bayCode && o.status !== "ENTREGADO" && o.status !== "CANCELADA",
    );
  }, [orders]);

  // Lista única de mecánicos para los filtros rápidos
  const mechanicsList = useMemo(() => {
    const set = new Set<string>();
    bays.forEach((b) => {
      const name = b.activeAssignment?.workOrder?.mechanicName;
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [bays]);

  // Bahías filtradas según búsqueda y mecánico
  const filteredBays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bays.filter((bay) => {
      const wo = bay.activeAssignment?.workOrder;
      // Filtro por mecánico
      if (selectedMechanic !== "TODOS") {
        if (!wo || wo.mechanicName !== selectedMechanic) return false;
      }
      // Filtro por texto de búsqueda
      if (q) {
        if (!wo) {
          return bay.code.toLowerCase().includes(q);
        }
        const matchesPlate = wo.vehiclePlate.toLowerCase().includes(q);
        const matchesCustomer = wo.customerName.toLowerCase().includes(q);
        const matchesVehicle = wo.vehicleLabel.toLowerCase().includes(q);
        const matchesBay = bay.code.toLowerCase().includes(q);
        return matchesPlate || matchesCustomer || matchesVehicle || matchesBay;
      }
      return true;
    });
  }, [bays, searchQuery, selectedMechanic]);

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-[#f9fafb]">
      {/* Top Header / Navigation */}
      <header className="sticky top-0 z-20 border-b border-[#1f2937] bg-[#0e131f]/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-[#f9fafb]">WorkBoard de Bahías</span>
              <span className="font-mono text-xs text-[#9ca3af]">TALLER MECÁNICO OS-CAR</span>
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
                aria-current="page"
                className="rounded-md bg-[#1f2937] px-3 py-1.5 text-sm font-semibold text-[#f9fafb]"
              >
                WorkBoard
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/recepcion"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-md bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
            >
              + Nuevo Ingreso
            </Link>
          </div>
        </div>
      </header>

      {/* Telemetry Bar & Quick Controls */}
      <div className="border-b border-[#1f2937] bg-[#111827] px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          {/* Telemetría */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Ocupación */}
            <div className="flex items-center gap-2 rounded-md bg-[#1f2937] px-3 py-1.5 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-[#fce006] animate-pulse" />
              <span className="font-mono font-bold text-[#fce006]">{utilizationPercentage}%</span>
              <span className="text-[#9ca3af]">Capacidad ({occupiedBays} / {totalBays} ocupadas)</span>
            </div>

            {/* Patio */}
            <div className="flex items-center gap-2 rounded-md bg-[#1f2937] px-3 py-1.5 text-sm font-medium text-[#9ca3af]">
              <span className="font-mono font-bold text-[#bfdbfe]">{patioOrders.length}</span>
              <span>Vehículos en espera / patio</span>
            </div>
          </div>

          {/* Buscador Rápido */}
          <div className="w-full sm:w-72">
            <label htmlFor="board-search" className="sr-only">
              Buscar vehículo o cliente
            </label>
            <input
              id="board-search"
              type="text"
              placeholder="Buscar patente o cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#090d16] px-3 py-2 text-sm font-medium uppercase tracking-wider text-[#f9fafb] placeholder:normal-case placeholder:text-[#6b7280] focus-visible:border-[#2563eb] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2563eb]"
            />
          </div>
        </div>

        {/* Filtros por mecánico */}
        <div className="mx-auto mt-3 flex max-w-7xl flex-wrap items-center gap-2 pt-2 border-t border-[#1f2937]/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">Mecánicos:</span>
          <button
            type="button"
            onClick={() => setSelectedMechanic("TODOS")}
            className={`min-h-[48px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedMechanic === "TODOS"
                ? "bg-[#2563eb] text-white"
                : "bg-[#1f2937] text-[#9ca3af] hover:text-[#f9fafb]"
            }`}
          >
            TODOS ({bays.length})
          </button>
          {mechanicsList.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMechanic(m)}
              className={`min-h-[48px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedMechanic === m
                  ? "bg-[#2563eb] text-white"
                  : "bg-[#1f2937] text-[#9ca3af] hover:text-[#f9fafb]"
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main WorkBoard Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        {errorMessage ? (
          <div role="alert" className="mb-6 rounded-md border border-[#ef4444] bg-[#4a1414] p-4 text-sm text-[#fca5a5]">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div role="status" className="flex min-h-[300px] items-center justify-center text-[#9ca3af]">
            <span className="text-base font-medium">Cargando tablero de bahías...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredBays.map((bay) => {
              const active = bay.activeAssignment;
              const wo = active?.workOrder;
              const nextAction = wo ? getNextStatus(wo.status) : null;
              const totalTasks = wo?.totalTasksCount ?? 0;
              const completedTasks = wo?.completedTasksCount ?? 0;
              const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

              return (
                <div
                  key={bay.id}
                  className="flex flex-col rounded-xl border border-[#1f2937] bg-[#111827] shadow-lg overflow-hidden transition-all hover:border-[#374151]"
                >
                  {/* Bay Header */}
                  <div className="flex items-center justify-between border-b border-[#1f2937] bg-[#1a2234] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          active ? "bg-[#38bdf8] animate-pulse" : "bg-[#10b981]"
                        }`}
                      />
                      <span className="font-mono text-sm font-bold tracking-tight text-[#f9fafb]">
                        {bay.code}
                      </span>
                    </div>
                    <Badge tone={active ? "info" : "success"}>
                      {active ? "OCUPADA" : "LIBRE"}
                    </Badge>
                  </div>

                  {/* Lane Content */}
                  <div className="flex flex-1 flex-col p-4">
                    {wo ? (
                      <div className="flex flex-1 flex-col justify-between gap-4">
                        {/* Vehicle & Plate */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[#f9fafb] text-base leading-tight">
                              {wo.vehicleLabel}
                            </span>
                            <OrderStatusBadge status={wo.status} />
                          </div>

                          {/* Argentine Style Plate Badge */}
                          <div className="flex items-center justify-between rounded-md bg-[#090d16] p-2 border border-[#1f2937]">
                            <div className="flex items-center gap-1.5 rounded bg-[#f9fafb] px-2 py-0.5 text-[#090d16] font-mono font-black text-sm tracking-widest">
                              <span className="text-[10px] font-bold text-[#374151]">AR</span>
                              <span>{wo.vehiclePlate}</span>
                            </div>
                            <span className="text-xs font-mono text-[#9ca3af]">
                              #OT-{wo.id.slice(-4).toUpperCase()}
                            </span>
                          </div>

                          {/* Customer & Mechanic */}
                          <div className="flex flex-col gap-1 text-xs text-[#9ca3af]">
                            <div className="flex items-center justify-between">
                              <span>Cliente:</span>
                              <span className="font-medium text-[#f9fafb] truncate max-w-[140px]">
                                {wo.customerName}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Mecánico:</span>
                              <span className="font-medium text-[#fce006]">
                                {wo.mechanicName ?? "Sin asignar"}
                              </span>
                            </div>
                          </div>

                          {/* Tasks Checklist Progress */}
                          <div className="mt-1 flex flex-col gap-1 rounded-md bg-[#1a2234] p-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-[#9ca3af]">Tareas operativas:</span>
                              <span className="font-mono font-bold text-[#fce006]">
                                {completedTasks} / {totalTasks} ({progressPct}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[#374151] overflow-hidden">
                              <div
                                className="h-full bg-[#fce006] transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Blockers alert if present */}
                          {wo.activeBlockersCount > 0 ? (
                            <div className="flex items-center gap-1.5 rounded-md bg-[#4a3510] border border-[#f59e0b] px-2.5 py-1.5 text-xs text-[#fde68a]">
                              <span className="font-bold">⚠️ Bloqueos activos:</span>
                              <span>{wo.activeBlockersCount}</span>
                            </div>
                          ) : null}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2 pt-2 border-t border-[#1f2937]">
                          {nextAction ? (
                            <Button
                              type="button"
                              variant="primary"
                              loading={transitioningOrderId === wo.id}
                              onClick={() => void handleQuickTransition(wo.id, nextAction.target, wo.version)}
                              className="w-full"
                            >
                              {nextAction.label} &rarr;
                            </Button>
                          ) : null}

                          <Link
                            href={`/admin/ordenes/${wo.id}`}
                            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-md border border-[#374151] bg-[#1f2937] px-3 py-2 text-sm font-semibold text-[#f9fafb] transition-colors hover:bg-[#273244]"
                          >
                            Ver Ficha & Presupuesto &rarr;
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1f2937] text-[#9ca3af]">
                          <span className="font-mono text-xl">✓</span>
                        </div>
                        <span className="text-sm font-medium text-[#9ca3af]">
                          Bahía libre y operativa
                        </span>
                        <Link
                          href="/admin/recepcion"
                          className="inline-flex min-h-[48px] items-center justify-center rounded-md border border-[#374151] px-4 py-2 text-xs font-semibold text-[#bfdbfe] transition-colors hover:bg-[#1f2937]"
                        >
                          + Ingresar Vehículo
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Patio / En Espera Drawer section */}
        {patioOrders.length > 0 ? (
          <section aria-labelledby="patio-heading" className="mt-10 rounded-xl border border-[#1f2937] bg-[#111827] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 id="patio-heading" className="text-lg font-bold text-[#f9fafb]">
                Vehículos en Patio / Espera de Bahía ({patioOrders.length})
              </h2>
              <span className="text-xs text-[#9ca3af]">Órdenes activas pendientes de asignación de puesto</span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {patioOrders.map((pOrder) => (
                <div
                  key={pOrder.id}
                  className="flex items-center justify-between rounded-lg border border-[#1f2937] bg-[#090d16] p-4 transition-colors hover:border-[#374151]"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#f9fafb]">
                        {pOrder.vehiclePlate}
                      </span>
                      <OrderStatusBadge status={pOrder.status} />
                    </div>
                    <span className="text-xs text-[#9ca3af] truncate max-w-[180px]">
                      {pOrder.vehicleLabel} • {pOrder.customerName}
                    </span>
                  </div>

                  <Link
                    href={`/admin/ordenes/${pOrder.id}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-md border border-[#374151] px-3 py-1.5 text-xs font-semibold text-[#f9fafb] transition-colors hover:bg-[#1f2937]"
                  >
                    Ver Ficha
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
