/**
 * OS-CAR · Gate G6 — Mostrador Rápido de Recepción (OT-G6-FRONTEND-STITCH-001)
 * --------------------------------------------------------------------------
 * UBICACIÓN CORREGIDA: app/admin/recepcion/page.tsx
 * Hereda el layout de seguridad, el middleware de sesión administrativa
 * y las guardas de tenant (workshopId) definidas en Gate G4.
 */
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClientError, vehiclesApi, type VehicleDTO } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PlateInput,
  isValidPlate,
  PLATE_MAX_LENGTH,
  PLATE_MIN_LENGTH,
} from "@/components/ui/plate-input";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 3;
const SEARCH_PAGE_SIZE = 8;
const ADMISSIONS_PAGE_SIZE = 20;
const YEAR_MIN = 1886;
const YEAR_MAX = 2100;

interface FieldErrorEntry {
  field: string;
  messages: string[];
}

interface ErrorInfo {
  code: string;
  message: string;
  requestId: string | null;
  fieldErrors: FieldErrorEntry[];
}

type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; results: VehicleDTO[]; requestId: string | null }
  | { status: "error"; query: string; error: ErrorInfo };

type AdmissionsState =
  | { status: "loading" }
  | { status: "ready"; items: VehicleDTO[]; requestId: string | null }
  | { status: "error"; error: ErrorInfo };

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; plate: string; requestId: string | null }
  | { status: "error"; error: ErrorInfo };

function extractFieldErrors(details: unknown): FieldErrorEntry[] {
  if (typeof details !== "object" || details === null) return [];
  const container = details as { fieldErrors?: unknown };
  const fieldErrors = container.fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) return [];

  return Object.entries(fieldErrors as Record<string, unknown>)
    .map(([field, messages]) => ({
      field,
      messages: Array.isArray(messages)
        ? messages.filter((message): message is string => typeof message === "string")
        : [],
    }))
    .filter((entry) => entry.messages.length > 0);
}

