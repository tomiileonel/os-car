/**
 * OS-CAR — Dominio compartido del taller.
 * Metadatos de estados, formatters es-AR y constantes de marca.
 */
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  SearchCheck,
  Hourglass,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  XCircle,
  CarFront,
  Gauge,
  Droplets,
  BatteryWarning,
  Braces,
} from "lucide-react";

/* ─────────────────────────── Marca / Taller ─────────────────────────── */

export const WORKSHOP = {
  name: "Taller Mecánico OS-CAR",
  address: "Flor de Ceibo 1295 · Barrio Itaembé · Posadas (Guazú)",
  phoneDisplay: "+54 3764-353566",
  phoneE164: "+543764353566",
  hours: "Lun a Vie 7:30–12:30 / 15:30–19:30 · Sáb 8:00–12:00",
  get whatsappUrl() {
    return `https://wa.me/${this.phoneE164.replace("+", "")}?text=${encodeURIComponent(
      "Hola OS-CAR 👋 Necesito ayuda con mi vehículo.",
    )}`;
  },
} as const;

/* ─────────────────────────── Estados de orden ─────────────────────────── */

export type OrderStatus =
  | "INGRESADO"
  | "DIAGNOSTICO"
  | "ESPERANDO_REPARACION"
  | "EN_REPARACION"
  | "CONTROL"
  | "LISTO"
  | "ENTREGADO"
  | "CANCELADA";

export interface StatusMeta {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Clases tailwind para el badge-indicador */
  tone: string;
  /** Color base del LED */
  led: string;
  step: number; // posición en el riel de progreso (-1 = fuera del flujo)
}

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
];

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  INGRESADO: {
    label: "Ingresado",
    short: "ING",
    icon: ClipboardList,
    tone: "bg-carbon-800 text-steel border-carbon-700",
    led: "led led-off",
    step: 0,
  },
  DIAGNOSTICO: {
    label: "En diagnóstico",
    short: "DIA",
    icon: SearchCheck,
    tone: "bg-carbon-800 text-oscar-yellow border-oscar-yellow/40",
    led: "led led-yellow",
    step: 1,
  },
  ESPERANDO_REPARACION: {
    label: "Esperando reparación",
    short: "ESP",
    icon: Hourglass,
    tone: "bg-oscar-yellow/10 text-oscar-yellow border-oscar-yellow/50",
    led: "led led-yellow",
    step: 2,
  },
  EN_REPARACION: {
    label: "En reparación",
    short: "REP",
    icon: Wrench,
    tone: "bg-oscar-yellow text-carbon-950 border-oscar-yellow",
    led: "led led-yellow",
    step: 3,
  },
  CONTROL: {
    label: "Control de calidad",
    short: "CTL",
    icon: ShieldCheck,
    tone: "bg-bay-test/10 text-bay-test border-bay-test/40",
    led: "led led-cyan",
    step: 4,
  },
  LISTO: {
    label: "Listo para entrega",
    short: "LST",
    icon: CheckCircle2,
    tone: "bg-bay-free/10 text-bay-free border-bay-free/40",
    led: "led led-green",
    step: 5,
  },
  ENTREGADO: {
    label: "Entregado",
    short: "ENT",
    icon: KeyRound,
    tone: "bg-carbon-800 text-steel border-carbon-700",
    led: "led led-off",
    step: 6,
  },
  CANCELADA: {
    label: "Cancelada",
    short: "CAN",
    icon: XCircle,
    tone: "bg-oscar-red/15 text-oscar-red border-oscar-red/50",
    led: "led led-red",
    step: -1,
  },
};

