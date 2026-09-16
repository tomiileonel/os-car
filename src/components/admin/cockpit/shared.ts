"use client";

/**
 * OS-CAR Cockpit — Contratos compartidos del Centro de Mando Unificado.
 * Todos los DTOs replican EXACTAMENTE el shape verificado de la API v1
 * (ver worklog: /api/admin/*) — no se altera ninguna firma de datos.
 */
import type { LucideIcon } from "lucide-react";
import { UserCog, Wrench } from "lucide-react";
import type { OrderStatus } from "@/lib/oscar";
import { ORDER_TRANSITIONS } from "@/lib/oscar";

/* ─────────────────────────── DTOs de la API ─────────────────────────── */

export interface OverviewDTO {
  ordersByStatus: Record<string, number>;
  todayIntakes: number;
  bayOccupancy: { total: number; occupied: number };
  lowStockCount: number;
  pendingApprovals: number;
  avgCycleHours: number | null;
  revenueMTD: number | null;
}

export interface BayCurrentDTO {
  orderId: string;
  orderNumber: string;
  plate: string;
  vehicle: string;
  mechanic: string | null;
  status: OrderStatus;
  assignedAt: string;
  estimatedMinutes: number;
  elapsedMinutes: number;
}

export interface BayDTO {
  id: string;
  code: string;
  kind: string;
  status: string;
  current: BayCurrentDTO | null;
}

export interface OrderRowDTO {
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

export interface WorkItemDTO {
  id: string;
  description: string;
  estimatedMinutes: number;
  actualMinutes: number;
  hourlyRateCharged: number;
  internalCostAmount: number | null;
  status: string;
  isAdditional: boolean;
  assignedTo: string | null;
}

export interface PartItemDTO {
  id: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  unitPriceCharged: number;
  status: string;
  partNumber: string | null;
  inventoryItemId?: string | null;
}

export interface OrderDetailDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  openedAt: string;
  customer: { id: string; fullName: string; phoneE164: string; email: string | null };
  vehicle: {
    id: string;
    plate: string;
    make: string;
    model: string;
    modelYear: number | null;
    color: string | null;
    vehicleType: string;
  };
  intake: { odometerAtIntake: number; fuelLevel: string; customerComplaint: string; visualChecklist: string[] } | null;
  bay: { code: string; since: string } | null;
  workItems: WorkItemDTO[];
  partItems: PartItemDTO[];
  budget: {
    status: string;
    versionNumber: number;
    subtotalLabor: number;
    subtotalParts: number;
    totalEstimated: number;
    publishedAt: string | null;
    approvedAt: string | null;
    laborLines: { id: string; description: string; estimatedMinutes: number; lineTotal: number; isApproved: boolean }[];
    partLines: { id: string; description: string; quantity: number; unitPrice: number; lineTotal: number; isApproved: boolean }[];
    approvals: { actorType: string; decision: string; decidedAt: string }[];
  } | null;
  history: { at: string; eventType: string; description: string; actor: string | null }[];
  blockers: { type: string; reason: string }[];
  totals: { laborSubtotal: number; partsSubtotal: number; totalEstimated: number; internalCost: number; margin: number };
}

export interface InventoryItemDTO {
  id: string;
  sku: string;
  description: string;
  category: string | null;
  location: string | null;
  unitCost: number | null;
  stockQuantity: number;
  reorderPoint: number;
  critical: boolean;
}

export interface InventoryDTO {
  items: InventoryItemDTO[];
}

export interface TireItemDTO {
  wheelPosition: string;
  treadDepthMm: number;
  condition: string;
}

export interface TireSetDTO {
  id: string;
  plate: string;
  vehicle: string;
  customer: string;
  brand: string;
  size: string;
  season: string;
  status: string;
  rack: string;
  level: string;
  position: string;
  notes: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  tires: TireItemDTO[];
}

export interface TelemetryDTO {
  outbox: { byStatus: Record<string, number>; total: number; avgAttempts: number; avgLatencyMs: number };
  cycleTimes: { day: string; avgHours: number; orders: number }[];
  approvals: { approved: number; rejected: number; pending: number; approvalRate: number };
  dbLatencyMs: number;
  eventStream: { at: string; eventType: string; status: string; attempts: number; lastError?: string | null }[];
}

export interface SearchDTO {
  customers: { id: string; fullName: string; phone: string }[];
  vehicles: { id: string; plate: string; label: string; customerName: string }[];
  orders: { id: string; orderNumber: string; plate: string; status: OrderStatus }[];
}

export interface MechanicsDTO {
  mechanics: { id: string; displayName: string; role: string }[];
}

export interface OrdersListDTO {
  items: OrderRowDTO[];
  total: number;
}