function describeApiError(error: unknown): ErrorInfo {
  if (error instanceof ApiClientError) {
    const base: ErrorInfo = {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      fieldErrors: extractFieldErrors(error.details),
    };
    switch (error.code) {
      case "VEHICLE_DUPLICATE_PLATE":
        return { ...base, message: "La patente ya está registrada en este taller (409)." };
      case "CUSTOMER_NOT_FOUND":
        return { ...base, message: "El cliente indicado no existe en este taller (404)." };
      case "INVALID_PAYLOAD":
        return { ...base, message: "Hay campos inválidos (400). Revisá los detalles." };
      case "UNAUTHENTICATED":
        return { ...base, message: "Sesión ausente o expirada (401). Ingresá nuevamente." };
      case "FORBIDDEN_ADMIN_MEMBERSHIP":
        return { ...base, message: "Tu rol no está habilitado para recepción (403)." };
      case "NETWORK_ERROR":
        return { ...base, message: "Sin conexión con el servidor. Reintentá." };
      default:
        return base;
    }
  }
  return {
    code: "UNKNOWN",
    message: "Error inesperado.",
    requestId: null,
    fieldErrors: [],
  };
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function vehicleLabel(vehicle: VehicleDTO): string {
  const parts = [vehicle.make, vehicle.model].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : "S/M";
}

export default function AdminRecepcionPage() {
  const [plate, setPlate] = useState("");
  const debouncedPlate = useDebouncedValue(plate, SEARCH_DEBOUNCE_MS);

  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [admissions, setAdmissions] = useState<AdmissionsState>({ status: "loading" });
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const [customerId, setCustomerId] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [color, setColor] = useState("");

  const [admissionsTick, setAdmissionsTick] = useState(0);
  const refreshAdmissions = useCallback(() => {
    setAdmissionsTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const query = debouncedPlate.trim();
    if (query.length < SEARCH_MIN_CHARS) {
      setSearch({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setSearch({ status: "loading", query });

    vehiclesApi
      .list({ q: query, page: 1, pageSize: SEARCH_PAGE_SIZE }, { signal: controller.signal })
      .then((result) => {
        setSearch({
          status: "ready",
          query,
          results: result.data.items,
          requestId: result.requestId,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.code === "REQUEST_ABORTED") return;
        setSearch({ status: "error", query, error: describeApiError(error) });
      });

    return () => controller.abort();
  }, [debouncedPlate]);

  useEffect(() => {
    const controller = new AbortController();
    setAdmissions((previous) => (previous.status === "ready" ? previous : { status: "loading" }));

    vehiclesApi
      .list({ page: 1, pageSize: ADMISSIONS_PAGE_SIZE }, { signal: controller.signal })
      .then((result) => {
        const now = new Date();
        const todays = result.data.items.filter((item) =>
          isSameLocalDay(new Date(item.createdAt), now),
        );
        setAdmissions({ status: "ready", items: todays, requestId: result.requestId });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiClientError && error.code === "REQUEST_ABORTED") return;
        setAdmissions({ status: "error", error: describeApiError(error) });
      });

    return () => controller.abort();
  }, [admissionsTick]);

  const exactMatch = useMemo(() => {
    if (search.status !== "ready") return null;
    const normalized = plate.trim();
    if (!isValidPlate(normalized)) return null;
    return search.results.find((item) => item.licensePlateNormalized === normalized) ?? null;
  }, [search, plate]);

  const submitting = submit.status === "submitting";

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const normalizedPlate = plate.trim();
      if (!isValidPlate(normalizedPlate)) {
        setSubmit({
          status: "error",
          error: {
            code: "INVALID_PLATE",
            message: `La patente debe tener entre ${PLATE_MIN_LENGTH} y ${PLATE_MAX_LENGTH} caracteres alfanuméricos.`,
            requestId: null,
            fieldErrors: [],
          },
        });
        return;
      }
      if (customerId.trim().length < 5) {
        setSubmit({
          status: "error",
          error: {
            code: "CUSTOMER_ID_REQUIRED",
            message: "Indicá el ID del cliente asignado.",
            requestId: null,
            fieldErrors: [],
          },
        });
        return;
      }
      const parsedYear =
        modelYear.trim() === "" ? undefined : Number.parseInt(modelYear.trim(), 10);
      if (
        parsedYear !== undefined &&
        (Number.isNaN(parsedYear) || parsedYear < YEAR_MIN || parsedYear > YEAR_MAX)
      ) {
        setSubmit({
          status: "error",
          error: {
            code: "INVALID_MODEL_YEAR",
            message: `El año debe ser un entero entre ${YEAR_MIN} y ${YEAR_MAX}.`,
            requestId: null,
            fieldErrors: [],
          },
        });
        return;
      }

      setSubmit({ status: "submitting" });
      try {
        const result = await vehiclesApi.create({
          customerId: customerId.trim(),
          licensePlate: normalizedPlate,
          make: make.trim() === "" ? undefined : make.trim(),
          model: model.trim() === "" ? undefined : model.trim(),
          modelYear: parsedYear,
          color: color.trim() === "" ? undefined : color.trim(),
        });
        setSubmit({
          status: "success",
          plate: result.data.vehicle.licensePlateNormalized,
          requestId: result.requestId,
        });
        setMake("");
        setModel("");
        setModelYear("");
        setColor("");
        refreshAdmissions();
      } catch (error: unknown) {
        setSubmit({ status: "error", error: describeApiError(error) });
      }
    },
    [submitting, plate, customerId, make, model, modelYear, color, refreshAdmissions],
  );

  return (
    <div className="min-h-screen bg-[#090d16] text-zinc-100">
      <header className="border-b border-zinc-800 bg-[#111827]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg font-bold tracking-widest text-sky-400">
              OS-CAR
            </span>
            <Badge variant="accent">RECEPCIÓN</Badge>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
            Mostrador rápido · G6
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <div className="rounded-sm border border-zinc-800 bg-[#111827] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h1 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
                Búsqueda de vehículo
              </h1>
              {search.status === "ready" ? (
                <span className="font-mono text-[11px] text-zinc-500">
                  req: {search.requestId ?? "n/a"}
                </span>
              ) : null}
            </div>

            <PlateInput
              label="Patente"
              value={plate}
              onChange={setPlate}
              placeholder="ABC123 · AB123CDE"
              autoFocus
            />
            <p className="mt-2 text-xs text-zinc-500">
              La búsqueda se ejecuta automáticamente ({SEARCH_DEBOUNCE_MS} ms) contra GET
              /api/vehicles.
            </p>

            {search.status === "loading" ? (
              <div
                className="mt-3 rounded-sm border border-sky-400/40 bg-sky-400/10 px-3 py-2 font-mono text-xs uppercase tracking-widest text-sky-300"
                role="status"
              >
                Buscando…
              </div>
            ) : null}

            {search.status === "error" ? (
              <div
                className="mt-3 rounded-sm border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                role="alert"
              >
                <p className="font-mono text-[11px] font-semibold uppercase tracking-widest">
                  {search.error.code}
                </p>
                <p>{search.error.message}</p>
              </div>
            ) : null}

            {search.status === "ready" && search.results.length === 0 ? (
              <div className="mt-3 rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                Sin resultados para <span className="font-mono">{search.query}</span>. Completá
                los datos para registrar el vehículo.
              </div>
            ) : null}

            {search.status === "ready" && search.results.length > 0 ? (
              <ul className="mt-3 divide-y divide-zinc-800 rounded-sm border border-zinc-800">
                {search.results.map((vehicle) => (
                  <li
                    key={vehicle.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-sm font-bold tracking-widest text-zinc-100">
                        {vehicle.licensePlateNormalized}
                      </span>
                      <span className="truncate text-xs text-zinc-400">
                        {vehicleLabel(vehicle)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="max-w-[140px] truncate text-xs text-zinc-500">
                        {vehicle.customer.fullName}
                      </span>
                      <Badge variant="success">EXISTENTE</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {exactMatch ? (
              <div className="mt-3 flex items-center justify-between rounded-sm border border-emerald-400/50 bg-emerald-400/10 px-3 py-2">
                <span className="text-sm text-emerald-200">
                  Vehículo ya registrado: cliente {exactMatch.customer.fullName}. No es necesario
                  crearlo de nuevo.
                </span>
                <Badge variant="success">REUTILIZAR</Badge>
              </div>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-sm border border-zinc-800 bg-[#111827] p-4"
            noValidate={false}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
                Registro de vehículo nuevo
              </h2>
              {plate.trim().length > 0 ? (
                <Badge variant={isValidPlate(plate.trim()) ? "success" : "warning"}>
                  {plate.trim()}
                </Badge>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Marca"
                value={make}
                onChange={(event) => setMake(event.target.value)}
                placeholder="Toyota"
                disabled={submitting}
                maxLength={80}
              />
              <Input
                label="Modelo"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Corolla"
                disabled={submitting}
                maxLength={80}
              />
              <Input
                label="Año"
                type="number"
                inputMode="numeric"
                value={modelYear}
                onChange={(event) => setModelYear(event.target.value)}
                placeholder="2019"
                disabled={submitting}
                min={YEAR_MIN}
                max={YEAR_MAX}
              />
              <Input
                label="Color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                placeholder="Gris"
                disabled={submitting}
                maxLength={40}
              />
            </div>

            <div className="mt-3">
              <Input
                label="Cliente asignado (ID)"
                mono
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                placeholder="cjld25s..."
                disabled={submitting}
                hint="ID del cliente (CUID) registrado en este tenant."
                required
              />
            </div>

            {submit.status === "error" ? (
              <div
                role="alert"
                className="mt-3 rounded-sm border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                <p className="font-mono text-[11px] font-semibold uppercase tracking-widest">
                  {submit.error.code}
                </p>
                <p>{submit.error.message}</p>
                {submit.error.fieldErrors.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {submit.error.fieldErrors.map((entry) => (
                      <li key={entry.field}>
                        <span className="font-mono">{entry.field}</span>:{" "}
                        {entry.messages.join(" · ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {submit.error.requestId ? (
                  <span className="mt-1 block font-mono text-[11px] text-red-300/80">
                    req: {submit.error.requestId}
                  </span>
                ) : null}
              </div>
            ) : null}

            {submit.status === "success" ? (
              <div
                role="status"
                className="mt-3 rounded-sm border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
              >
                Vehículo{" "}
                <span className="font-mono font-bold tracking-widest">{submit.plate}</span>{" "}
                registrado correctamente.
                <span className="ml-2 font-mono text-[11px] text-emerald-300/80">
                  req: {submit.requestId ?? "n/a"}
                </span>
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="submit" variant="primary" loading={submitting}>
                {submitting ? "Registrando…" : "Registrar vehículo"}
              </Button>
            </div>
          </form>
        </section>

        <aside className="h-fit rounded-sm border border-zinc-800 bg-[#111827] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">
              Admisiones de hoy
            </h2>
            <div className="flex items-center gap-2">
              {admissions.status === "ready" ? (
                <Badge variant="neutral">{admissions.items.length}</Badge>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshAdmissions}
                aria-label="Actualizar admisiones del día"
              >
                ⟳
              </Button>
            </div>
          </div>

          {admissions.status === "loading" ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-8 animate-pulse rounded-sm bg-zinc-800/60" />
              ))}
            </div>
          ) : null}

          {admissions.status === "error" ? (
            <div
              role="alert"
              className="rounded-sm border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-200"
            >
              <p className="font-mono font-semibold uppercase tracking-widest">
                {admissions.error.code}
              </p>
              <p>{admissions.error.message}</p>
            </div>
          ) : null}

          {admissions.status === "ready" && admissions.items.length === 0 ? (
            <p className="rounded-sm border border-zinc-800 bg-zinc-900/60 px-3 py-4 text-center text-xs text-zinc-500">
              Todavía no hay admisiones registradas hoy en este taller.
            </p>
          ) : null}

          {admissions.status === "ready" && admissions.items.length > 0 ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-widest text-zinc-500">
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Patente
                  </th>
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Vehículo
                  </th>
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Cliente
                  </th>
                  <th scope="col" className="py-1 font-semibold">
                    Hora
                  </th>
                </tr>
              </thead>
              <tbody>
                {admissions.items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-800/60 last:border-0">
                    <td className="py-1.5 pr-2 font-mono text-xs font-bold tracking-widest text-zinc-100">
                      {item.licensePlateNormalized}
                    </td>
                    <td className="max-w-[90px] truncate py-1.5 pr-2 text-xs text-zinc-300">
                      {vehicleLabel(item)}
                    </td>
                    <td className="max-w-[90px] truncate py-1.5 pr-2 text-xs text-zinc-400">
                      {item.customer.fullName}
                    </td>
                    <td className="py-1.5 font-mono text-xs text-zinc-500">
                      {formatTime(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
