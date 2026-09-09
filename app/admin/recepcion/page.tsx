"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlateInput, normalizePlate } from "@/components/ui/plate-input";
import type { PlateNormalizationResult } from "@/components/ui/plate-input";
import { OrderStatusBadge } from "@/components/ui/badge";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { ApiClientError, vehiclesApi } from "@/lib/api-client";
import type { CreateVehicleInput, VehicleDto } from "@/lib/api-client";

const SEARCH_DEBOUNCE_MS = 300;

const FUEL_LEVEL_OPTIONS: Array<{ value: CreateVehicleInput["fuelLevel"]; label: string }> = [
  { value: "VACIO", label: "Vacío" },
  { value: "CUARTO", label: "1/4" },
  { value: "MITAD", label: "1/2" },
  { value: "TRES_CUARTOS", label: "3/4" },
  { value: "LLENO", label: "Lleno" },
];

interface IntakeFormState {
  customerName: string;
  phone: string;
  plate: PlateNormalizationResult;
  customerComplaint: string;
  odometerAtIntake: string;
  fuelLevel: CreateVehicleInput["fuelLevel"];
}

const INITIAL_FORM_STATE: IntakeFormState = {
  customerName: "",
  phone: "",
  plate: normalizePlate(""),
  customerComplaint: "",
  odometerAtIntake: "",
  fuelLevel: "MITAD",
};

/** Maps an ApiClientError's HTTP status/code to a field-scoped or form-level message. */
function describeIntakeError(err: ApiClientError): { field: "plate" | "form"; message: string } {
  if (err.status === 409) {
    return {
      field: "plate",
      message: `Ya existe un vehículo con esta patente en el taller (ref: ${err.requestId ?? "sin id"}).`,
    };
  }
  if (err.status === 400) {
    return {
      field: "form",
      message: `Datos inválidos: ${err.message} (ref: ${err.requestId ?? "sin id"}).`,
    };
  }
  if (err.status === 403) {
    return {
      field: "form",
      message: `No tenés permiso para registrar ingresos (ref: ${err.requestId ?? "sin id"}).`,
    };
  }
  return {
    field: "form",
    message: `${err.message} (ref: ${err.requestId ?? "sin id"}).`,
  };
}