/* ─────────────────────────── Roles / perspectivas ─────────────────────────── */

export type CockpitRole = "jefe" | "piso";

export const ROLE_META: Record<CockpitRole, { title: string; sub: string; icon: LucideIcon }> = {
  jefe: { title: "Jefe de Taller", sub: "Visión macro · márgenes · outbox", icon: UserCog },
  piso: { title: "Mecánico", sub: "Foco en bahías · checklist · repuestos", icon: Wrench },
};

export const ROLE_STORAGE_KEY = "oscar-cockpit-role";

/** Prefill del wizard de ingreso express (desde omnisearch). */
export interface IntakePrefill {
  plate?: string;
  fullName?: string;
  phone?: string;
  make?: string;
  model?: string;
}

/* ─────────────────────────── Bahías ─────────────────────────── */

export const BAY_KIND_LABELS: Record<string, string> = {
  ELEVADOR: "Elevador",
  FOSA: "Fosa",
  ALINEACION: "Alineación",
  PISO: "Piso",
};

export interface BayLedInfo {
  led: string;
  label: string;
  tone: string;
}

/** Estado visual de la bahía según la orden que aloja. */
export function bayLed(bay: BayDTO): BayLedInfo {
  if (!bay.current) return { led: "led led-green", label: "LIBRE", tone: "border-carbon-700" };
  const s = bay.current.status;
  if (s === "ESPERANDO_REPARACION") return { led: "led led-red", label: "ESPERA REPUESTO", tone: "border-oscar-red/50" };
  if (s === "CONTROL" || s === "LISTO") return { led: "led led-cyan", label: "PRUEBA / CONTROL", tone: "border-bay-test/50" };
  return { led: "led led-yellow", label: "EN PROCESO", tone: "border-oscar-yellow/50" };
}

/* ─────────────────────────── Ítems de orden ─────────────────────────── */

export const WORK_STATUS_TONES: Record<string, string> = {
  PENDIENTE: "border-carbon-700 text-steel",
  EN_CURSO: "border-oscar-yellow/50 bg-oscar-yellow/10 text-oscar-yellow",
  COMPLETADO: "border-bay-free/40 bg-bay-free/5 text-bay-free",
  CANCELADO: "border-carbon-700 text-lead line-through",
};

export const PART_STATUS_TONES: Record<string, string> = {
  PENDIENTE: "border-carbon-700 text-steel",
  SOLICITADO: "border-oscar-yellow/40 bg-oscar-yellow/5 text-oscar-yellow",
  CONSEGUIDO: "border-oscar-yellow/40 bg-oscar-yellow/5 text-oscar-yellow",
  RECIBIDO: "border-bay-test/40 bg-bay-test/5 text-bay-test",
  INSTALADO: "border-bay-free/40 bg-bay-free/5 text-bay-free",
  CANCELADO: "border-carbon-700 text-lead line-through",
};

/** Siguiente estado "natural" (no-cancelación) del workflow del taller. */
export function nextPrimaryStatus(status: OrderStatus): OrderStatus | null {
  const allowed = ORDER_TRANSITIONS[status] ?? [];
  return allowed.find((t) => t !== "CANCELADA") ?? null;
}

/* ─────────────────────────── Formatters de cabina ─────────────────────────── */

const compactArs = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

/** $ compacto para el ticker del HUD ($1,2M). */
export function moneyCompact(value: number | null | undefined): string {
  return `$${compactArs.format(Math.round(value ?? 0))}`;
}

/** Cronómetro vivo — "23m 45s" / "1h 07m". `nowMs === 0` (SSR) → "—". */
export function formatLiveElapsed(nowMs: number, sinceIso: string | null | undefined): string {
  if (!nowMs || !sinceIso) return "—";
  const diff = Math.max(0, nowMs - new Date(sinceIso).getTime());
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Minutos vivos desde un ISO (para lógica de exceso de bahía). */
export function liveMinutes(nowMs: number, sinceIso: string | null | undefined): number {
  if (!nowMs || !sinceIso) return 0;
  return Math.max(0, (nowMs - new Date(sinceIso).getTime()) / 60000);
}

/** HH:MM:SS para el reloj del HUD. `nowMs === 0` (SSR) → "--:--:--". */
export function formatClock(nowMs: number): string {
  if (!nowMs) return "--:--:--";
  return new Date(nowMs).toLocaleTimeString("es-AR", { hour12: false });
}

/** Normalización de teléfono → E.164 (contrato del intake original). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && /^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  if (digits.startsWith("54")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 12) return `+54${digits}`;
  return `+${digits}`;
}

/** Inicio del día local (para facturación de la jornada). */
export function startOfToday(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
