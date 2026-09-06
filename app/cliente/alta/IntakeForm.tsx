"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

interface IntakeSuccess {
  success: true;
  data: { trackingToken: string; trackingUrl: string; workOrderId: string };
}

interface IntakeFailure {
  success: false;
  error?: { message?: string; code?: string };
}

type IntakeResponse = IntakeSuccess | IntakeFailure;

export default function IntakeForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [response, setResponse] = useState<IntakeResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResponse(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      fullName: String(form.get("fullName") ?? ""),
      phoneE164: String(form.get("phoneE164") ?? ""),
      email: String(form.get("email") ?? "") || undefined,
      vehicleType: String(form.get("vehicleType") ?? ""),
      licensePlate: String(form.get("licensePlate") ?? ""),
      make: String(form.get("make") ?? ""),
      model: String(form.get("model") ?? ""),
      modelYear: Number(form.get("modelYear")),
      odometerAtIntake: Number(form.get("odometerAtIntake")),
      fuelLevel: String(form.get("fuelLevel") ?? ""),
      customerComplaint: String(form.get("customerComplaint") ?? ""),
    };

    try {
      const result = await fetch("/api/public/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await result.json()) as IntakeResponse;
      setResponse(body);
    } catch {
      setResponse({
        success: false,
        error: { code: "NETWORK_ERROR", message: "No pudimos comunicarnos con el taller. Intentá nuevamente." },
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (response?.success) {
    return (
      <div className="os-message os-message-success" aria-live="polite">
        <strong>Ingreso registrado.</strong>
        <p>Guardá este acceso. Es la única credencial necesaria para consultar tu orden.</p>
        <code className="tracking-token">{response.data.trackingToken}</code>
        <Link className="os-button" href={response.data.trackingUrl}>Abrir seguimiento</Link>
      </div>
    );
  }

  return (
    <form className="os-form" onSubmit={submit}>
      {response && !response.success ? (
        <div className="os-message os-message-error" role="alert">
          {response.error?.message ?? "No pudimos registrar el ingreso."}
        </div>
      ) : null}

      <div className="os-form-grid">
        <label className="os-field">
          <span className="os-label">Nombre y apellido</span>
          <input className="os-input" name="fullName" autoComplete="name" required minLength={2} maxLength={120} />
        </label>
        <label className="os-field">
          <span className="os-label">Teléfono</span>
          <input className="os-input" name="phoneE164" type="tel" inputMode="tel" placeholder="+5491112345678" required />
        </label>
        <label className="os-field">
          <span className="os-label">Email <small>(opcional)</small></span>
          <input className="os-input" name="email" type="email" autoComplete="email" />
        </label>
        <label className="os-field">
          <span className="os-label">Tipo de vehículo</span>
          <select className="os-select" name="vehicleType" defaultValue="AUTO" required>
            <option value="AUTO">Auto</option>
            <option value="CAMIONETA">Camioneta</option>
            <option value="CAMION">Camión</option>
          </select>
        </label>
        <label className="os-field">
          <span className="os-label">Patente</span>
          <input className="os-input" name="licensePlate" autoCapitalize="characters" required minLength={5} maxLength={10} />
        </label>
        <label className="os-field">
          <span className="os-label">Marca</span>
          <input className="os-input" name="make" required maxLength={80} />
        </label>
        <label className="os-field">
          <span className="os-label">Modelo</span>
          <input className="os-input" name="model" required maxLength={80} />
        </label>
        <label className="os-field">
          <span className="os-label">Año</span>
          <input className="os-input" name="modelYear" type="number" inputMode="numeric" min={1886} max={new Date().getFullYear() + 1} required />
        </label>
        <label className="os-field">
          <span className="os-label">Kilometraje actual</span>
          <input className="os-input" name="odometerAtIntake" type="number" inputMode="numeric" min={0} required />
        </label>
        <label className="os-field">
          <span className="os-label">Combustible</span>
          <select className="os-select" name="fuelLevel" defaultValue="MITAD" required>
            <option value="VACIO">Vacío</option>
            <option value="CUARTO">¼</option>
            <option value="MITAD">½</option>
            <option value="TRES_CUARTOS">¾</option>
            <option value="LLENO">Lleno</option>
          </select>
        </label>
        <label className="os-field os-field-full">
          <span className="os-label">¿Qué le pasa al vehículo?</span>
          <textarea className="os-textarea" name="customerComplaint" placeholder="Ej.: hace ruido al frenar" required minLength={5} maxLength={2000} />
        </label>
      </div>

      <button className="os-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Registrando ingreso…" : "Registrar vehículo"}
      </button>
    </form>
  );
}
