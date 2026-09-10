"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { FormEvent, MouseEvent, TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlateInput, normalizePlate } from "@/components/ui/plate-input";
import type { PlateNormalizationResult } from "@/components/ui/plate-input";
import {
  ApiClientError,
  baysApi,
  receptionApi,
} from "@/lib/api-client";
import type {
  BayDto,
  FastVehicleLookupDto,
  ReceptionCheckInInput,
  ReceptionDamageItemInput,
  ReceptionDamageType,
  ReceptionSummaryDto,
} from "@/lib/api-client";

type ClientType = "particular" | "flota" | "garantia";

const SYMPTOM_CHIPS = [
  { label: "Service Oficial 80k km", text: "Service oficial de mantenimiento programado según manual de fabricante" },
  { label: "Ruidos tren delantero", text: "Ruidos y crujidos en tren delantero al doblar y sobre baches" },
  { label: "Check Engine ON", text: "Testigo Check Engine encendido en instrumental; scanner requerido" },
  { label: "Fuga de fluido", text: "Goteo de fluido visible bajo el vano motor" },
  { label: "Frenos ruidosos", text: "Chirrido y vibración perceptible al accionar el pedal de freno" },
  { label: "Alineación y balanceo", text: "Desvío de trayectoria en recta y vibración en volante a velocidad" },
] as const;

const FUEL_STEPS: Array<{
  value: ReceptionCheckInInput["fuelLevel"];
  label: string;
  badge: string;
  pct: string;
}> = [
  { value: "VACIO", label: "E", badge: "Vacío", pct: "0%" },
  { value: "CUARTO", label: "1/4", badge: "1/4", pct: "25%" },
  { value: "MITAD", label: "1/2", badge: "1/2", pct: "50%" },
  { value: "TRES_CUARTOS", label: "3/4", badge: "3/4", pct: "75%" },
  { value: "LLENO", label: "F", badge: "Lleno", pct: "100%" },
];

const DAMAGE_SEVERITIES: Array<{
  type: ReceptionDamageType;
  label: string;
  icon: string;
  colorClass: string;
}> = [
  { type: "RAYON", label: "Rayón", icon: "X", colorClass: "bg-[#ef4444] text-white" },
  { type: "ABOLLADURA", label: "Abolladura", icon: "O", colorClass: "bg-[#eab308] text-black font-bold" },
  { type: "ROTURA", label: "Rotura / Faltante", icon: "!", colorClass: "bg-[#b91c1c] text-white font-black" },
  { type: "CRISTAL", label: "Cristal / Óptica", icon: "C", colorClass: "bg-[#3b82f6] text-white" },
  { type: "OTRO", label: "Otro daño", icon: "?", colorClass: "bg-[#6b7280] text-white" },
];

const SCHEMATIC_ZONES = [
  { id: "FRENTE", label: "Frente / Ópticas", xPercent: 20, yPercent: 50 },
  { id: "LATERAL_IZQ", label: "Lateral Izquierdo", xPercent: 50, yPercent: 18 },
  { id: "TECHO", label: "Techo / Cristales", xPercent: 50, yPercent: 50 },
  { id: "LATERAL_DER", label: "Lateral Derecho", xPercent: 50, yPercent: 82 },
  { id: "TRASERA", label: "Trasera / Baúl", xPercent: 80, yPercent: 50 },
] as const;

interface DamagePoint extends ReceptionDamageItemInput {
  id: string;
}

