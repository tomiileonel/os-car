"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trackingApi, ApiClientError } from "@/lib/api-client";
import type {
  PublicTrackingDto,
  BudgetDecisionResultDto,
} from "@/lib/api-client";

interface PageProps {
  params?: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default function PublicTrackingPage({ params }: PageProps): React.JSX.Element {
  const routeParams = useParams<{ token?: string }>();
  const [token, setToken] = useState<string>(() => routeParams?.token ?? "");

  useEffect(() => {
    if (routeParams?.token) {
      setToken(routeParams.token);
    } else if (params) {
      params.then((resolved) => {
        if (resolved?.token) setToken(resolved.token);
      });
    }
  }, [params, routeParams?.token]);

  const [trackingData, setTrackingData] = useState<PublicTrackingDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision state
  const [approvedItems, setApprovedItems] = useState<Record<string, boolean>>({});
  const [decisionNotes, setDecisionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decisionResult, setDecisionResult] = useState<BudgetDecisionResultDto | null>(null);

  // Accordion state
  const [showIntakeDetails, setShowIntakeDetails] = useState(true);

  // Fetch initial tracking data
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    trackingApi
      .getPublicStatus(token)
      .then((data) => {
        if (!isMounted) return;
        setTrackingData(data);

        // Inicializar todos los ítems como aprobados por defecto
        if (data.budget) {
          const initialMap: Record<string, boolean> = {};
          data.budget.laborLines.forEach((l) => {
            initialMap[l.id] = true;
          });
          data.budget.partLines.forEach((p) => {
            initialMap[p.id] = true;
          });
          setApprovedItems(initialMap);
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError("No se pudo cargar la información de seguimiento. Verifique el enlace recibido.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Recálculo reactivo de montos presupuestados
  const budgetCalculations = useMemo(() => {
    if (!trackingData?.budget) {
      return { laborSubtotal: 0, partsSubtotal: 0, total: 0, approvedCount: 0, rejectedCount: 0 };
    }

    let laborSubtotal = 0;
    let partsSubtotal = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    trackingData.budget.laborLines.forEach((line) => {
      if (approvedItems[line.id]) {
        laborSubtotal += line.lineTotal;
        approvedCount++;
      } else {
        rejectedCount++;
      }
    });

    trackingData.budget.partLines.forEach((line) => {
      if (approvedItems[line.id]) {
        partsSubtotal += line.lineTotal;
        approvedCount++;
      } else {
        rejectedCount++;
      }
    });

    return {
      laborSubtotal,
      partsSubtotal,
      total: laborSubtotal + partsSubtotal,
      approvedCount,
      rejectedCount,
    };
  }, [trackingData?.budget, approvedItems]);

  const toggleItem = (itemId: string) => {
    setApprovedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleApproveAll = () => {
    if (!trackingData?.budget) return;
    const allApproved: Record<string, boolean> = {};
    trackingData.budget.laborLines.forEach((l) => (allApproved[l.id] = true));
    trackingData.budget.partLines.forEach((p) => (allApproved[p.id] = true));
    setApprovedItems(allApproved);
  };

  const handleSubmitDecision = async () => {
    if (!trackingData?.budget || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const approvedIds: string[] = [];
    const rejectedIds: string[] = [];

    Object.entries(approvedItems).forEach(([id, isApproved]) => {
      if (isApproved) approvedIds.push(id);
      else rejectedIds.push(id);
    });

    const isAllRejected = approvedIds.length === 0;

    try {
      const res = await trackingApi.submitBudgetDecision(token, {
        decision: isAllRejected ? "RECHAZADO" : "APROBADO",
        approvedItemIds: approvedIds,
        rejectedItemIds: rejectedIds,
        notes: decisionNotes.trim() || undefined,
      });

      setDecisionResult(res);

      // Refrescar datos de la orden
      const refreshed = await trackingApi.getPublicStatus(token);
      setTrackingData(refreshed);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("No se pudo registrar la decisión. Intente nuevamente o consulte vía WhatsApp.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-[#f9fafb] flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-12 h-12 rounded-full border-4 border-[#374151] border-t-[#ffe317] animate-spin"></div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#ffe317]">OS-CAR TELEMETRY</span>
          <h1 className="text-lg font-bold text-white">Cargando estado de tu vehículo...</h1>
          <p className="text-xs text-[#9ca3af]">Consultando la base de datos técnica del taller en tiempo real.</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error || !trackingData) {
    return (
      <div className="min-h-screen bg-[#090d16] text-[#f9fafb] flex flex-col items-center justify-center p-6">
        <div className="bg-[#111827] border border-[#ef4444]/40 rounded-2xl p-6 max-w-md w-full flex flex-col gap-4 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-[#ef4444]/10 text-[#ef4444] flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white">Enlace de Seguimiento No Disponible</h1>
          <p className="text-xs text-[#9ca3af]">{error || "No se pudo acceder a los datos de la orden solicitada."}</p>
          <div className="flex flex-col gap-2 pt-2">
            <a
              href="https://wa.me/5493764353566"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] px-4 rounded-xl bg-[#065f46] hover:bg-[#047857] text-white text-xs font-bold flex items-center justify-center gap-2 border border-[#10b981]/30 transition-colors"
            >
              Consultar por WhatsApp (+54 9 376 435-3566)
            </a>
            <Link
              href="/seguimiento"
              className="min-h-[44px] text-xs text-[#9ca3af] hover:text-white flex items-center justify-center"
            >
              Ingresar otro código manualmente
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPendingApproval = trackingData.budget?.status === "PENDIENTE_APROBACION";
  const isBudgetDecided = trackingData.budget?.status === "APROBADO" || trackingData.budget?.status === "RECHAZADO";

  const whatsappInquiryUrl = `https://wa.me/${trackingData.workshop.whatsapp}?text=${encodeURIComponent(
    `Hola! Consulto por la orden ${trackingData.workOrderNumber} (Vehículo: ${trackingData.vehicle.make ?? ""} ${trackingData.vehicle.model ?? ""} - Patente: ${trackingData.vehicle.licensePlateMasked}).`,
  )}`;

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f9fafb] flex flex-col pb-36">
      {/* Header Mobile First */}
      <header className="sticky top-0 z-30 bg-[#111827]/95 backdrop-blur-md border-b border-[#374151] px-4 py-3 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#ffe317] text-black font-black flex items-center justify-center text-xs shadow-sm">
              OS
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white leading-tight">{trackingData.workshop.name}</span>
              <span className="text-[10px] font-mono text-[#ffe317]">Portal de Seguimiento Clientes</span>
            </div>
          </div>

          <a
            href={whatsappInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#065f46] hover:bg-[#047857] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-[#10b981]/30 shadow-sm min-h-[36px]"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.075-2.227-.557-1.748-.72-2.87-2.485-2.956-2.6-.088-.116-.708-.941-.708-1.792s.448-1.272.607-1.446c.159-.175.348-.218.464-.218.116 0 .232.001.333.006.107.005.25.04.39.377.144.348.492 1.202.535 1.29.043.087.072.188.014.304-.058.116-.087.188-.174.29-.087.102-.183.228-.261.306-.087.087-.178.182-.077.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.377-.044.102-.116.435-.507.55-.681.116-.174.232-.145.39-.087.16.058 1.014.478 1.188.565.174.087.29.13.333.203.044.072.044.42-.1.825z" />
            </svg>
            <span className="hidden sm:inline">WhatsApp Taller</span>
          </a>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="max-w-2xl mx-auto w-full px-4 pt-4 flex flex-col gap-5">
        {/* Banner de Identificación del Vehículo */}
        <section aria-label="Identificación de la Orden" className="bg-[#111827] rounded-2xl border border-[#374151] p-4 flex flex-col gap-3 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-[#ffe317] tracking-wider uppercase">
              {trackingData.workOrderNumber}
            </span>
            <Badge tone="info">
              {trackingData.status.replace(/_/g, " ")}
            </Badge>
          </div>

          <div className="flex items-baseline justify-between border-t border-[#374151] pt-3">
            <div>
              <h2 className="text-base font-bold text-white">
                {trackingData.vehicle.make ?? "Vehículo"} {trackingData.vehicle.model ?? ""}
              </h2>
              <span className="text-xs text-[#9ca3af]">
                Año: {trackingData.vehicle.modelYear ?? "—"} • Color: {trackingData.vehicle.color ?? "—"}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded bg-[#090d16] font-mono text-sm font-bold text-[#ffe317] border border-[#374151]">
              {trackingData.vehicle.licensePlateMasked}
            </span>
          </div>
        </section>

        {/* Línea de Tiempo en Vivo (Timeline) */}
        <section aria-label="Línea de Tiempo del Servicio" className="bg-[#111827] rounded-2xl border border-[#374151] p-5 shadow-md flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Progreso del Vehículo en Taller</span>
            </h2>
            <span className="text-[10px] font-mono text-[#9ca3af]">En Vivo</span>
          </div>

          <div className="relative pl-6 flex flex-col gap-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#374151]">
            {trackingData.timeline.map((step) => {
              return (
                <div key={step.status} className="relative flex flex-col gap-0.5">
                  <div
                    className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                      step.current
                        ? "bg-[#ffe317] border-[#ffe317] ring-4 ring-[#ffe317]/20 animate-pulse"
                        : step.completed
                        ? "bg-[#10b981] border-[#10b981]"
                        : "bg-[#111827] border-[#4b5563]"
                    }`}
                  />
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-xs font-bold leading-tight ${
                        step.current ? "text-[#ffe317]" : step.completed ? "text-white" : "text-[#9ca3af]"
                      }`}
                    >
                      {step.title}
                    </span>
                    {step.date && (
                      <span className="text-[10px] font-mono text-[#9ca3af]">
                        {new Date(step.date).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9ca3af] leading-relaxed">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Ficha de Ingreso y Daños Constatados (Accordion) */}
        {trackingData.reception && (
          <section aria-label="Ficha de Ingreso y Daños" className="bg-[#111827] rounded-2xl border border-[#374151] overflow-hidden shadow-md">
            <button
              type="button"
              onClick={() => setShowIntakeDetails((prev) => !prev)}
              aria-expanded={showIntakeDetails}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-[#1f2937]/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono font-bold text-[#ffe317] uppercase">Ficha de Ingreso</span>
                <span className="text-xs text-[#9ca3af]">| Odómetro, combustible y daños</span>
              </div>
              <span className="text-xs text-[#ffe317] font-bold">
                {showIntakeDetails ? "Ocultar ▲" : "Ver Detalle ▼"}
              </span>
            </button>

            {showIntakeDetails && (
              <div className="border-t border-[#374151] p-4 flex flex-col gap-4 text-xs">
                {/* Datos rápidos odómetro / combustible */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#090d16] p-3 rounded-xl border border-[#374151] flex flex-col">
                    <span className="text-[10px] text-[#9ca3af] uppercase font-mono">Odómetro Ingreso</span>
                    <span className="text-sm font-bold text-white mt-1">
                      {trackingData.reception.odometer.toLocaleString("es-AR")} km
                    </span>
                  </div>
                  <div className="bg-[#090d16] p-3 rounded-xl border border-[#374151] flex flex-col">
                    <span className="text-[10px] text-[#9ca3af] uppercase font-mono">Nivel de Combustible</span>
                    <span className="text-sm font-bold text-[#ffe317] mt-1">
                      {trackingData.reception.fuelLevel === "VACIO"
                        ? "Reserva / Vacío"
                        : trackingData.reception.fuelLevel === "CUARTO"
                        ? "1/4 Tanque"
                        : trackingData.reception.fuelLevel === "MITAD"
                        ? "1/2 Tanque"
                        : trackingData.reception.fuelLevel === "TRES_CUARTOS"
                        ? "3/4 Tanque"
                        : trackingData.reception.fuelLevel === "LLENO"
                        ? "Tanque Lleno"
                        : trackingData.reception.fuelLevel}
                    </span>
                  </div>
                </div>

                {/* Motivo de ingreso */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono uppercase text-[#9ca3af]">Motivo de Ingreso / Falla Reportada</span>
                  <p className="bg-[#090d16] p-3 rounded-xl border border-[#374151] text-white leading-relaxed">
                    {trackingData.reception.customerComplaint || "Sin observaciones registradas."}
                  </p>
                </div>

                {/* Declaración de pertenencias */}
                <div className="flex items-center gap-2 text-[11px] text-[#9ca3af]">
                  <span className={`w-2 h-2 rounded-full ${trackingData.reception.declaredBelongings ? "bg-[#10b981]" : "bg-[#6b7280]"}`} />
                  <span>
                    {trackingData.reception.declaredBelongings
                      ? "Objetos de valor o pertenencias declaradas y bajo custodia."
                      : "Sin objetos de valor de custodia declarados en habitáculo."}
                  </span>
                </div>

                {/* Daños preexistentes */}
                <div className="flex flex-col gap-2 pt-1">
                  <span className="text-[10px] font-mono uppercase text-[#9ca3af]">
                    Daños Preexistentes ({trackingData.reception.damages.length})
                  </span>
                  {trackingData.reception.damages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {trackingData.reception.damages.map((d) => (
                        <div
                          key={d.id}
                          className="bg-[#090d16] p-2.5 rounded-lg border border-[#374151] flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#374151] text-white">
                              {d.zone}
                            </span>
                            <span className="text-xs text-[#ffe317] font-semibold">{d.damageType}</span>
                          </div>
                          {d.note && <span className="text-[10px] text-[#9ca3af] truncate max-w-[120px]">{d.note}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20 p-2.5 rounded-lg">
                      ✓ Vehículo ingresado sin daños exteriores preexistentes declarados.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Presupuesto Detallado y Aprobación */}
        {trackingData.budget ? (
          <section aria-label="Presupuesto y Decisión" className="bg-[#111827] rounded-2xl border border-[#374151] p-5 shadow-md flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#374151] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white">Presupuesto Técnico</h2>
                  <span className="text-[10px] font-mono text-[#9ca3af]">v{trackingData.budget.versionNumber}</span>
                </div>
                <p className="text-xs text-[#9ca3af]">
                  {isPendingApproval
                    ? "Seleccione las tareas y repuestos a autorizar. El total se recalcula al instante."
                    : `Estado: ${trackingData.budget.status}`}
                </p>
              </div>

              {isPendingApproval && (
                <button
                  type="button"
                  onClick={handleApproveAll}
                  className="px-2.5 py-1 rounded bg-[#1f2937] hover:bg-[#374151] text-[11px] text-[#ffe317] border border-[#374151] transition-colors"
                >
                  Aprobar Todos
                </button>
              )}
            </div>

            {/* Alerta de Decisión Exitosa */}
            {decisionResult && (
              <div className="bg-[#10b981]/15 border border-[#10b981]/40 rounded-xl p-4 flex flex-col gap-1 text-xs">
                <span className="font-bold text-[#10b981]">¡Decisión Confirmada!</span>
                <p className="text-white">{decisionResult.message}</p>
                <span className="text-[10px] font-mono text-[#9ca3af]">
                  Monto final acordado: ${decisionResult.totalApprovedAmount.toLocaleString("es-AR")} ({decisionResult.approvedItemsCount} ítems aprobados, {decisionResult.rejectedItemsCount} omitidos)
                </span>
              </div>
            )}

            {/* Error de Envío */}
            {submitError && (
              <div className="bg-[#ef4444]/15 border border-[#ef4444]/40 rounded-xl p-3 text-xs text-[#fca5a5]">
                {submitError}
              </div>
            )}

            {/* Mano de Obra */}
            {trackingData.budget.laborLines.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-mono font-bold text-[#ffe317] uppercase tracking-wide">
                  1. Mano de Obra & Servicios ({trackingData.budget.laborLines.length})
                </span>
                <div className="flex flex-col gap-2.5">
                  {trackingData.budget.laborLines.map((line) => {
                    const isApproved = isPendingApproval ? approvedItems[line.id] ?? true : line.approved;
                    return (
                      <div
                        key={line.id}
                        onClick={() => isPendingApproval && toggleItem(line.id)}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isPendingApproval ? "cursor-pointer" : ""
                        } ${
                          isApproved
                            ? "bg-[#090d16] border-[#374151] hover:border-[#ffe317]/50"
                            : "bg-[#090d16]/50 border-[#1f2937] opacity-60 line-through"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {isPendingApproval && (
                              <input
                                type="checkbox"
                                checked={isApproved}
                                onChange={() => toggleItem(line.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Aprobar tarea ${line.description}`}
                                className="w-5 h-5 rounded border-[#374151] text-[#ffe317] focus:ring-[#ffe317] bg-[#111827] mt-0.5"
                              />
                            )}
                            <div>
                              <p className={`text-xs font-semibold ${isApproved ? "text-white" : "text-[#9ca3af] line-through"}`}>
                                {line.description}
                              </p>
                              <span className="text-[11px] text-[#9ca3af]">
                                {line.estimatedMinutes} min • ${line.hourlyRateCharged.toLocaleString("es-AR")}/h
                              </span>
                            </div>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <span className={`text-xs font-bold font-mono ${isApproved ? "text-[#ffe317]" : "text-[#6b7280]"}`}>
                              ${line.lineTotal.toLocaleString("es-AR")}
                            </span>
                            <div>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isApproved ? "bg-[#065f46] text-[#a7f3d0]" : "bg-[#374151] text-[#9ca3af]"}`}>
                                {isApproved ? "Aprobado" : "Omitido"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Repuestos & Insumos */}
            {trackingData.budget.partLines.length > 0 && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-mono font-bold text-[#ffe317] uppercase tracking-wide">
                  2. Repuestos & Insumos ({trackingData.budget.partLines.length})
                </span>
                <div className="flex flex-col gap-2.5">
                  {trackingData.budget.partLines.map((line) => {
                    const isApproved = isPendingApproval ? approvedItems[line.id] ?? true : line.approved;
                    return (
                      <div
                        key={line.id}
                        onClick={() => isPendingApproval && toggleItem(line.id)}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isPendingApproval ? "cursor-pointer" : ""
                        } ${
                          isApproved
                            ? "bg-[#090d16] border-[#374151] hover:border-[#ffe317]/50"
                            : "bg-[#090d16]/50 border-[#1f2937] opacity-60 line-through"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            {isPendingApproval && (
                              <input
                                type="checkbox"
                                checked={isApproved}
                                onChange={() => toggleItem(line.id)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Aprobar repuesto ${line.description}`}
                                className="w-5 h-5 rounded border-[#374151] text-[#ffe317] focus:ring-[#ffe317] bg-[#111827] mt-0.5"
                              />
                            )}
                            <div>
                              <p className={`text-xs font-semibold ${isApproved ? "text-white" : "text-[#9ca3af] line-through"}`}>
                                {line.description}
                              </p>
                              <span className="text-[11px] text-[#9ca3af]">
                                Cant: {line.quantity} • ${line.unitPriceCharged.toLocaleString("es-AR")} c/u
                              </span>
                            </div>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <span className={`text-xs font-bold font-mono ${isApproved ? "text-[#ffe317]" : "text-[#6b7280]"}`}>
                              ${line.lineTotal.toLocaleString("es-AR")}
                            </span>
                            <div>
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isApproved ? "bg-[#065f46] text-[#a7f3d0]" : "bg-[#374151] text-[#9ca3af]"}`}>
                                {isApproved ? "Aprobado" : "Omitido"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Desglose de Totales */}
            <div className="bg-[#090d16] p-4 rounded-xl border border-[#374151] flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-[#9ca3af]">
                <span>Subtotal Mano de Obra:</span>
                <span className="font-mono text-white">
                  ${isPendingApproval ? budgetCalculations.laborSubtotal.toLocaleString("es-AR") : trackingData.budget.laborSubtotal.toLocaleString("es-AR")}
                </span>
              </div>
              <div className="flex justify-between text-[#9ca3af]">
                <span>Subtotal Repuestos:</span>
                <span className="font-mono text-white">
                  ${isPendingApproval ? budgetCalculations.partsSubtotal.toLocaleString("es-AR") : trackingData.budget.partsSubtotal.toLocaleString("es-AR")}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-t border-[#374151] pt-2 text-sm font-bold text-white">
                <span>Total Estimado {isPendingApproval ? "Seleccionado" : "Final"}:</span>
                <span className="font-mono text-base text-[#ffe317]">
                  ${isPendingApproval ? budgetCalculations.total.toLocaleString("es-AR") : trackingData.budget.totalEstimated.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            {/* Campo de notas para el taller (si está pendiente de aprobación) */}
            {isPendingApproval && !decisionResult && (
              <div className="flex flex-col gap-1.5 pt-1">
                <label htmlFor="decisionNotes" className="text-xs font-bold text-white">
                  Instrucciones o comentarios adicionales para el taller (opcional):
                </label>
                <textarea
                  id="decisionNotes"
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Ej: Autorizo el cambio de pastillas pero prefiero esperar con los amortiguadores..."
                  rows={3}
                  className="w-full rounded-xl bg-[#090d16] border border-[#374151] p-3 text-xs text-white placeholder-[#6b7280] focus:border-[#ffe317] focus:outline-none"
                />
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Estado del Presupuesto" className="bg-[#111827] rounded-2xl border border-[#374151] p-5 text-center flex flex-col gap-2 shadow-md">
            <span className="text-xs font-mono text-[#ffe317] uppercase">Diagnóstico en Proceso</span>
            <h3 className="text-sm font-bold text-white">Presupuesto en Elaboración</h3>
            <p className="text-xs text-[#9ca3af]">
              El equipo técnico está realizando la inspección mecánica y presupuestando las tareas y repuestos requeridos. Se le notificará por este mismo medio en cuanto esté disponible para su aprobación interactiva.
            </p>
          </section>
        )}

        {/* Información del Taller / Footer */}
        <footer className="bg-[#111827] rounded-2xl border border-[#374151] p-4 text-center flex flex-col gap-1 text-[11px] text-[#9ca3af] mt-2 shadow-sm">
          <span className="font-bold text-white">{trackingData.workshop.name}</span>
          <span>{trackingData.workshop.address}</span>
          <span className="font-mono">Tel: {trackingData.workshop.phone}</span>
          <span className="text-[10px] text-[#6b7280] pt-2">
            Sistema de Gestión Integral OS-CAR • Monitoreo Técnico en Tiempo Real
          </span>
        </footer>
      </main>

      {/* Floating Action Button (WhatsApp) */}
      <aside aria-label="Contacto directo con el taller" className="fixed bottom-24 right-4 z-40">
        <a
          href={whatsappInquiryUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Consultar a mi asesor de servicio por WhatsApp"
          className="w-12 h-12 rounded-full bg-[#10b981] hover:bg-[#059669] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 min-w-[48px] min-h-[48px] border-2 border-white/20"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.075-2.227-.557-1.748-.72-2.87-2.485-2.956-2.6-.088-.116-.708-.941-.708-1.792s.448-1.272.607-1.446c.159-.175.348-.218.464-.218.116 0 .232.001.333.006.107.005.25.04.39.377.144.348.492 1.202.535 1.29.043.087.072.188.014.304-.058.116-.087.188-.174.29-.087.102-.183.228-.261.306-.087.087-.178.182-.077.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.377-.044.102-.116.435-.507.55-.681.116-.174.232-.145.39-.087.16.058 1.014.478 1.188.565.174.087.29.13.333.203.044.072.044.42-.1.825z" />
          </svg>
        </a>
      </aside>

      {/* Sticky Bottom Action Bar (Cuando el presupuesto está pendiente de aprobación) */}
      {isPendingApproval && !decisionResult && (
        <aside aria-label="Barra de confirmación de presupuesto" className="fixed bottom-0 left-0 right-0 z-40 bg-[#111827]/95 backdrop-blur-md border-t border-[#374151] p-4 shadow-2xl">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-mono text-[#9ca3af]">Total Autorizado</span>
              <span className="text-lg font-black font-mono text-[#ffe317] leading-tight">
                ${budgetCalculations.total.toLocaleString("es-AR")}
              </span>
              <span className="text-[10px] text-[#9ca3af]">
                {budgetCalculations.approvedCount} aprobados • {budgetCalculations.rejectedCount} omitidos
              </span>
            </div>

            <Button
              type="button"
              variant="primary"
              loading={isSubmitting}
              loadingLabel="Registrando..."
              onClick={handleSubmitDecision}
              className="min-h-[48px] px-5 rounded-xl bg-[#ffe317] text-black font-bold hover:bg-[#e6cc15] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2 border-transparent"
            >
              {budgetCalculations.approvedCount === 0 ? "Rechazar Presupuesto" : "Confirmar Decisión"}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
