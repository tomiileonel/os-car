/**
 * OS-CAR — Dominio compartido del backend (sin dependencias de UI).
 * Duplicado deliberado de src/lib/oscar.ts para no arrastrar lucide-react al bundle de servidor.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "./http";

/* ─────────── Estados y transiciones ─────────── */

export const ORDER_STATUSES = [
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
  "LISTO",
  "ENTREGADO",
  "CANCELADA",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ORDER_IN_PROGRESS_STATUSES: OrderStatusValue[] = [
  "INGRESADO",
  "DIAGNOSTICO",
  "ESPERANDO_REPARACION",
  "EN_REPARACION",
  "CONTROL",
];

export const ORDER_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  INGRESADO: ["DIAGNOSTICO", "CANCELADA"],
  DIAGNOSTICO: ["ESPERANDO_REPARACION", "EN_REPARACION", "CANCELADA"],
  ESPERANDO_REPARACION: ["EN_REPARACION", "CANCELADA"],
  EN_REPARACION: ["CONTROL", "CANCELADA"],
  CONTROL: ["LISTO", "EN_REPARACION"],
  LISTO: ["ENTREGADO"],
  ENTREGADO: [],
  CANCELADA: [],
};

import type { HistoryEventType } from "@prisma/client";

export const TRANSITION_EVENTS: Partial<Record<OrderStatusValue, HistoryEventType>> = {
  DIAGNOSTICO: "DIAGNOSTICO_INICIADO",
  ESPERANDO_REPARACION: "DIAGNOSTICO_FINALIZADO",
  EN_REPARACION: "TRABAJO_INICIADO",
  CONTROL: "CONTROL_INICIADO",
  LISTO: "LISTO_PARA_ENTREGA",
  ENTREGADO: "ENTREGA_REALIZADA",
  CANCELADA: "ORDEN_CANCELADA",
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

export const VEHICLE_TYPES = ["AUTO", "CAMIONETA", "CAMION"] as const;
export const FUEL_LEVELS = ["VACIO", "CUARTO", "MITAD", "TRES_CUARTOS", "LLENO"] as const;
export const WORK_ITEM_STATUSES = ["PENDIENTE", "EN_CURSO", "COMPLETADO"] as const;
export const TIRE_SEASONS = ["VERANO", "INVIERNO", "TODO_CLIMA"] as const;
export const WHEEL_POSITIONS = ["DEL_IZQ", "DEL_DER", "TRAS_IZQ", "TRAS_DER"] as const;

/* ─────────── Validaciones comunes ─────────── */

export const PHONE_E164_RE = /^\+[1-9][0-9]{7,14}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PLATE_NORMALIZED_RE = /^[A-Z0-9]{5,10}$/;

/* ─────────── Helpers ─────────── */

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Etiqueta legible del vehículo: "Toyota Hilux 2.8 TD". */
export function vehicleLabel(vehicle: { make: string | null; model: string | null; licensePlate: string }): string {
  const label = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  return label.length > 0 ? label : vehicle.licensePlate;
}

/** Primer nombre del cliente (para el portal público). */
export function customerFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Clave local de día YYYY-MM-DD (sin desfase UTC). */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Workshop único del sandbox (el primero creado). */
export async function getPrimaryWorkshopId(): Promise<string> {
  const workshop = await db.workshop.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workshop) {
    throw new HttpError(500, "INTERNAL_ERROR", "No hay un taller configurado en la base de datos.");
  }
  return workshop.id;
}

/** Formatea el ID de orden como identificador legible (ej: ORD-2489 o ORD-A1B2C3). */
export function formatOrderNumber(id: string): string {
  return `ORD-${id.slice(-6).toUpperCase()}`;
}

/** Siguiente orderNumber legible: secuencial basado en conteo. */
export async function nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.workOrder.count();
  return `ORD-${2580 + count + 1}`;
}

/** Recalcula laborSubtotal / partsSubtotal / totalEstimated de la orden (ítems no cancelados). */
export async function recalcOrderTotals(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<{ laborSubtotal: number; partsSubtotal: number; totalEstimated: number }> {
  const [works, parts] = await Promise.all([
    tx.workItem.findMany({ where: { workOrderId, status: { not: "CANCELADO" } } }),
    tx.partItem.findMany({ where: { workOrderId, status: { not: "CANCELADO" } } }),
  ]);
  const laborSubtotal = round2(works.reduce((acc, w) => acc + (w.estimatedMinutes / 60) * Number(w.hourlyRateCharged), 0));
  const partsSubtotal = round2(parts.reduce((acc, p) => acc + p.quantity * Number(p.unitPriceCharged), 0));
  const totalEstimated = round2(laborSubtotal + partsSubtotal);
  await tx.workOrder.update({
    where: { id: workOrderId },
    data: { laborSubtotal, partsSubtotal, totalEstimated },
  });
  return { laborSubtotal, partsSubtotal, totalEstimated };
}

/** Parsea el visualChecklist guardado como JSON string. */
export function parseChecklist(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