export default function RecepcionPage(): React.JSX.Element {
  // ---- Reactive search -------------------------------------------------
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [searchResults, setSearchResults] = useState<VehicleDto[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = debouncedSearch.trim();
    if (!term) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    vehiclesApi
      .list({ search: term }, { signal: controller.signal })
      .then((vehicles) => {
        if (controller.signal.aborted) return;
        setSearchResults(vehicles);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.isAbort) return;
        const message = err instanceof ApiClientError ? err.message : "Error de búsqueda";
        setSearchError(message);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsSearching(false);
      });

    return () => {
      controller.abort();
    };
  }, [debouncedSearch]);

  // ---- Today's admissions panel -----------------------------------------
  const [admissionsToday, setAdmissionsToday] = useState<VehicleDto[]>([]);
  const [admissionsError, setAdmissionsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    vehiclesApi
      .list({}, { signal: controller.signal })
      .then((vehicles) => {
        if (controller.signal.aborted) return;
        setAdmissionsToday(vehicles);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.isAbort) return;
        setAdmissionsError(err instanceof ApiClientError ? err.message : "No se pudo cargar el panel");
      });
    return () => controller.abort();
  }, []);

  // ---- Intake form -------------------------------------------------------
  const [form, setForm] = useState<IntakeFormState>(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState<Partial<Record<"plate" | "form", string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdVehicle, setCreatedVehicle] = useState<VehicleDto | null>(null);

  const odometerValue = useMemo(() => {
    const n = Number(form.odometerAtIntake);
    return Number.isFinite(n) ? n : NaN;
  }, [form.odometerAtIntake]);

  const isFormValid =
    form.customerName.trim().length >= 2 &&
    form.phone.trim().length > 0 &&
    form.plate.isValid &&
    form.customerComplaint.trim().length >= 5 &&
    Number.isInteger(odometerValue) &&
    odometerValue >= 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setFormErrors({});
    setCreatedVehicle(null);

    try {
      const vehicle = await vehiclesApi.create({
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        licensePlate: form.plate.value,
        customerComplaint: form.customerComplaint.trim(),
        odometerAtIntake: odometerValue,
        fuelLevel: form.fuelLevel,
      });
      setCreatedVehicle(vehicle);
      setAdmissionsToday((prev) => [vehicle, ...prev]);
      setForm(INITIAL_FORM_STATE);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const described = describeIntakeError(err);
        setFormErrors({ [described.field]: described.message });
      } else {
        setFormErrors({ form: "Error inesperado al registrar el ingreso." });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 gap-6 bg-[#090d16] p-6 text-[#f9fafb] lg:grid-cols-[1fr_360px]">
      <main className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Recepción</h1>
          <p className="text-sm text-[#9ca3af]">
            Buscá un vehículo existente por patente o registrá un ingreso nuevo.
          </p>
        </header>

        <section aria-labelledby="search-heading" className="flex flex-col gap-3">
          <h2 id="search-heading" className="text-lg font-semibold">
            Buscar vehículo
          </h2>
          <Input
            label="Patente o VIN"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar..."
            hint={isSearching ? "Buscando…" : undefined}
            errorMessage={searchError ?? undefined}
          />
          {searchResults.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {searchResults.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className="flex items-center justify-between rounded-md border border-[#374151] bg-[#111827] px-3 py-2"
                >
                  <span className="font-mono">{vehicle.licensePlateNormalized}</span>
                  <span className="text-sm text-[#9ca3af]">
                    {vehicle.make ?? "—"} {vehicle.model ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="intake-heading" className="flex flex-col gap-4">
          <h2 id="intake-heading" className="text-lg font-semibold">
            Alta rápida
          </h2>

          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-4">
            <Input
              label="Nombre del cliente"
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
              required
            />
            <Input
              label="Teléfono"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              hint="Formato E.164, ej: +5493764123456"
              required
            />
            <PlateInput
              value={form.plate.value}
              onChange={(result) => setForm((f) => ({ ...f, plate: result }))}
              showValidation={form.plate.value.length > 0}
            />
            {formErrors.plate ? (
              <p role="alert" className="text-sm text-[#fca5a5]">
                {formErrors.plate}
              </p>
            ) : null}
            <Input
              label="Motivo de consulta"
              value={form.customerComplaint}
              onChange={(e) => setForm((f) => ({ ...f, customerComplaint: e.target.value }))}
              required
            />
            <Input
              label="Kilometraje"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={form.odometerAtIntake}
              onChange={(e) => setForm((f) => ({ ...f, odometerAtIntake: e.target.value }))}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fuel-level" className="text-sm font-medium text-[#f9fafb]">
                Nivel de combustible
              </label>
              <select
                id="fuel-level"
                value={form.fuelLevel}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    fuelLevel: e.target.value as CreateVehicleInput["fuelLevel"],
                  }))
                }
                className="min-h-[48px] rounded-md border border-[#374151] bg-[#111827] px-3 py-2 text-[#f9fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
              >
                {FUEL_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {formErrors.form ? (
              <p role="alert" className="text-sm text-[#fca5a5]">
                {formErrors.form}
              </p>
            ) : null}

            {createdVehicle ? (
              <p role="status" className="text-sm text-[#86efac]">
                Ingreso registrado: {createdVehicle.licensePlateNormalized}
              </p>
            ) : null}

            <Button type="submit" variant="primary" loading={isSubmitting} disabled={!isFormValid}>
              Registrar ingreso
            </Button>
          </form>
        </section>
      </main>

      <aside
        aria-labelledby="admissions-heading"
        className="flex flex-col gap-3 rounded-lg border border-[#374151] bg-[#111827] p-4"
      >
        <h2 id="admissions-heading" className="text-lg font-semibold">
          Ingresos de hoy
        </h2>
        {admissionsError ? (
          <p role="alert" className="text-sm text-[#fca5a5]">
            {admissionsError}
          </p>
        ) : admissionsToday.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">Todavía no hay ingresos registrados hoy.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {admissionsToday.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex items-center justify-between rounded-md border border-[#1f2937] px-3 py-2"
              >
                <span className="font-mono text-sm">{vehicle.licensePlateNormalized}</span>
                <OrderStatusBadge status="INGRESADO" />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
