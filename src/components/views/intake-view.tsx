"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  User,
  CarFront,
  ClipboardCheck,
  Send,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Radar,
  Phone,
  Camera,
  X,
  Fuel,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlateInput, normalizePlate } from "@/components/ui/plate-input";
import { SectionHeader, FuelGauge, EmptyState } from "@/components/oscar/kit";
import { OscarLogo } from "@/components/oscar/logo";
import { api, ApiClientError } from "@/lib/api-client";
import { FUEL_LEVELS, VISUAL_SYMPTOMS, WORKSHOP } from "@/lib/oscar";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/* ─────────── Normalizador de teléfono → E.164 ─────────── */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && /^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  if (digits.startsWith("54")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 12) return `+54${digits}`;
  return `+${digits}`;
}

const YEARS = Array.from({ length: new Date().getFullYear() + 1 - 1979 }, (_, i) => new Date().getFullYear() + 1 - i);

const VEHICLE_TYPES = [
  { value: "AUTO", label: "Auto" },
  { value: "CAMIONETA", label: "Camioneta" },
  { value: "CAMION", label: "Camión" },
] as const;

interface IntakeForm {
  fullName: string;
  phone: string;
  email: string;
  plate: string;
  vehicleType: string;
  make: string;
  model: string;
  modelYear: string;
  color: string;
  odometer: string;
  fuelLevel: string;
  symptoms: string[];
  complaint: string;
}

const INITIAL: IntakeForm = {
  fullName: "",
  phone: "",
  email: "",
  plate: "",
  vehicleType: "AUTO",
  make: "",
  model: "",
  modelYear: "",
  color: "",
  odometer: "",
  fuelLevel: "MITAD",
  symptoms: [],
  complaint: "",
};

interface Success {
  trackingCode: string;
  orderNumber: string;
}

const STEPS = [
  { id: 1, label: "Tus datos", icon: User },
  { id: 2, label: "Vehículo", icon: CarFront },
  { id: 3, label: "Estado del auto", icon: ClipboardCheck },
  { id: 4, label: "Confirmar", icon: Send },
] as const;