export default function RecepcionPage(): React.JSX.Element {
  // Client type selector
  const [clientType, setClientType] = useState<ClientType>("particular");

  // Identification & Lookup
  const [plateResult, setPlateResult] = useState<PlateNormalizationResult>(normalizePlate(""));
  const [isSearchingPlate, setIsSearchingPlate] = useState(false);
  const [plateSearchError, setPlateSearchError] = useState<string | null>(null);
  const [vehicleLookup, setVehicleLookup] = useState<FastVehicleLookupDto | null>(null);

  // Customer State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Vehicle State
  const [vehicleType, setVehicleType] = useState<"AUTO" | "CAMIONETA" | "CAMION">("AUTO");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [color, setColor] = useState("");
  const [vin, setVin] = useState("");

  // Odometer and Fuel
  const [odometerIn, setOdometerIn] = useState("");
  const [fuelLevel, setFuelLevel] = useState<ReceptionCheckInInput["fuelLevel"]>("MITAD");

  // Reason & Bay
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [intakeNotes, setIntakeNotes] = useState("");
  const [selectedBayId, setSelectedBayId] = useState<string>("");
  const [bays, setBays] = useState<BayDto[]>([]);

  // Damages
  const [damages, setDamages] = useState<DamagePoint[]>([]);
  const [activeDamageType, setActiveDamageType] = useState<ReceptionDamageType>("RAYON");
  const [selectedZone, setSelectedZone] = useState<string>("FRENTE");

  // Belongings declaration
  const [declaredBelongings, setDeclaredBelongings] = useState(true);

  // Signature Pad
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Submission & Result
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<ReceptionSummaryDto | null>(null);

  // Fetch available bays
  useEffect(() => {
    baysApi
      .list()
      .then((items) => {
        setBays(items.filter((b) => b.isEnabled));
      })
      .catch(() => {
        // Tolerante a fallas de red en entorno sin bahías
      });
  }, []);

  // Quick lookup handler
  const handleSearchPlate = useCallback(async () => {
    if (!plateResult.value || plateResult.value.length < 5) {
      setPlateSearchError("Ingresá una patente válida (mínimo 5 caracteres).");
      return;
    }

    setIsSearchingPlate(true);
    setPlateSearchError(null);

    try {
      const lookup = await receptionApi.lookupPlate(plateResult.value);
      setVehicleLookup(lookup);

      if (lookup.found && lookup.vehicle) {
        if (lookup.vehicle.make) setMake(lookup.vehicle.make);
        if (lookup.vehicle.model) setModel(lookup.vehicle.model);
        if (lookup.vehicle.modelYear) setModelYear(String(lookup.vehicle.modelYear));
        if (lookup.vehicle.color) setColor(lookup.vehicle.color);
        if (lookup.vehicle.vin) setVin(lookup.vehicle.vin);
        if (lookup.vehicle.vehicleType === "CAMIONETA" || lookup.vehicle.vehicleType === "CAMION") {
          setVehicleType(lookup.vehicle.vehicleType);
        }
      }

      if (lookup.found && lookup.customer) {
        setCustomerName(lookup.customer.fullName);
        setCustomerPhone(lookup.customer.phoneE164);
        if (lookup.customer.document) setCustomerDocument(lookup.customer.document);
        if (lookup.customer.email) setCustomerEmail(lookup.customer.email);
      }
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Error al buscar datos del vehículo.";
      setPlateSearchError(message);
    } finally {
      setIsSearchingPlate(false);
    }
  }, [plateResult.value]);

  // Symptom chip click handler
  const handleAddSymptom = (text: string) => {
    setCustomerComplaint((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      if (trimmed.includes(text)) return trimmed;
      return `${trimmed} • ${text}`;
    });
  };

  // Add damage point
  const handleAddDamagePoint = (zone: string, xPercent: number, yPercent: number) => {
    const newPoint: DamagePoint = {
      id: `dmg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      zone,
      damageType: activeDamageType,
      xPercent: Math.round(xPercent),
      yPercent: Math.round(yPercent),
      note: `${activeDamageType} en ${zone}`,
    };
    setDamages((prev) => [...prev, newPoint]);
  };

  const handleRemoveDamagePoint = (id: string) => {
    setDamages((prev) => prev.filter((d) => d.id !== id));
  };

  // Signature canvas drawing
  const startDrawing = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffe317";
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Submission
  const handleSubmitReception = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setSubmitError(null);

    if (!plateResult.isValid && plateResult.value.length < 5) {
      setSubmitError("La patente ingresada no es válida.");
      return;
    }

    if (customerName.trim().length < 2) {
      setSubmitError("El nombre y apellido del cliente es obligatorio.");
      return;
    }

    if (customerPhone.replace(/\D/g, "").length < 6) {
      setSubmitError("El teléfono de contacto debe contener al menos 6 números.");
      return;
    }

    const odo = parseInt(odometerIn.replace(/\D/g, ""), 10);
    if (isNaN(odo) || odo < 0) {
      setSubmitError("El odómetro debe ser un número entero mayor o igual a 0.");
      return;
    }

    if (customerComplaint.trim().length < 3) {
      setSubmitError("Por favor describa el motivo de ingreso o síntomas.");
      return;
    }

    let signatureUrl: string | null = null;
    if (hasSignature && canvasRef.current) {
      try {
        signatureUrl = canvasRef.current.toDataURL("image/png");
      } catch {
        signatureUrl = "data:image/png;base64,mockedSignature";
      }
    }

    const payload: ReceptionCheckInInput = {
      licensePlate: plateResult.value,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerDocument: customerDocument.trim() || null,
      customerEmail: customerEmail.trim() || null,
      vehicleType,
      make: make.trim() || null,
      model: model.trim() || null,
      modelYear: modelYear ? parseInt(modelYear, 10) : null,
      color: color.trim() || null,
      vin: vin.trim() || null,
      odometerIn: odo,
      fuelLevel,
      customerComplaint: customerComplaint.trim(),
      intakeNotes: intakeNotes.trim() || null,
      bayId: selectedBayId || null,
      declaredBelongings,
      signature: signatureUrl,
      damages: damages.map((d) => ({
        zone: d.zone,
        damageType: d.damageType,
        xPercent: d.xPercent,
        yPercent: d.yPercent,
        note: d.note,
      })),
    };

    setIsSubmitting(true);

    try {
      const summary = await receptionApi.registerReception(payload);
      setCreatedSummary(summary);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Ocurrió un error inesperado al registrar el ingreso del vehículo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setPlateResult(normalizePlate(""));
    setVehicleLookup(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerDocument("");
    setCustomerEmail("");
    setMake("");
    setModel("");
    setModelYear("");
    setColor("");
    setVin("");
    setOdometerIn("");
    setFuelLevel("MITAD");
    setCustomerComplaint("");
    setIntakeNotes("");
    setSelectedBayId("");
    setDamages([]);
    clearSignature();
    setSubmitError(null);
    setCreatedSummary(null);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#090d16] text-[#f9fafb]">
      {/* Subcabecera Táctica Ergonométrica */}
      <section className="w-full bg-[#111827] border-b border-[#374151] px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-[#ffe317] text-black flex items-center justify-center font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </span>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#ffe317] font-bold block">
                Mostrador Rápido • Flujo Express (60s)
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Recepción de Vehículo • Nueva Orden de Entrada
              </h1>
            </div>
          </div>

          <div className="flex items-center bg-[#1f2937] rounded-lg p-1 gap-1">
            <button
              type="button"
              onClick={() => setClientType("particular")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all min-h-[36px] ${
                clientType === "particular"
                  ? "bg-[#374151] text-white shadow-sm"
                  : "text-[#9ca3af] hover:text-white"
              }`}
            >
              Particular
            </button>
            <button
              type="button"
              onClick={() => setClientType("flota")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all min-h-[36px] ${
                clientType === "flota"
                  ? "bg-[#374151] text-white shadow-sm"
                  : "text-[#9ca3af] hover:text-white"
              }`}
            >
              Flota / Empresa
            </button>
            <button
              type="button"
              onClick={() => setClientType("garantia")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all min-h-[36px] ${
                clientType === "garantia"
                  ? "bg-[#374151] text-white shadow-sm"
                  : "text-[#9ca3af] hover:text-white"
              }`}
            >
              Garantía Taller
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded bg-[#1f2937] border border-[#374151]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse"></span>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase text-[#9ca3af] leading-tight">Capacidad Bahías</span>
              <span className="text-xs font-mono font-bold text-[#ffe317]">
                {bays.length > 0 ? `${bays.filter((b) => b.status === "LIBRE").length} de ${bays.length} libres` : "Bahías listas"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Formulario Principal de 2 Columnas */}
      <main className="w-full px-4 lg:px-8 py-6 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start pb-32">
        {/* ================= COLUMNA IZQUIERDA: Patente, Cliente, Auto, Odómetro & Nafta ================= */}
        <div className="xl:col-span-6 flex flex-col gap-6">
          {/* Card 1: Patente Mercosur y Consulta DNRPA */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase text-[#9ca3af] font-semibold tracking-wider flex items-center gap-1.5">
                <span>Dominio / Matrícula Mercosur</span>
              </span>
              <span className="text-[11px] font-mono text-[#ffe317] font-semibold uppercase">Auto-Sync TallerPro</span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <div className="flex-1">
                <PlateInput
                  value={plateResult.value}
                  onChange={(res) => {
                    setPlateResult(res);
                    setPlateSearchError(null);
                  }}
                  showValidation={plateResult.value.length >= 5}
                  className="text-center font-mono tracking-widest text-lg font-bold min-h-[48px]"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSearchPlate}
                loading={isSearchingPlate}
                loadingLabel="Consultando..."
                className="min-h-[48px] px-5 font-mono font-bold text-[#ffe317] border-[#374151] hover:bg-[#1f2937]"
              >
                Buscar Ficha
              </Button>
            </div>

            {plateSearchError && (
              <p role="alert" className="text-xs text-[#f87171] font-medium bg-[#450a0a]/50 p-2 rounded border border-[#ef4444]/30">
                {plateSearchError}
              </p>
            )}

            {/* Banner Vehículo Encontrado */}
            {vehicleLookup?.found && (
              <div className="bg-[#1f2937] p-3.5 rounded-lg border border-[#10b981]/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-1.5 rounded-full bg-[#10b981]/20 text-[#10b981]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">
                      Vehículo Registrado • {vehicleLookup.history?.previousOrdersCount ?? 0} servicios previos
                    </span>
                    <span className="text-[11px] font-mono text-[#9ca3af]">
                      {vehicleLookup.history?.lastServiceDate
                        ? `Último ingreso: ${new Date(vehicleLookup.history.lastServiceDate).toLocaleDateString("es-AR")} (${vehicleLookup.history.lastServiceComplaint || "Mantenimiento"})`
                        : "Sin historial previo registrado"}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#10b981]/10 text-[#10b981] font-mono text-[10px] font-bold border border-[#10b981]/30 uppercase">
                  Ficha OK
                </span>
              </div>
            )}

            {/* Alerta de Orden Activa */}
            {vehicleLookup?.activeOrder && (
              <div role="alert" className="bg-[#450a0a]/70 p-3.5 rounded-lg border border-[#ef4444] text-[#fca5a5] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg font-bold">⚠️</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white">¡Atención! Este vehículo ya posee una orden activa:</span>
                    <span className="text-[11px] font-mono">
                      Orden #{vehicleLookup.activeOrder.id.slice(-6).toUpperCase()} • Estado: {vehicleLookup.activeOrder.status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Datos del Cliente */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Datos del Cliente Responsable</span>
              </h2>
              <span className="text-[11px] font-mono text-[#9ca3af]">Titular / Conductor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nombre y Apellido *"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="min-h-[48px]"
                required
              />
              <Input
                label="DNI / CUIT Titular"
                value={customerDocument}
                onChange={(e) => setCustomerDocument(e.target.value)}
                placeholder="Ej. 31.428.990"
                className="min-h-[48px] font-mono"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Teléfono de Contacto Directo *"
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+54 9 11 5544-3322"
                  className="min-h-[48px] font-mono"
                  required
                />
              </div>
              {customerPhone ? (
                <a
                  href={`https://wa.me/${customerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-4 bg-[#065f46] hover:bg-[#047857] text-white rounded-md flex items-center justify-center gap-2 text-sm font-bold transition-colors border border-[#10b981]/30 shadow-sm"
                  title="Abrir chat de WhatsApp con el cliente"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.075-2.227-.557-1.748-.72-2.87-2.485-2.956-2.6-.088-.116-.708-.941-.708-1.792s.448-1.272.607-1.446c.159-.175.348-.218.464-.218.116 0 .232.001.333.006.107.005.25.04.39.377.144.348.492 1.202.535 1.29.043.087.072.188.014.304-.058.116-.087.188-.174.29-.087.102-.183.228-.261.306-.087.087-.178.182-.077.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.377-.044.102-.116.435-.507.55-.681.116-.174.232-.145.39-.087.16.058 1.014.478 1.188.565.174.087.29.13.333.203.044.072.044.42-.1.825z" />
                  </svg>
                  <span>WhatsApp</span>
                </a>
              ) : null}
            </div>

            <Input
              label="Correo Electrónico (Opcional)"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="cliente@ejemplo.com"
              className="min-h-[48px]"
            />
          </div>

          {/* Card 3: Especificaciones de la Unidad */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Especificaciones de la Unidad</span>
              </h2>
              <div className="flex items-center gap-1 bg-[#1f2937] p-1 rounded-md border border-[#374151]">
                {(["AUTO", "CAMIONETA", "CAMION"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setVehicleType(t)}
                    className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded transition-colors ${
                      vehicleType === t ? "bg-[#2563eb] text-white" : "text-[#9ca3af] hover:text-white"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Marca y Modelo"
                value={make ? `${make} ${model}`.trim() : model}
                onChange={(e) => {
                  const val = e.target.value;
                  const parts = val.split(" ");
                  setMake(parts[0] || "");
                  setModel(parts.slice(1).join(" ") || "");
                }}
                placeholder="Ej. Peugeot 208"
                className="min-h-[48px]"
              />
              <Input
                label="Año de Fabricación"
                type="number"
                value={modelYear}
                onChange={(e) => setModelYear(e.target.value)}
                placeholder="Ej. 2022"
                className="min-h-[48px] font-mono"
              />
              <Input
                label="Color de Carrocería"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Ej. Gris Grafito"
                className="min-h-[48px]"
              />
            </div>

            <Input
              label="VIN / Número de Chasis"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="Ej. 8A1230048ZJ9"
              className="min-h-[48px] font-mono uppercase"
            />
          </div>

          {/* Card 4: Odómetro y Nivel de Combustible */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <h2 className="text-base font-bold text-white flex items-center justify-between">
              <span>Estado Operativo al Ingreso</span>
              <span className="text-xs font-mono text-[#ffe317]">Lectura Fiel</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
              {/* Odómetro */}
              <div className="sm:col-span-5 flex flex-col gap-1.5">
                <label htmlFor="odometer-input" className="text-xs font-mono uppercase text-[#9ca3af] font-semibold">
                  Odómetro Entrada (KM) *
                </label>
                <div className="relative flex items-center">
                  <input
                    id="odometer-input"
                    type="number"
                    min="0"
                    step="1"
                    value={odometerIn}
                    onChange={(e) => setOdometerIn(e.target.value)}
                    placeholder="84250"
                    required
                    className="w-full min-h-[48px] rounded-md border border-[#374151] bg-[#090d16] px-3.5 py-2 font-mono text-lg font-bold text-[#ffe317] tracking-wider focus:outline-none focus:ring-2 focus:ring-[#ffe317]"
                  />
                  <span className="absolute right-3 text-xs font-mono font-bold text-[#9ca3af] pointer-events-none">
                    KM
                  </span>
                </div>
              </div>

              {/* Selector Táctil de Combustible */}
              <div className="sm:col-span-7 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-[#9ca3af] font-semibold">Nivel de Combustible</span>
                  <span className="text-xs font-mono font-bold text-[#ffe317]">
                    {FUEL_STEPS.find((s) => s.value === fuelLevel)?.badge} (
                    {FUEL_STEPS.find((s) => s.value === fuelLevel)?.pct})
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {FUEL_STEPS.map((step) => {
                    const isSelected = fuelLevel === step.value;
                    return (
                      <button
                        key={step.value}
                        type="button"
                        onClick={() => setFuelLevel(step.value)}
                        className={`min-h-[48px] rounded-md font-mono text-sm font-bold flex flex-col items-center justify-center transition-all border ${
                          isSelected
                            ? "bg-[#ffe317] text-black border-[#ffe317] shadow-md scale-[1.02]"
                            : "bg-[#1f2937] text-[#9ca3af] border-[#374151] hover:bg-[#374151] hover:text-white"
                        }`}
                        aria-pressed={isSelected}
                        data-fuel={step.badge}
                      >
                        <span>{step.label}</span>
                        <span className="text-[10px] font-normal opacity-80">{step.pct}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUMNA DERECHA: Motivo, Daños, Pertenencias & Firma ================= */}
        <div className="xl:col-span-6 flex flex-col gap-6">
          {/* Card 5: Motivo de Ingreso & Síntomas */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Motivo de Ingreso & Síntomas *</span>
              </h2>
              <span className="text-xs font-mono text-[#ffe317]">Toque Rápido</span>
            </div>

            {/* Chips de diagnóstico rápido */}
            <div className="flex flex-wrap gap-2">
              {SYMPTOM_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleAddSymptom(chip.text)}
                  className="min-h-[48px] px-3.5 py-2 rounded-lg bg-[#1f2937] hover:bg-[#374151] text-[#f9fafb] text-xs font-medium border border-[#374151] transition-colors flex items-center gap-1.5 active:scale-95"
                >
                  <span className="text-[#ffe317] text-sm">+</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={customerComplaint}
              onChange={(e) => setCustomerComplaint(e.target.value)}
              placeholder="Describa el fallo, indicaciones del cliente o tareas específicas a presupuestar..."
              required
              className="w-full rounded-md border border-[#374151] bg-[#111827] p-3 text-sm text-[#f9fafb] focus:outline-none focus:ring-2 focus:ring-[#2563eb] leading-relaxed"
            />

            {/* Asignación Opcional de Bahía */}
            <div className="flex flex-col gap-1.5 pt-1">
              <label htmlFor="bay-select" className="text-xs font-mono uppercase text-[#9ca3af] font-semibold">
                Derivación Directa a Bahía (Opcional)
              </label>
              <select
                id="bay-select"
                value={selectedBayId}
                onChange={(e) => setSelectedBayId(e.target.value)}
                className="min-h-[48px] w-full rounded-md border border-[#374151] bg-[#111827] px-3 py-2 text-sm text-[#f9fafb] focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
              >
                <option value="">-- Sin asignar (Permanece en Espera de Diagnóstico) --</option>
                {bays.map((bay) => (
                  <option key={bay.id} value={bay.id}>
                    Bahía {bay.code} • {bay.status === "LIBRE" ? "Disponible" : "Ocupada"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Card 6: Diagrama Esquemático de Daños 2D */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Inspección Visual de Carrocería</span>
              </h2>
              <div className="flex items-center gap-2">
                {DAMAGE_SEVERITIES.map((sev) => {
                  const isActive = activeDamageType === sev.type;
                  return (
                    <button
                      key={sev.type}
                      type="button"
                      onClick={() => setActiveDamageType(sev.type)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold flex items-center gap-1 transition-all border ${
                        isActive
                          ? `${sev.colorClass} ring-2 ring-white border-transparent`
                          : "bg-[#1f2937] text-[#9ca3af] border-[#374151] hover:text-white"
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] bg-black/40">
                        {sev.icon}
                      </span>
                      <span>{sev.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de zona rápida */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-[#9ca3af]">Marcar Zona:</span>
              {SCHEMATIC_ZONES.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => {
                    setSelectedZone(zone.id);
                    handleAddDamagePoint(zone.id, zone.xPercent, zone.yPercent);
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border min-h-[40px] transition-colors ${
                    selectedZone === zone.id
                      ? "bg-[#2563eb] text-white border-transparent"
                      : "bg-[#1f2937] text-[#9ca3af] border-[#374151] hover:bg-[#374151] hover:text-white"
                  }`}
                >
                  + {zone.label}
                </button>
              ))}
            </div>

            {/* Canvas / SVG Esquemático Interactivo */}
            <div className="relative w-full bg-[#090d16] rounded-xl border border-[#374151] p-4 flex flex-col items-center justify-center overflow-hidden min-h-[240px]">
              {/* SVG Silueta Cenital Automotriz */}
              <svg
                className="w-full max-w-[420px] h-auto select-none cursor-crosshair"
                viewBox="0 0 340 180"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
                  const yPct = ((e.clientY - rect.top) / rect.height) * 100;

                  let zone = "TECHO";
                  if (xPct < 30) zone = "FRENTE";
                  else if (xPct > 70) zone = "TRASERA";
                  else if (yPct < 35) zone = "LATERAL_IZQ";
                  else if (yPct > 65) zone = "LATERAL_DER";

                  handleAddDamagePoint(zone, xPct, yPct);
                }}
              >
                {/* Chasis */}
                <path
                  d="M 40 50 C 40 35, 70 30, 110 30 L 230 30 C 270 30, 300 35, 300 50 L 305 65 C 310 75, 310 105, 305 115 L 300 130 C 300 145, 270 150, 230 150 L 110 150 C 70 150, 40 145, 40 130 L 35 115 C 30 105, 30 75, 35 65 Z"
                  className="fill-[#1f2937] stroke-[#4b5563]"
                  strokeWidth="2.5"
                />
                {/* Parabrisas */}
                <path d="M 95 42 L 130 50 L 130 130 L 95 138 Z" className="fill-[#111827] stroke-[#4b5563]" strokeWidth="1.5" />
                <path d="M 235 50 L 210 50 L 210 130 L 235 130 Z" className="fill-[#111827] stroke-[#4b5563]" strokeWidth="1.5" />
                {/* Techo */}
                <rect x="135" y="46" width="70" height="88" rx="6" className="fill-[#374151]/50 stroke-[#4b5563]" strokeWidth="1" />
                {/* Ruedas */}
                <rect x="65" y="16" width="34" height="12" rx="3" className="fill-[#090d16] stroke-[#6b7280]" strokeWidth="1.5" />
                <rect x="240" y="16" width="34" height="12" rx="3" className="fill-[#090d16] stroke-[#6b7280]" strokeWidth="1.5" />
                <rect x="65" y="152" width="34" height="12" rx="3" className="fill-[#090d16] stroke-[#6b7280]" strokeWidth="1.5" />
                <rect x="240" y="152" width="34" height="12" rx="3" className="fill-[#090d16] stroke-[#6b7280]" strokeWidth="1.5" />
                {/* Ópticas */}
                <path d="M 40 38 L 52 42 L 48 52 Z" className="fill-[#ffe317]/80" />
                <path d="M 40 142 L 52 138 L 48 128 Z" className="fill-[#ffe317]/80" />
                <path d="M 298 38 L 290 44 L 296 52 Z" className="fill-[#ef4444]" />
                <path d="M 298 142 L 290 136 L 296 128 Z" className="fill-[#ef4444]" />
                {/* Orientación */}
                <text x="50" y="94" className="font-mono text-[9px] fill-[#9ca3af] font-bold tracking-widest uppercase">FRENTE</text>
                <text x="245" y="94" className="font-mono text-[9px] fill-[#9ca3af] font-bold tracking-widest uppercase">ATRÁS</text>
              </svg>

              {/* Hotspots interactivos */}
              {damages.map((d) => {
                const sev = DAMAGE_SEVERITIES.find((s) => s.type === d.damageType) ?? DAMAGE_SEVERITIES[0];
                return (
                  <div
                    key={d.id}
                    style={{ left: `${d.xPercent}%`, top: `${d.yPercent}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group"
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs shadow-lg ring-2 ring-white cursor-pointer ${sev?.colorClass}`}>
                      {sev?.icon}
                    </span>
                    <span className="hidden group-hover:block absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black px-2 py-0.5 rounded text-[10px] font-mono text-white whitespace-nowrap shadow z-30">
                      {d.zone}: {sev?.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Lista de Daños Registrados */}
            {damages.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-[#9ca3af]">Daños preexistentes constatados ({damages.length}):</span>
                <div className="flex flex-wrap gap-2">
                  {damages.map((d) => {
                    const sev = DAMAGE_SEVERITIES.find((s) => s.type === d.damageType);
                    return (
                      <span
                        key={d.id}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1f2937] border border-[#374151] text-xs text-white"
                      >
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${sev?.colorClass}`}>
                          {sev?.icon}
                        </span>
                        <span className="font-mono font-bold">{d.zone}</span>
                        <span className="text-[#9ca3af]">({sev?.label})</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDamagePoint(d.id)}
                          className="text-[#9ca3af] hover:text-[#ef4444] text-sm ml-1"
                          aria-label={`Eliminar daño en ${d.zone}`}
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#9ca3af] italic">
                Sin daños marcados. Haga clic en la silueta o seleccione una zona para agregar constataciones.
              </p>
            )}

            {/* Declaración de Pertenencias */}
            <label className="flex items-start gap-3 p-3 bg-[#1f2937] rounded-lg cursor-pointer border border-[#374151]">
              <input
                type="checkbox"
                checked={declaredBelongings}
                onChange={(e) => setDeclaredBelongings(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#ffe317] rounded cursor-pointer"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Declaración de Pertenencias en Habitáculo</span>
                <span className="text-xs text-[#9ca3af]">
                  El cliente declara no dejar objetos de valor extraordinario y autoriza rodaje técnico con cédula en guantera.
                </span>
              </div>
            </label>
          </div>

          {/* Card 7: Firma Digital de Conformidad */}
          <div className="bg-[#111827] p-5 rounded-xl border border-[#374151] shadow-md flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Firma Digital de Conformidad</span>
                </h2>
                <p className="text-xs text-[#9ca3af]">Captura de firma en pantalla táctil para el acta de recepción.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={clearSignature}
                className="min-h-[40px] px-3 text-xs"
              >
                Limpiar Firma
              </Button>
            </div>

            <div className="border border-[#374151] rounded-lg bg-[#090d16] p-2 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={460}
                height={130}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-[130px] touch-none cursor-crosshair"
                aria-label="Pad de firma digital"
              />
            </div>
            {hasSignature ? (
              <span className="text-xs font-mono text-[#10b981] flex items-center gap-1 font-semibold">
                ✓ Firma de conformidad capturada
              </span>
            ) : (
              <span className="text-xs font-mono text-[#9ca3af]">
                Trace la rúbrica del cliente arriba (opcional para ingreso express)
              </span>
            )}
          </div>
        </div>
      </main>

      {/* Sticky Bottom Action Bar */}
      <aside className="fixed bottom-0 left-0 right-0 z-40 bg-[#111827]/95 backdrop-blur-md border-t border-[#374151] px-4 lg:px-8 py-3.5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase text-[#ffe317] font-bold">Recepción en Curso</span>
              <span className="text-base font-mono font-bold text-white">
                {plateResult.value ? `Vehículo ${plateResult.value}` : "Esperando Patente"}
              </span>
            </div>
            {selectedBayId && (
              <div className="hidden md:flex flex-col border-l border-[#374151] pl-4">
                <span className="text-[10px] font-mono uppercase text-[#9ca3af]">Bahía Derivada</span>
                <span className="text-xs font-mono text-white">
                  Bahía {bays.find((b) => b.id === selectedBayId)?.code || selectedBayId}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {submitError && (
              <p role="alert" className="text-xs text-[#f87171] font-medium max-w-sm truncate">
                {submitError}
              </p>
            )}

            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmitReception()}
              loading={isSubmitting}
              loadingLabel="Generando orden..."
              className="min-h-[48px] px-8 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-bold uppercase tracking-wider shadow-lg flex-1 sm:flex-initial"
            >
              Completar Recepción y Emitir Comprobante
            </Button>
          </div>
        </div>
      </aside>

      {/* Modal / Diálogo de Confirmación de Recepción Exitosa */}
      {createdSummary && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#374151] rounded-2xl max-w-lg w-full p-6 flex flex-col gap-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <span className="p-3 rounded-full bg-[#10b981]/20 text-[#10b981]">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <h3 className="text-xl font-bold text-white">¡Recepción Completada con Éxito!</h3>
                <span className="text-xs font-mono text-[#ffe317] uppercase tracking-wider">
                  Orden de Trabajo Creada
                </span>
              </div>
            </div>

            <div className="bg-[#1f2937] p-4 rounded-xl border border-[#374151] flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">N° de Orden:</span>
                <span className="text-white font-bold">{createdSummary.workOrderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">Patente:</span>
                <span className="text-[#ffe317] font-bold">{createdSummary.licensePlate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">Cliente:</span>
                <span className="text-white">{createdSummary.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">Odómetro Entrada:</span>
                <span className="text-white">{createdSummary.odometerIn.toLocaleString("es-AR")} KM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9ca3af]">Combustible:</span>
                <span className="text-white">{createdSummary.fuelLevel}</span>
              </div>
              {createdSummary.assignedBay && (
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Bahía Asignada:</span>
                  <span className="text-[#10b981] font-bold">Bahía {createdSummary.assignedBay.code}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono text-[#9ca3af]">Enlace Público de Seguimiento para el Cliente:</span>
              <div className="flex items-center gap-2 bg-[#090d16] p-2.5 rounded-lg border border-[#374151]">
                <input
                  type="text"
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}${createdSummary.trackingUrl}`
                      : createdSummary.trackingUrl
                  }
                  className="bg-transparent text-xs font-mono text-white w-full focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="w-full sm:w-auto flex-1 min-h-[48px] font-bold"
              >
                Imprimir Comprobante
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleResetForm}
                className="w-full sm:w-auto flex-1 min-h-[48px] font-bold bg-[#2563eb]"
              >
                Nueva Recepción
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