/** Transiciones permitidas por el workflow del taller. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  INGRESADO: ["DIAGNOSTICO", "CANCELADA"],
  DIAGNOSTICO: ["ESPERANDO_REPARACION", "EN_REPARACION", "CANCELADA"],
  ESPERANDO_REPARACION: ["EN_REPARACION", "CANCELADA"],
  EN_REPARACION: ["CONTROL", "CANCELADA"],
  CONTROL: ["LISTO", "EN_REPARACION"],
  LISTO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADA: [],
};

export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  INGRESO: "Vehículo ingresado",
  DIAGNOSTICO_INICIADO: "Diagnóstico iniciado",
  DIAGNOSTICO_FINALIZADO: "Diagnóstico completado",
  PRESUPUESTO_PUBLICADO: "Presupuesto publicado",
  PRESUPUESTO_APROBADO: "Presupuesto aprobado",
  PRESUPUESTO_RECHAZADO: "Presupuesto rechazado",
  APROBACION_CLIENTE_WEB: "Aprobación del cliente (web)",
  TRABAJO_AGREGADO: "Trabajo agregado",
  TRABAJO_INICIADO: "Reparación iniciada",
  TRABAJO_FINALIZADO: "Reparación finalizada",
  REPUESTO_SOLICITADO: "Repuesto solicitado",
  REPUESTO_CONSEGUIDO: "Repuesto conseguido",
  REPUESTO_INSTALADO: "Repuesto instalado",
  BLOQUEO_ACTIVADO: "Bloqueo activado",
  BLOQUEO_RESUELTO: "Bloqueo resuelto",
  BAHIA_ASIGNADA: "Bahía asignada",
  BAHIA_REASIGNADA: "Bahía reasignada",
  BAHIA_LIBERADA: "Bahía liberada",
  CONTROL_INICIADO: "Control de calidad",
  CONTROL_APROBADO: "Control aprobado",
  CONTROL_OBSERVADO: "Control con observaciones",
  LISTO_PARA_ENTREGA: "Listo para entrega",
  ENTREGA_REALIZADA: "Vehículo entregado",
  ORDEN_CANCELADA: "Orden cancelada",
  OTRO: "Evento",
};

/* ─────────────────────────── Bloqueos ─────────────────────────── */

export const BLOCKER_LABELS: Record<string, string> = {
  APROBACION_PRESUPUESTO: "Aprobación de presupuesto",
  REPUESTO_PENDIENTE: "Repuesto pendiente",
  AUTORIZACION_TRABAJO_ADICIONAL: "Autorización de trabajo adicional",
  CONTROL_CALIDAD_RECHAZADO: "Control de calidad rechazado",
  CAPACIDAD_TALLER: "Capacidad del taller",
  DOCUMENTACION_VEHICULO: "Documentación del vehículo",
  ESPERA_DECISION_CLIENTE: "Espera decisión del cliente",
  PAGO_PENDIENTE: "Pago pendiente",
  OTRO: "Otro",
};

/* ─────────────────────────── Síntomas visuales ─────────────────────────── */