export function IntakeView() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<IntakeForm>(INITIAL);
  const [photos, setPhotos] = useState<{ id: string; name: string; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => photos.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const set = useCallback(<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const plate = useMemo(() => normalizePlate(form.plate), [form.plate]);
  const phoneE164 = useMemo(() => normalizePhone(form.phone), [form.phone]);

  /* ─────────── Validaciones por paso ─────────── */
  const step1Valid =
    form.fullName.trim().length >= 2 &&
    /^\+[1-9][0-9]{7,14}$/.test(phoneE164) &&
    (form.email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()));

  const step2Valid =
    plate.isValid &&
    form.make.trim().length >= 1 &&
    form.model.trim().length >= 1 &&
    form.modelYear !== "" &&
    form.odometer !== "" && Number(form.odometer) >= 0 && Number.isFinite(Number(form.odometer));

  const step3Valid = form.complaint.trim().length >= 5;

  const canNext = step === 1 ? step1Valid : step === 2 ? step2Valid : step === 3 ? step3Valid : true;

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 6 - photos.length)
      .map((f) => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((p) => {
      const target = p.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return p.filter((x) => x.id !== id);
    });
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await api.post<Success>("/api/public/intake", {
        fullName: form.fullName.trim(),
        phoneE164,
        email: form.email.trim() || undefined,
        vehicleType: form.vehicleType,
        licensePlate: plate.value,
        make: form.make.trim(),
        model: form.model.trim(),
        modelYear: Number(form.modelYear),
        odometerAtIntake: Math.round(Number(form.odometer)),
        fuelLevel: form.fuelLevel,
        customerComplaint: form.complaint.trim(),
        visualChecklist: form.symptoms,
      });
      setSuccess(data);
      toast({
        title: "Vehículo ingresado ✔",
        description: `Orden ${data.orderNumber} creada. Guardá tu código de seguimiento.`,
      });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "No pudimos registrar el ingreso. Intentá de nuevo.";
      toast({ title: "No se pudo ingresar el vehículo", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ─────────── Pantalla de éxito ─────────── */
  if (success) {
    const shareText = encodeURIComponent(
      `🛠️ OS-CAR: ingresé mi vehículo al taller. Orden ${success.orderNumber}. Mi código de seguimiento: ${success.trackingCode}`,
    );
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="bevel clip-corner w-full rounded-xl p-8 text-center sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full border border-bay-free/40 bg-bay-free/10">
            <CheckCircle2 className="size-9 text-bay-free" aria-hidden />
          </span>
          <h1 className="display-impact mt-6 text-3xl text-titanium">¡Vehículo ingresado!</h1>
          <p className="mt-2 text-sm text-steel">
            Orden <span className="font-mono font-bold text-oscar-yellow">{success.orderNumber}</span> registrada.
            Con este código seguís la reparación en vivo y aprobás tu presupuesto:
          </p>

          <div className="mx-auto mt-6 max-w-md rounded-lg border border-oscar-yellow/40 bg-carbon-950 p-4">
            <p className="label-tech mb-2">Código de seguimiento</p>
            <p className="select-all break-all rounded-md bg-carbon-900 p-3 font-mono text-sm text-oscar-yellow sm:text-base">
              {success.trackingCode}
            </p>
            <Button
              variant="carbon"
              size="sm"
              className="mt-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(success.trackingCode);
                  setCopied(true);
                  toast({ title: "Código copiado al portapapeles" });
                  setTimeout(() => setCopied(false), 2500);
                } catch {
                  toast({ title: "Copialo manualmente", description: "Seleccioná el texto y copialo." });
                }
              }}
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copiado" : "Copiar código"}
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => navigate({ view: "tracking", code: success.trackingCode })}>
              <Radar className="size-5" aria-hidden />
              Ver seguimiento
            </Button>
            <Button asChild size="lg" variant="carbon">
              <a href={`https://wa.me/${WORKSHOP.phoneE164.replace("+", "")}?text=${shareText}`} target="_blank" rel="noopener noreferrer">
                <Phone className="size-4" aria-hidden />
                Guardar por WhatsApp
              </a>
            </Button>
          </div>
          <button
            onClick={() => {
              setSuccess(null);
              setForm(INITIAL);
              setPhotos([]);
              setStep(1);
            }}
            className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-lead transition-colors hover:text-oscar-yellow"
          >
            Ingresar otro vehículo
          </button>
        </div>
      </div>
    );
  }

  /* ─────────── Wizard ─────────── */
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <SectionHeader
        kicker="Ingreso de vehículo · 5 minutos"
        title="Prepará tu visita al taller"
        icon={CarFront}
        right={
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-lead">
            Paso {step}/4
          </span>
        }
      />

      {/* Stepper */}
      <ol className="mb-8 grid grid-cols-4 gap-1.5" aria-label="Progreso del ingreso">
        {STEPS.map((s) => {
          const state = step > s.id ? "done" : step === s.id ? "current" : "todo";
          return (
            <li key={s.id} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-md border font-mono text-sm font-bold transition-all",
                  state === "done" && "border-bay-free/50 bg-bay-free/10 text-bay-free",
                  state === "current" && "glow-yellow border-oscar-yellow bg-oscar-yellow text-carbon-950",
                  state === "todo" && "border-carbon-700 bg-carbon-900 text-lead",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {state === "done" ? <Check className="size-4" aria-hidden /> : <s.icon className="size-4" aria-hidden />}
              </span>
              <span
                className={cn(
                  "font-mono text-[0.6rem] uppercase tracking-wider",
                  state === "current" ? "text-oscar-yellow" : "text-lead",
                )}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="bevel rounded-xl p-5 sm:p-7">
        {/* PASO 1 — Cliente */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="label-tech">Nombre y apellido *</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => set("fullName", e.target.value)}
                  placeholder="Ej: Roberto Giménez"
                  autoComplete="name"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="label-tech">Teléfono (WhatsApp) *</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="3764 123456"
                  inputMode="tel"
                  autoComplete="tel"
                />
                <p className="font-mono text-[0.62rem] text-lead">
                  {form.phone.trim() === "" ? "Te avisamos por WhatsApp." : `Se registrará: ${phoneE164}`}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="label-tech">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="tucorreo@ejemplo.com"
                autoComplete="email"
                maxLength={254}
              />
            </div>
          </div>
        )}

        {/* PASO 2 — Vehículo */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <PlateInput value={form.plate} onChange={(r) => set("plate", r.value)} label="Patente *" />
              <div className="space-y-2">
                <Label className="label-tech">Tipo de vehículo *</Label>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo de vehículo">
                  {VEHICLE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={form.vehicleType === t.value}
                      onClick={() => set("vehicleType", t.value)}
                      className={cn(
                        "min-h-11 rounded-md border font-display text-sm font-bold uppercase tracking-wide transition-all",
                        form.vehicleType === t.value
                          ? "border-oscar-yellow bg-oscar-yellow/10 text-oscar-yellow"
                          : "border-carbon-700 text-steel hover:border-carbon-600 hover:bg-carbon-800",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="make" className="label-tech">Marca *</Label>
                <Input id="make" value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Ej: Toyota" maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model" className="label-tech">Modelo *</Label>
                <Input id="model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Ej: Hilux 2.8 TD" maxLength={80} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="modelYear" className="label-tech">Año *</Label>
                <select
                  id="modelYear"
                  value={form.modelYear}
                  onChange={(e) => set("modelYear", e.target.value)}
                  className="h-11 w-full rounded-md border border-carbon-800 bg-carbon-950/70 px-3 text-sm text-titanium shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] outline-none focus-visible:border-oscar-yellow/70"
                >
                  <option value="">Seleccionar…</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color" className="label-tech">Color</Label>
                <Input id="color" value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Ej: Blanco" maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="odometer" className="label-tech">Kilometraje actual *</Label>
                <Input
                  id="odometer"
                  value={form.odometer}
                  onChange={(e) => set("odometer", e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="Ej: 118400"
                  inputMode="numeric"
                />
                <p className="font-mono text-[0.62rem] text-lead">{Number(form.odometer || 0).toLocaleString("es-AR")} km</p>
              </div>
            </div>
          </div>
        )}

        {/* PASO 3 — Estado del auto */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Combustible */}
            <div className="space-y-2">
              <Label className="label-tech flex items-center gap-1.5">
                <Fuel className="size-3.5" aria-hidden /> Nivel de combustible al ingreso *
              </Label>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Nivel de combustible">
                {FUEL_LEVELS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={form.fuelLevel === f.value}
                    onClick={() => set("fuelLevel", f.value)}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-md border px-3.5 transition-all",
                      form.fuelLevel === f.value
                        ? "border-oscar-yellow bg-oscar-yellow/10"
                        : "border-carbon-700 hover:border-carbon-600 hover:bg-carbon-800",
                    )}
                  >
                    <FuelGauge level={f.value} />
                    <span className={cn("font-mono text-xs font-bold", form.fuelLevel === f.value ? "text-oscar-yellow" : "text-steel")}>
                      {f.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist visual */}
            <div className="space-y-2">
              <Label className="label-tech">Checklist visual — ¿qué notás? (marcá todo lo que aplique)</Label>
              <div className="flex flex-wrap gap-2">
                {VISUAL_SYMPTOMS.map((s) => {
                  const active = form.symptoms.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        set(
                          "symptoms",
                          active ? form.symptoms.filter((x) => x !== s.id) : [...form.symptoms, s.id],
                        )
                      }
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md border px-3.5 text-sm transition-all",
                        active
                          ? "border-oscar-yellow/60 bg-oscar-yellow/10 text-oscar-yellow"
                          : "border-carbon-700 text-steel hover:border-carbon-600 hover:bg-carbon-800",
                      )}
                    >
                      <s.icon className="size-4" aria-hidden />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Relato */}
            <div className="space-y-2">
              <Label htmlFor="complaint" className="label-tech">Contanos qué le pasa al auto *</Label>
              <Textarea
                id="complaint"
                value={form.complaint}
                onChange={(e) => set("complaint", e.target.value)}
                placeholder="Ej: Vibrión al andar en ruta por encima de 80 km/h y hace un ruido metálico al frenar…"
                rows={4}
                maxLength={2000}
                className="min-h-[110px] bg-carbon-950/70"
              />
              <p className="font-mono text-[0.62rem] text-lead">{form.complaint.trim().length}/2000 · mínimo 5 caracteres</p>
            </div>

            {/* Fotos */}
            <div className="space-y-2">
              <Label className="label-tech flex items-center gap-1.5">
                <Camera className="size-3.5" aria-hidden /> Fotos del problema (opcional)
              </Label>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {photos.map((p) => (
                  <figure key={p.id} className="group relative aspect-square overflow-hidden rounded-md border border-carbon-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Foto subida: ${p.name}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-sm bg-carbon-950/80 text-steel opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Quitar ${p.name}`}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </figure>
                ))}
                {photos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="grid aspect-square place-items-center rounded-md border border-dashed border-carbon-700 text-lead transition-colors hover:border-oscar-yellow/50 hover:text-oscar-yellow"
                  >
                    <span className="flex flex-col items-center gap-1 font-mono text-[0.6rem] uppercase tracking-widest">
                      <Camera className="size-5" aria-hidden />
                      {photos.length === 0 ? "Agregar" : "+1 más"}
                    </span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} aria-label="Subir fotos del vehículo" />
              <p className="font-mono text-[0.62rem] text-lead">
                Las fotos se asocian a tu ingreso en la pericia de recepción (hasta 6).
              </p>
            </div>
          </div>
        )}

        {/* PASO 4 — Confirmación */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-carbon-800 bg-carbon-950/50 p-4">
                <p className="label-tech mb-2 flex items-center gap-1.5"><User className="size-3" aria-hidden /> Cliente</p>
                <p className="text-sm text-titanium">{form.fullName.trim()}</p>
                <p className="font-mono text-xs text-steel">{phoneE164}</p>
                {form.email.trim() && <p className="font-mono text-xs text-steel">{form.email.trim()}</p>}
              </div>
              <div className="rounded-md border border-carbon-800 bg-carbon-950/50 p-4">
                <p className="label-tech mb-2 flex items-center gap-1.5"><CarFront className="size-3" aria-hidden /> Vehículo</p>
                <p className="text-sm text-titanium">
                  {form.make.trim()} {form.model.trim()} {form.modelYear && `· ${form.modelYear}`}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="plate-mercosur inline-flex items-center px-2 py-0.5 font-mono text-xs font-bold">{plate.value}</span>
                  <span className="font-mono text-xs text-steel">{Number(form.odometer || 0).toLocaleString("es-AR")} km</span>
                </div>
              </div>
            </div>
            <div className="rounded-md border border-carbon-800 bg-carbon-950/50 p-4">
              <p className="label-tech mb-2">Reporte de ingreso</p>
              <p className="text-sm leading-relaxed text-steel">{form.complaint.trim()}</p>
              {form.symptoms.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {form.symptoms.map((id) => {
                    const s = VISUAL_SYMPTOMS.find((x) => x.id === id);
                    return s ? (
                      <li key={id} className="rounded border border-oscar-yellow/30 bg-oscar-yellow/5 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider text-oscar-yellow">
                        {s.label}
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
              {photos.length > 0 && <p className="mt-3 font-mono text-[0.62rem] text-lead">{photos.length} foto(s) para la pericia de recepción.</p>}
            </div>
            <div className="flex items-start gap-2.5 rounded-md border border-oscar-yellow/25 bg-oscar-yellow/5 p-3.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-oscar-yellow" aria-hidden />
              <p className="text-xs leading-relaxed text-steel">
                Al confirmar, el mostrador de recepción genera tu <strong className="text-titanium">orden de trabajo</strong> y un
                código de seguimiento para ver el avance en vivo y aprobar el presupuesto desde tu celular.
              </p>
            </div>
          </div>
        )}

        {/* Controles */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-carbon-800 pt-5">
          <Button variant="carbon" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ChevronLeft className="size-4" aria-hidden />
            Atrás
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} size="touch">
              Continuar
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} size="touch">
              <Send className="size-4" aria-hidden />
              {submitting ? "Enviando…" : "Confirmar ingreso"}
            </Button>
          )}
        </div>
        {step === 1 && !step1Valid && form.fullName !== "" && (
          <p className="mt-3 text-center font-mono text-[0.62rem] uppercase tracking-widest text-oscar-red/80">
            Completá nombre y teléfono válido para continuar
          </p>
        )}
      </div>
    </div>
  );
}
