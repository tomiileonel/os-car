"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  workOrdersApi,
  ApiClientError,
  type WorkOrderDetailDto,
  type OrderStatus,
} from "@/lib/api-client";
import {
  calculateOrderFinancials,
  calculateLaborLineTotal,
  calculatePartLineTotal,
  formatCurrency,
} from "@/lib/order-calculation-view";
import { OrderStatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ALLOWED_NEXT_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  INGRESADO: ["DIAGNOSTICO", "CANCELADA"],
  DIAGNOSTICO: ["ESPERANDO_REPARACION", "CANCELADA"],
  ESPERANDO_REPARACION: ["EN_REPARACION", "CANCELADA"],
  EN_REPARACION: ["CONTROL", "CANCELADA"],
  CONTROL: ["LISTO", "EN_REPARACION", "CANCELADA"],
  LISTO: ["ENTREGADO", "CANCELADA"],
  ENTREGADO: [],
  CANCELADA: [],
};

const STATUS_TRANSITION_LABELS: Record<OrderStatus, string> = {
  INGRESADO: "Ingresado",
  DIAGNOSTICO: "Pasar a Diagnóstico",
  ESPERANDO_REPARACION: "Finalizar Diagnóstico",
  EN_REPARACION: "Iniciar Reparación",
  CONTROL: "Pasar a Control de Calidad",
  LISTO: "Marcar Listo para Entrega",
  ENTREGADO: "Registrar Entrega a Cliente",
  CANCELADA: "Cancelar Orden",
};