export interface VisualSymptom {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const VISUAL_SYMPTOMS: VisualSymptom[] = [
  { id: "check-engine", label: "Testigo Check Engine", icon: Gauge },
  { id: "sobrecalentamiento", label: "Sobrecalentamiento", icon: Droplets },
  { id: "bateria", label: "Batería / No arranca", icon: BatteryWarning },
  { id: "ruido-frenos", label: "Ruido al frenar", icon: Braces },
  { id: "vibracion", label: "Vibración en ruta", icon: CarFront },
  { id: "perdida-aceite", label: "Pérdida de aceite", icon: Droplets },
  { id: "humo", label: "Humo del escape", icon: CarFront },
  { id: "suspension", label: "Ruido en suspensión", icon: Braces },
];

export const FUEL_LEVELS = [
  { value: "VACIO", label: "Vacío", bars: 0 },
  { value: "CUARTO", label: "1/4", bars: 1 },
  { value: "MITAD", label: "1/2", bars: 2 },
  { value: "TRES_CUARTOS", label: "3/4", bars: 3 },
  { value: "LLENO", label: "Lleno", bars: 4 },
] as const;

export type FuelLevel = (typeof FUEL_LEVELS)[number]["value"];

/* ─────────────────────────── Neumáticos ─────────────────────────── */

export const TIRE_CONDITION_META: Record<string, { label: string; tone: string; bar: string }> = {
  OPTIMO: { label: "Óptimo", tone: "text-bay-free border-bay-free/40 bg-bay-free/10", bar: "bg-bay-free" },
  SUGERIR_REEMPLAZO: { label: "Sugerir reemplazo", tone: "text-oscar-yellow border-oscar-yellow/40 bg-oscar-yellow/10", bar: "bg-oscar-yellow" },
  CRITICO: { label: "Crítico", tone: "text-oscar-red border-oscar-red/40 bg-oscar-red/10", bar: "bg-oscar-red" },
  DANADO: { label: "Dañado", tone: "text-oscar-red border-oscar-red/40 bg-oscar-red/10", bar: "bg-oscar-red" },
};

export const WHEEL_POSITION_LABELS: Record<string, string> = {
  DEL_IZQ: "Del. izq.",
  DEL_DER: "Del. der.",
  TRAS_IZQ: "Tras. izq.",
  TRAS_DER: "Tras. der.",
};

/** Profundidad de dibujo → color de barra (mm). Mínimo legal VTV: 1,6mm. */
export function treadTone(mm: number): string {
  if (mm < 3) return "bg-oscar-red";
  if (mm < 4.5) return "bg-oscar-yellow";
  return "bg-bay-free";
}

/* ─────────────────────────── Formatters ─────────────────────────── */

const arsFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function money(value: number | null | undefined): string {
  return arsFmt.format(Math.round(value ?? 0));
}

export function minutes(m: number | null | undefined): string {
  const v = m ?? 0;
  if (v < 60) return `${v} min`;
  const h = Math.floor(v / 60);
  const r = v % 60;
  return r === 0 ? `${h} h` : `${h}h ${r}m`;
}

export function elapsedSince(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const dtFmt = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dFmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const tFmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

export function dateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return dtFmt.format(new Date(date));
}
export function dateOnly(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return dFmt.format(new Date(date));
}
export function timeOnly(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return tFmt.format(new Date(date));
}

/** Formato patente para display: AA123BB → AA 123 BB si es Mercosur nuevo. */
export function formatPlateDisplay(normalized: string): string {
  const m = normalized.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : normalized;
}

/* ─────────────────────────── Tipos de API ─────────────────────────── */

export interface AdminSession {
  id: string;
  displayName: string;
  role: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  plate: string;
  vehicle: string;
  customer: string;
  bayCode?: string | null;
  openedAt: string;
  totalEstimated: number;
}

export interface BudgetLineBase {
  id: string;
  description: string;
  isApproved: boolean;
  lineTotal: number;
}
export interface BudgetLaborLineDTO extends BudgetLineBase {
  estimatedMinutes: number;
}
export interface BudgetPartLineDTO extends BudgetLineBase {
  quantity: number;
  unitPrice: number;
  partNumber?: string | null;
}
export interface TrackingBudgetDTO {
  status: "PENDIENTE_APROBACION" | "APROBADO" | "RECHAZADO" | "BORRADOR" | "SUPERSEDED";
  versionNumber: number;
  subtotalLabor: number;
  subtotalParts: number;
  total: number;
  laborLines: BudgetLaborLineDTO[];
  partLines: BudgetPartLineDTO[];
}
export interface TrackingTimelineEvent {
  at: string;
  eventType: string;
  title: string;
  description: string;
  actor?: string | null;
}
export interface TrackingBlockerDTO {
  type: string;
  reason: string;
}
export interface TrackingSnapshot {
  order: {
    orderNumber: string;
    status: OrderStatus;
    openedAt: string;
    updatedAt: string;
    vehicle: { plate: string; make?: string; model?: string; color?: string; type?: string };
    customerFirstName: string;
  };
  timeline: TrackingTimelineEvent[];
  budget: TrackingBudgetDTO | null;
  blockers: TrackingBlockerDTO[];
}

export const PUBLIC_STATS_STALE_MS = 60_000;
