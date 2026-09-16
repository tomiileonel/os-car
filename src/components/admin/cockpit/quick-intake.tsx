"use client";

/**
 * OS-CAR Cockpit — INGRESO EXPRESS EN 3 PASOS.
 * 1) Patente (con precarga de vehículos existentes) → 2) Síntoma + cliente →
 * 3) Asignar bahía o dejar en fila. Un clic por paso, cero fricción de mostrador.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Fuel,
  Gauge,
  Loader2,
  Search,
  UserRound,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlateInput, normalizePlate } from "@/components/ui/plate-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlateBadge } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import { FUEL_LEVELS, VISUAL_SYMPTOMS } from "@/lib/oscar";
import {
  bayLed,
  BAY_KIND_LABELS,
  normalizePhone,
  type BayDTO,
  type IntakePrefill,
  type SearchDTO,
} from "@/components/admin/cockpit/shared";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, title: "Vehículo", icon: CarFront, hint: "Patente" },
  { n: 2, title: "Cliente y síntoma", icon: ClipboardList, hint: "Falla" },
  { n: 3, title: "Bahía", icon: Gauge, hint: "Asignar" },
] as const;

const VEHICLE_TYPES = [
  { value: "AUTO", label: "Auto" },
  { value: "CAMIONETA", label: "Camioneta" },
  { value: "CAMION", label: "Camión" },
] as const;

export interface QuickIntakeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: IntakePrefill | null;
  bays: BayDTO[];
  onDone: (orderId: string, orderNumber: string) => void;
}

/**
 * Cuerpo del wizard — monta fresco en cada apertura (Radix desmonta el
 * contenido al cerrar), por lo que el estado se inicializa desde el prefill.
 */