export default function OrderDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";

  const [order, setOrder] = useState<WorkOrderDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // New Work Item Form
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [laborDescription, setLaborDescription] = useState("");
  const [laborMinutes, setLaborMinutes] = useState("60");
  const [laborRate, setLaborRate] = useState("25000");

  // New Part Item Form
  const [showAddPart, setShowAddPart] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partQuantity, setPartQuantity] = useState("1");
  const [partPrice, setPartPrice] = useState("15000");

  async function loadOrder() {
    if (!orderId) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await workOrdersApi.get(orderId);
      setOrder(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al cargar la orden";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
  }, [orderId]);

  // Reactive financial calculations via pure domain library
  const financialSummary = useMemo(() => {
    if (!order) return null;
    return calculateOrderFinancials(
      order.workItems.map((w) => ({
        description: w.description,
        estimatedMinutes: w.estimatedMinutes,
        hourlyRateCharged: w.hourlyRateCharged,
        status: w.status,
      })),
      order.partItems.map((p) => ({
        description: p.description,
        quantity: p.quantity,
        unitPriceCharged: p.unitPriceCharged,
        status: p.status,
      })),
    );
  }, [order]);
  async function handleTransition(targetStatus: OrderStatus) {
    if (!order) return;
    try {
      setIsActionLoading(true);
      setFeedbackMessage(null);
      const updated = await workOrdersApi.transitionStatus(order.id, {
        targetStatus,
        expectedVersion: order.version,
      });
      setOrder(updated);
      setFeedbackMessage(`Estado avanzado a ${targetStatus}`);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al cambiar estado";
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleAddWorkItem(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      const updated = await workOrdersApi.addWorkItem(order.id, {
        description: laborDescription.trim(),
        estimatedMinutes: Number(laborMinutes),
        hourlyRateCharged: Number(laborRate),
      });
      setOrder(updated);
      setLaborDescription("");
      setShowAddLabor(false);
      setFeedbackMessage("Operación de mano de obra agregada correctamente.");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al agregar ítem de labor";
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleAddPartItem(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      const updated = await workOrdersApi.addPartItem(order.id, {
        partNumber: partNumber.trim() || undefined,
        description: partDescription.trim(),
        quantity: Number(partQuantity),
        unitPriceCharged: Number(partPrice),
      });
      setOrder(updated);
      setPartDescription("");
      setPartNumber("");
      setShowAddPart(false);
      setFeedbackMessage("Repuesto agregado correctamente.");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al agregar repuesto";
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleResolveBlocker(blockerId: string) {
    if (!order) return;
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      const updated = await workOrdersApi.resolveBlocker(order.id, blockerId, "Resuelto por el operador");
      setOrder(updated);
      setFeedbackMessage("Bloqueo resuelto.");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al resolver bloqueo";
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleApproveBudget(budgetVersionId: string) {
    if (!order) return;
    try {
      setIsActionLoading(true);
      setErrorMessage(null);
      const updated = await workOrdersApi.approveBudget(order.id, budgetVersionId);
      setOrder(updated);
      setFeedbackMessage("Presupuesto aprobado.");
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Error al aprobar presupuesto";
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  function handleCopyTrackingLink() {
    if (!order) return;
    const url = `${window.location.origin}/seguimiento/${order.trackingCodeHash}`;
    void navigator.clipboard.writeText(url);
    setFeedbackMessage("Enlace público de seguimiento copiado al portapapeles.");
  }
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d16] text-[#f9fafb]">
        <span className="text-base font-medium" role="status">
          Cargando ficha técnica de orden...
        </span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#090d16] p-6 text-[#f9fafb]">
        <p className="text-base font-semibold text-[#fca5a5]" role="alert">
          {errorMessage ?? "Orden de trabajo no encontrada"}
        </p>
        <Link
          href="/admin/bahias"
          className="inline-flex min-h-[48px] items-center rounded-md bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white"
        >
          &larr; Volver al WorkBoard
        </Link>
      </div>
    );
  }

  const nextTransitions = ALLOWED_NEXT_TRANSITIONS[order.status] ?? [];
  const vehicleName = [order.vehicle.make, order.vehicle.model, order.vehicle.modelYear]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-[#f9fafb]">
      {/* Top Bar Header */}
      <header className="sticky top-0 z-20 border-b border-[#1f2937] bg-[#0e131f]/90 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/bahias"
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-md border border-[#374151] px-3 py-2 text-sm font-medium text-[#9ca3af] hover:bg-[#1f2937] hover:text-[#f9fafb]"
            >
              &larr; WorkBoard
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-[#fce006]">
                  #OT-{order.id.slice(-6).toUpperCase()}
                </span>
                <OrderStatusBadge status={order.status} />
              </div>
              <span className="text-xs text-[#9ca3af]">FICHA DE ORDEN Y PRESUPUESTO</span>
            </div>
          </div>

          {/* Quick Transition Action */}
          <div className="flex flex-wrap items-center gap-2">
            {nextTransitions.map((target) => (
              <Button
                key={target}
                type="button"
                variant={target === "CANCELADA" ? "danger" : "primary"}
                loading={isActionLoading}
                onClick={() => void handleTransition(target)}
              >
                {STATUS_TRANSITION_LABELS[target]} &rarr;
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-6">
        {errorMessage ? (
          <div role="alert" className="rounded-md border border-[#ef4444] bg-[#4a1414] p-4 text-sm text-[#fca5a5]">
            {errorMessage}
          </div>
        ) : null}

        {feedbackMessage ? (
          <div role="status" className="rounded-md border border-[#10b981] bg-[#0f3d2e] p-4 text-sm text-[#86efac]">
            {feedbackMessage}
          </div>
        ) : null}

        {/* Top Identification Ribbon */}
        <section aria-labelledby="order-summary-heading" className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-md">
          <h2 id="order-summary-heading" className="sr-only">
            Resumen del vehículo y cliente
          </h2>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-4">
              {/* Argentine Plate Metal Badge */}
              <div className="flex items-center gap-2 rounded-md bg-[#f9fafb] px-3 py-1.5 text-[#090d16] font-mono font-black text-lg tracking-widest border border-[#374151] shadow-inner">
                <span className="rounded bg-[#090d16] px-1 py-0.5 text-xs text-[#f9fafb]">AR</span>
                <span>{order.vehicle.licensePlateNormalized}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#f9fafb]">{vehicleName || "Vehículo S/D"}</h1>
                <p className="text-sm text-[#9ca3af]">
                  VIN: {order.vehicle.vin ?? "No registrado"} • Color: {order.vehicle.color ?? "No especificado"}
                </p>
              </div>
            </div>

            {/* Client & Tech Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-[#9ca3af]">
              <div className="rounded-lg bg-[#1a2234] p-3">
                <span className="block text-[#6b7280]">Cliente</span>
                <span className="font-semibold text-sm text-[#f9fafb] block truncate">{order.customer.fullName}</span>
                <span className="font-mono text-[#bfdbfe]">{order.customer.phone}</span>
              </div>
              <div className="rounded-lg bg-[#1a2234] p-3">
                <span className="block text-[#6b7280]">Mecánico</span>
                <span className="font-semibold text-sm text-[#fce006] block">
                  {order.assignedMechanic?.name ?? "Sin asignar"}
                </span>
                <span className="text-[#9ca3af]">{order.currentBay?.code ?? "Sin bahía"}</span>
              </div>
              <div className="rounded-lg bg-[#1a2234] p-3">
                <span className="block text-[#6b7280]">Odómetro</span>
                <span className="font-mono font-semibold text-sm text-[#f9fafb] block">
                  {order.intakeRecord ? `${order.intakeRecord.odometerAtIntake.toLocaleString("es-AR")} KM` : "S/D"}
                </span>
                <span className="text-[#9ca3af]">Combustible: {order.intakeRecord?.fuelLevel ?? "S/D"}</span>
              </div>
              <div className="rounded-lg bg-[#1a2234] p-3">
                <span className="block text-[#6b7280]">Ingreso</span>
                <span className="font-mono font-semibold text-sm text-[#f9fafb] block">
                  {new Date(order.openedAt).toLocaleDateString("es-AR")}
                </span>
                <span className="text-[#9ca3af]">{new Date(order.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} HS</span>
              </div>
            </div>
          </div>

          {order.intakeRecord?.customerComplaint ? (
            <div className="mt-4 border-t border-[#1f2937] pt-3 text-sm">
              <span className="font-semibold text-[#fce006]">Motivo de consulta / Síntoma:</span>{" "}
              <span className="text-[#f9fafb]">{order.intakeRecord.customerComplaint}</span>
            </div>
          ) : null}
        </section>
        {/* 2-Column Ledger: Left (Tables) & Right (Financials & Actions) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Tables of Work & Parts */}
          <div className="lg:col-span-8 space-y-6">
            {/* SECCIÓN A: MANO DE OBRA */}
            <section aria-labelledby="labor-heading" className="rounded-xl border border-[#1f2937] bg-[#111827] shadow-lg overflow-hidden">
              <div className="flex flex-wrap items-center justify-between border-b border-[#1f2937] bg-[#1a2234] p-4">
                <div>
                  <h2 id="labor-heading" className="text-base font-bold text-[#f9fafb]">
                    SECCIÓN A: Mano de Obra Certificada
                  </h2>
                  <span className="text-xs text-[#9ca3af]">
                    {order.workItems.length} operaciones registradas
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="block text-[10px] text-[#9ca3af] uppercase">Subtotal Labor</span>
                    <span className="font-mono font-bold text-sm text-[#fce006]">
                      {financialSummary?.formatted.laborSubtotal}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddLabor((prev) => !prev)}
                  >
                    {showAddLabor ? "Cancelar" : "+ Agregar Labor"}
                  </Button>
                </div>
              </div>

              {/* Formulario Inline de Agregar Mano de Obra */}
              {showAddLabor ? (
                <form onSubmit={(e) => void handleAddWorkItem(e)} className="border-b border-[#1f2937] bg-[#090d16] p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f9fafb]">Nueva Operación de Mano de Obra</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-3">
                      <Input
                        label="Descripción de la tarea"
                        value={laborDescription}
                        onChange={(e) => setLaborDescription(e.target.value)}
                        placeholder="Ej: Cambio de pastillas de freno delanteras"
                        required
                      />
                    </div>
                    <div>
                      <Input
                        label="Minutos Estimados"
                        type="number"
                        min="1"
                        step="1"
                        value={laborMinutes}
                        onChange={(e) => setLaborMinutes(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Input
                        label="Tarifa / Hora ($)"
                        type="number"
                        min="0"
                        step="100"
                        value={laborRate}
                        onChange={(e) => setLaborRate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" variant="primary" loading={isActionLoading} className="w-full">
                        Guardar Labor
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}

              {/* Tabla de Mano de Obra */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#1f2937] bg-[#0e131f] text-xs uppercase text-[#9ca3af]">
                    <tr>
                      <th scope="col" className="p-3">Operación</th>
                      <th scope="col" className="p-3 text-center">T. Estimado</th>
                      <th scope="col" className="p-3 text-center">Horas Reales</th>
                      <th scope="col" className="p-3 text-right">Tarifa / Hora</th>
                      <th scope="col" className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {order.workItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-[#9ca3af]">
                          No hay operaciones de mano de obra cargadas en esta orden.
                        </td>
                      </tr>
                    ) : (
                      order.workItems.map((item) => {
                        const lineSubtotal = calculateLaborLineTotal(item.estimatedMinutes, item.hourlyRateCharged);
                        return (
                          <tr key={item.id} className="hover:bg-[#1a2234]/50 transition-colors">
                            <td className="p-3 font-medium text-[#f9fafb]">
                              <div>{item.description}</div>
                              {item.isAdditional ? (
                                <span className="text-[10px] text-[#f59e0b] font-mono">ADICIONAL</span>
                              ) : null}
                            </td>
                            <td className="p-3 text-center font-mono text-[#9ca3af]">
                              {(item.estimatedMinutes / 60).toFixed(1)} h
                            </td>
                            <td className="p-3 text-center font-mono text-[#9ca3af]">
                              {(item.actualMinutes / 60).toFixed(1)} h
                            </td>
                            <td className="p-3 text-right font-mono text-[#9ca3af]">
                              {formatCurrency(item.hourlyRateCharged)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#f9fafb]">
                              {formatCurrency(lineSubtotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            {/* SECCIÓN B: REPUESTOS Y MATERIALES */}
            <section aria-labelledby="parts-heading" className="rounded-xl border border-[#1f2937] bg-[#111827] shadow-lg overflow-hidden">
              <div className="flex flex-wrap items-center justify-between border-b border-[#1f2937] bg-[#1a2234] p-4">
                <div>
                  <h2 id="parts-heading" className="text-base font-bold text-[#f9fafb]">
                    SECCIÓN B: Repuestos e Insumos
                  </h2>
                  <span className="text-xs text-[#9ca3af]">
                    {order.partItems.length} ítems de repuestos asignados
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="block text-[10px] text-[#9ca3af] uppercase">Subtotal Repuestos</span>
                    <span className="font-mono font-bold text-sm text-[#fce006]">
                      {financialSummary?.formatted.partsSubtotal}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddPart((prev) => !prev)}
                  >
                    {showAddPart ? "Cancelar" : "+ Agregar Repuesto"}
                  </Button>
                </div>
              </div>

              {/* Formulario Inline de Agregar Repuesto */}
              {showAddPart ? (
                <form onSubmit={(e) => void handleAddPartItem(e)} className="border-b border-[#1f2937] bg-[#090d16] p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f9fafb]">Nuevo Repuesto o Insumo</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <Input
                        label="Cód. / SKU (Opcional)"
                        value={partNumber}
                        onChange={(e) => setPartNumber(e.target.value)}
                        placeholder="Ej: FL-208"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        label="Descripción del repuesto"
                        value={partDescription}
                        onChange={(e) => setPartDescription(e.target.value)}
                        placeholder="Ej: Filtro de aceite Mahle OC-617"
                        required
                      />
                    </div>
                    <div>
                      <Input
                        label="Cantidad"
                        type="number"
                        min="1"
                        step="1"
                        value={partQuantity}
                        onChange={(e) => setPartQuantity(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Input
                        label="Precio Unitario ($)"
                        type="number"
                        min="0"
                        step="100"
                        value={partPrice}
                        onChange={(e) => setPartPrice(e.target.value)}
                        required
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-end">
                      <Button type="submit" variant="primary" loading={isActionLoading} className="w-full">
                        Guardar Repuesto
                      </Button>
                    </div>
                  </div>
                </form>
              ) : null}

              {/* Tabla de Repuestos */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#1f2937] bg-[#0e131f] text-xs uppercase text-[#9ca3af]">
                    <tr>
                      <th scope="col" className="p-3">Código</th>
                      <th scope="col" className="p-3">Descripción</th>
                      <th scope="col" className="p-3 text-center">Cant.</th>
                      <th scope="col" className="p-3 text-right">P. Unitario</th>
                      <th scope="col" className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {order.partItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-[#9ca3af]">
                          No hay repuestos cargados en esta orden.
                        </td>
                      </tr>
                    ) : (
                      order.partItems.map((part) => {
                        const lineSubtotal = calculatePartLineTotal(part.quantity, part.unitPriceCharged);
                        return (
                          <tr key={part.id} className="hover:bg-[#1a2234]/50 transition-colors">
                            <td className="p-3 font-mono text-xs text-[#9ca3af]">
                              {part.partNumber ?? "—"}
                            </td>
                            <td className="p-3 font-medium text-[#f9fafb]">
                              <div>{part.description}</div>
                              {part.isAdditional ? (
                                <span className="text-[10px] text-[#f59e0b] font-mono">ADICIONAL</span>
                              ) : null}
                            </td>
                            <td className="p-3 text-center font-mono text-[#f9fafb]">
                              {part.quantity}
                            </td>
                            <td className="p-3 text-right font-mono text-[#9ca3af]">
                              {formatCurrency(part.unitPriceCharged)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#f9fafb]">
                              {formatCurrency(lineSubtotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          {/* Right Column (4 cols): Financial Ticket, Blockers & Budget Approval */}
          <aside aria-label="Liquidación y bloqueos" className="lg:col-span-4 space-y-6">
            {/* Financial Summary Ticket */}
            <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-xl space-y-4">
              <h2 className="text-base font-bold text-[#f9fafb] border-b border-[#1f2937] pb-3">
                Liquidación Financiera
              </h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-[#9ca3af]">
                  <span>Subtotal Mano de Obra ({financialSummary?.laborCount ?? 0})</span>
                  <span className="font-mono text-[#f9fafb]">
                    {financialSummary?.formatted.laborSubtotal}
                  </span>
                </div>
                <div className="flex justify-between text-[#9ca3af]">
                  <span>Subtotal Repuestos ({financialSummary?.partsCount ?? 0})</span>
                  <span className="font-mono text-[#f9fafb]">
                    {financialSummary?.formatted.partsSubtotal}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-[#f9fafb] border-t border-[#1f2937] pt-2">
                  <span>Subtotal Gravado (Neto)</span>
                  <span className="font-mono">
                    {financialSummary?.formatted.netSubtotal}
                  </span>
                </div>
                <div className="flex justify-between text-[#9ca3af]">
                  <span>IVA (21%)</span>
                  <span className="font-mono">
                    {financialSummary?.formatted.taxAmount}
                  </span>
                </div>
                <div className="flex justify-between font-black text-lg text-[#fce006] border-t-2 border-[#1f2937] pt-3">
                  <span>TOTAL FINAL</span>
                  <span className="font-mono">
                    {financialSummary?.formatted.total}
                  </span>
                </div>
              </div>
            </div>

            {/* Panel de Bloqueos de Entrega (Invariante A1) */}
            <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1f2937] pb-3">
                <h2 className="text-base font-bold text-[#f9fafb]">Bloqueos de Entrega</h2>
                <Badge tone={order.blockers.length > 0 ? "warning" : "success"}>
                  {order.blockers.length > 0 ? `${order.blockers.length} ACTIVO` : "SIN BLOQUEOS"}
                </Badge>
              </div>

              {order.blockers.length === 0 ? (
                <p className="text-xs text-[#9ca3af]">
                  Flujo normal: no existen condiciones bloqueantes en esta orden.
                </p>
              ) : (
                <div className="space-y-3">
                  {order.blockers.map((blocker) => (
                    <div
                      key={blocker.id}
                      className="flex flex-col gap-2 rounded-lg border border-[#f59e0b]/30 bg-[#4a3510]/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#fde68a]">
                          {blocker.type}
                        </span>
                        <span className="text-[10px] text-[#9ca3af]">
                          {new Date(blocker.blockedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-[#f9fafb]">{blocker.reason}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={isActionLoading}
                        onClick={() => void handleResolveBlocker(blocker.id)}
                        className="min-h-[48px] text-xs"
                      >
                        Resolver Bloqueo
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Presupuesto y Seguimiento para el Cliente */}
            <div className="rounded-xl border border-[#1f2937] bg-[#111827] p-6 shadow-xl space-y-4">
              <div className="border-b border-[#1f2937] pb-3">
                <h2 className="text-base font-bold text-[#f9fafb]">Aprobación de Presupuesto</h2>
                <span className="text-xs text-[#9ca3af]">Invariante C3 & Firma Digital</span>
              </div>

              {order.budget?.currentVersion ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9ca3af]">Versión #{order.budget.currentVersion.versionNumber}</span>
                    <Badge tone={order.budget.currentVersion.status === "APROBADO" ? "success" : "warning"}>
                      {order.budget.currentVersion.status}
                    </Badge>
                  </div>

                  {order.budget.currentVersion.status === "PENDIENTE_APROBACION" ? (
                    <Button
                      type="button"
                      variant="primary"
                      loading={isActionLoading}
                      onClick={() => void handleApproveBudget(order.budget!.currentVersion!.id)}
                      className="w-full"
                    >
                      Aprobar Presupuesto (Staff)
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-[#9ca3af]">
                  No se ha generado todavía un presupuesto formal versionado para esta orden.
                </p>
              )}

              {/* Botón de Compartir Enlace Público */}
              <div className="pt-2 border-t border-[#1f2937]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyTrackingLink}
                  className="w-full"
                >
                  Copiar Enlace para Cliente 📋
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