function QuickIntakeBody({
  prefill,
  bays,
  onDone,
  onOpenChange,
}: Omit<QuickIntakeProps, "open" | "onOpenChange"> & { onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [plate, setPlate] = useState(prefill?.plate ?? "");
  const [fullName, setFullName] = useState(prefill?.fullName ?? "");
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [make, setMake] = useState(prefill?.make ?? "");
  const [model, setModel] = useState(prefill?.model ?? "");
  const [vehicleType, setVehicleType] = useState<string>("AUTO");
  const [odometer, setOdometer] = useState("");
  const [fuel, setFuel] = useState<string>("MITAD");
  const [complaint, setComplaint] = useState("");
  const [bayId, setBayId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const plateRes = useMemo(() => normalizePlate(plate), [plate]);
  const phoneE164 = useMemo(() => normalizePhone(phone), [phone]);

  /* Precarga de vehículos existentes mientras se tipea la patente. */
  const plateQuery = plateRes.value.length >= 2 ? plateRes.value : "";
  const { data: matches } = useQuery({
    queryKey: ["admin-search", plateQuery],
    queryFn: () => api.get<SearchDTO>(`/api/admin/search?q=${encodeURIComponent(plateQuery)}`),
    enabled: plateQuery.length >= 2,
    staleTime: 10_000,
  });

  const freeBays = bays.filter((b) => !b.current);

  const step1Valid = plateRes.isValid && make.trim().length >= 1 && model.trim().length >= 1;
  const step2Valid =
    fullName.trim().length >= 2 &&
    /^\+[1-9][0-9]{7,14}$/.test(phoneE164) &&
    odometer !== "" &&
    complaint.trim().length >= 5;

  function applyVehicleMatch(v: SearchDTO["vehicles"][number]): void {
    setPlate(v.plate);
    const [mk, ...rest] = v.label.split(" ");
    setMake(mk ?? "");
    setModel(rest.join(" ") || "");
    setFullName(v.customerName);
    toast({ title: "Vehículo precargado", description: `${v.plate} — ${v.label}` });
  }

  function appendSymptom(label: string): void {
    setComplaint((c) => (c.trim().length === 0 ? label : c.trim().endsWith(".") ? `${c.trim()} ${label}.` : `${c.trim()}. ${label}.`));
  }

  async function submit(): Promise<void> {
    if (!step1Valid || !step2Valid || submitting) return;
    setSubmitting(true);
    try {
      const data = await api.post<{ id: string; orderNumber: string }>("/api/admin/orders", {
        customer: { fullName: fullName.trim(), phoneE164 },
        vehicle: { licensePlate: plateRes.value, make: make.trim(), model: model.trim(), vehicleType },
        customerComplaint: complaint.trim(),
        odometerAtIntake: Math.round(Number(odometer)),
        fuelLevel: fuel,
        bayId: bayId || undefined,
      });
      toast({
        title: `Orden ${data.orderNumber} generada ✔`,
        description: bayId ? "Vehículo posicionado en bahía." : "Vehículo en fila de recepción.",
      });
      onDone(data.id, data.orderNumber);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "No se pudo generar la orden",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Riel de pasos */}
      <ol className="flex items-center gap-1 border-b border-carbon-800 bg-carbon-950/50 px-5 py-3" aria-label="Progreso del ingreso">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n} className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md border font-mono text-xs font-bold transition-all",
                    done
                      ? "border-bay-free/50 bg-bay-free/10 text-bay-free"
                      : active
                        ? "border-oscar-yellow bg-oscar-yellow text-carbon-950"
                        : "border-carbon-700 text-lead",
                  )}
                >
                  {done ? <CheckCircle2 className="size-4" aria-hidden /> : s.n}
                </span>
                <span className={cn("min-w-0 leading-tight", active ? "text-titanium" : "text-lead")}>
                  <span className="block truncate font-display text-xs font-bold uppercase tracking-wide">{s.title}</span>
                  <span className="hidden font-mono text-[0.55rem] uppercase tracking-widest text-carbon-600 sm:block">{s.hint}</span>
                </span>
                {i < STEPS.length - 1 && <span className={cn("mx-1 h-px flex-1", done ? "bg-bay-free/40" : "bg-carbon-800")} aria-hidden />}
              </li>
            );
          })}
        </ol>

        <div className="px-5 py-5">
          {/* ═══ PASO 1 · Vehículo ═══ */}
          {step === 1 && (
            <div className="space-y-4">
              <PlateInput
                value={plate}
                onChange={(r) => setPlate(r.value)}
                label="Patente (Mercosur / tradicional)"
                showValidation
              />

              {matches && matches.vehicles.length > 0 && (
                <div className="rounded-md border border-oscar-yellow/30 bg-oscar-yellow/5 p-3">
                  <p className="label-tech mb-2 flex items-center gap-1.5">
                    <Search className="size-3" aria-hidden /> Vehículos existentes — tocá para precargar
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {matches.vehicles.slice(0, 4).map((v) => (
                      <button
                        key={v.id}
                        onClick={() => applyVehicleMatch(v)}
                        className="flex items-center gap-2 rounded-md border border-carbon-700 bg-carbon-950/70 px-2.5 py-1.5 transition-colors hover:border-oscar-yellow/60"
                      >
                        <PlateBadge plate={v.plate} size="sm" />
                        <span className="max-w-44 truncate text-xs text-steel">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="label-tech">Marca *</Label>
                  <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" maxLength={80} />
                </div>
                <div className="space-y-1.5">
                  <Label className="label-tech">Modelo *</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Hilux 2.8" maxLength={80} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="label-tech">Tipo</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger className="h-11 bg-carbon-950/70"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-carbon-700 bg-carbon-850">
                      {VEHICLE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ═══ PASO 2 · Cliente y síntoma ═══ */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-carbon-800 bg-carbon-950/60 p-3">
                <PlateBadge plate={plateRes.value} size="md" />
                <p className="min-w-0 flex-1 truncate text-sm text-steel">
                  {make} {model} <span className="text-lead">· {vehicleType}</span>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="label-tech flex items-center gap-1.5"><UserRound className="size-3" aria-hidden /> Cliente *</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellido" maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label className="label-tech">WhatsApp / Teléfono *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 3764 …" inputMode="tel" />
                  {phone.trim().length > 2 && !/^\+[1-9][0-9]{7,14}$/.test(phoneE164) && (
                    <p className="font-mono text-[0.65rem] text-oscar-yellow">Se normalizará a {phoneE164}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="label-tech flex items-center gap-1.5"><Gauge className="size-3" aria-hidden /> Odómetro *</Label>
                  <Input
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder="128500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="label-tech flex items-center gap-1.5"><Fuel className="size-3" aria-hidden /> Combustible</Label>
                  <Select value={fuel} onValueChange={setFuel}>
                    <SelectTrigger className="h-11 bg-carbon-950/70"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-carbon-700 bg-carbon-850">
                      {FUEL_LEVELS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="label-tech">Síntoma reportado *</Label>
                <Textarea
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  rows={2}
                  placeholder="Ej: Ruido al frenar en frío, vibra el pedal…"
                  className="bg-carbon-950/70"
                  maxLength={500}
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {VISUAL_SYMPTOMS.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => appendSymptom(s.label)}
                      className="rounded border border-carbon-700 bg-carbon-950/60 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wide text-steel transition-colors hover:border-oscar-yellow/50 hover:text-oscar-yellow"
                    >
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ PASO 3 · Bahía ═══ */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-md border border-carbon-800 bg-carbon-950/60 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PlateBadge plate={plateRes.value} size="md" />
                  <span className="font-mono text-[0.65rem] text-lead">
                    {fullName} · {make} {model}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-steel">“{complaint.trim()}”</p>
              </div>

              <div>
                <p className="label-tech mb-2">Destino inmediato — tocá una bahía libre</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => setBayId("")}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-md border p-3 transition-all",
                      bayId === ""
                        ? "border-oscar-yellow bg-oscar-yellow/10 text-oscar-yellow"
                        : "border-carbon-700 text-steel hover:border-steel/40",
                    )}
                    aria-pressed={bayId === ""}
                  >
                    <ClipboardList className="size-5" aria-hidden />
                    <span className="font-display text-xs font-bold uppercase tracking-wide">Dejar en fila</span>
                    <span className="font-mono text-[0.55rem] text-lead">sin bahía</span>
                  </button>
                  {freeBays.map((bay) => {
                    const led = bayLed(bay);
                    return (
                      <button
                        key={bay.id}
                        onClick={() => setBayId(bay.id)}
                        className={cn(
                          "flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-md border p-3 transition-all",
                          bayId === bay.id
                            ? "border-oscar-yellow bg-oscar-yellow/10 text-oscar-yellow"
                            : "border-carbon-700 text-steel hover:border-steel/40",
                        )}
                        aria-pressed={bayId === bay.id}
                      >
                        <span className="font-display text-base font-bold">{bay.code}</span>
                        <span className="font-mono text-[0.55rem] uppercase tracking-wider text-lead">
                          {BAY_KIND_LABELS[bay.kind] ?? bay.kind}
                        </span>
                        <span className={led.led} aria-hidden />
                      </button>
                    );
                  })}
                </div>
                {freeBays.length === 0 && (
                  <p className="mt-2 flex items-center gap-2 rounded-md border border-oscar-red/40 bg-oscar-red/10 p-2.5 font-mono text-[0.62rem] text-oscar-red">
                    Taller a plena capacidad — el vehículo quedará en fila de recepción.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie de navegación */}
        <div className="flex items-center gap-2 border-t border-carbon-800 bg-carbon-950/50 px-5 py-3.5">
          {step > 1 && (
            <Button variant="carbon" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              <ArrowLeft className="size-4" aria-hidden /> Volver
            </Button>
          )}
          <span className="ml-auto font-mono text-[0.6rem] uppercase tracking-[0.2em] text-carbon-600">
            paso {step}/3
          </span>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}>
              Continuar <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!step1Valid || !step2Valid || submitting} size="lg">
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Zap className="size-4" aria-hidden />}
              {submitting ? "Generando…" : "Generar orden"}
            </Button>
          )}
        </div>
    </>
  );
}

/** Wrapper del dialog — el cuerpo monta fresco en cada apertura. */
export function QuickIntakeDialog({ open, onOpenChange, prefill, bays, onDone }: QuickIntakeProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-carbon-700 bg-carbon-900 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-carbon-800 px-5 pb-4 pt-5">
          <DialogTitle className="display-impact flex items-center gap-2 text-xl text-titanium">
            <Zap className="size-5 text-oscar-yellow" aria-hidden /> Ingreso Express
          </DialogTitle>
          <DialogDescription>Alta del vehículo en 3 pasos táctiles — patente, síntoma y bahía.</DialogDescription>
        </DialogHeader>
        {open && <QuickIntakeBody prefill={prefill} bays={bays} onDone={onDone} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
