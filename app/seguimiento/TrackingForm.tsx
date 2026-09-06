"use client";

import { FormEvent, useState } from "react";

interface TrackingData {
  vehicle: { make: string | null; model: string | null; modelYear: number | null; licensePlateMasked: string };
  status: string;
  costs: { laborSubtotal: string; partsSubtotal: string; totalEstimated: string; totalFinal: string };
  workItems: ReadonlyArray<{ description: string; status: string }>;
  partItems: ReadonlyArray<{ description: string; quantity: number; status: string }>;
  timeline: ReadonlyArray<{ eventType: string; description: string; createdAt: string }>;
}

interface TrackingResponse {
  success: boolean;
  data?: TrackingData;
  error?: { message?: string };
}

const statusLabels: Record<string, string> = {
  INGRESADO: "Ingresado",
  DIAGNOSTICO: "En diagnóstico",
  ESPERANDO_REPARACION: "Esperando reparación",
  EN_REPARACION: "En reparación",
  CONTROL: "Control de calidad",
  LISTO: "Listo para retirar",
  ENTREGADO: "Entregado",
  CANCELADA: "Cancelada",
};

const moneyFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function money(value: string): string {
  return moneyFormatter.format(Number(value));
}

export default function TrackingForm({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch("/api/public/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingToken: token }),
      });
      const body = (await response.json()) as TrackingResponse;
      if (!response.ok || !body.success || !body.data) {
        setError(body.error?.message ?? "No encontramos esa orden.");
      } else {
        setData(body.data);
      }
    } catch {
      setError("No pudimos consultar el seguimiento. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="os-form">
      <form onSubmit={submit} className="os-form">
        <label className="os-field">
          <span className="os-label">Código de seguimiento</span>
          <input
            className="os-input"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Pegá tu código privado"
            autoComplete="off"
            required
          />
        </label>
        <button className="os-button" type="submit" disabled={loading}>
          {loading ? "Consultando…" : "Ver mi vehículo"}
        </button>
      </form>

      {error ? <div className="os-message os-message-error" role="alert">{error}</div> : null}

      {data ? (
        <section aria-live="polite">
          <div className="tracking-summary">
            <div className="tracking-stat">
              <span className="tracking-stat-label">Vehículo</span>
              <strong className="tracking-stat-value">{data.vehicle.make} {data.vehicle.model}</strong>
            </div>
            <div className="tracking-stat">
              <span className="tracking-stat-label">Patente</span>
              <strong className="tracking-stat-value">{data.vehicle.licensePlateMasked}</strong>
            </div>
            <div className="tracking-stat">
              <span className="tracking-stat-label">Estado actual</span>
              <strong className="tracking-stat-value">{statusLabels[data.status] ?? data.status}</strong>
            </div>
            <div className="tracking-stat">
              <span className="tracking-stat-label">Total estimado</span>
              <strong className="tracking-stat-value">{money(data.costs.totalEstimated)}</strong>
            </div>
          </div>

          <h2>Costos</h2>
          <div className="tracking-summary">
            <div className="tracking-stat"><span className="tracking-stat-label">Mano de obra</span><strong className="tracking-stat-value">{money(data.costs.laborSubtotal)}</strong></div>
            <div className="tracking-stat"><span className="tracking-stat-label">Repuestos</span><strong className="tracking-stat-value">{money(data.costs.partsSubtotal)}</strong></div>
          </div>

          <h2>Trabajos registrados</h2>
          {data.workItems.length === 0 ? <p className="os-lede">Todavía no hay trabajos cargados.</p> : <ul className="tracking-list">{data.workItems.map((item, index) => <li key={`${item.description}-${index}`}><strong>{item.description}</strong><br /><span>{item.status}</span></li>)}</ul>}

          <h2 style={{ marginTop: 28 }}>Historial público</h2>
          {data.timeline.length === 0 ? <p className="os-lede">Todavía no hay novedades públicas.</p> : <ol className="tracking-list">{data.timeline.map((event, index) => <li key={`${event.eventType}-${index}`}><strong>{event.description}</strong><br /><span>{new Date(event.createdAt).toLocaleString("es-AR")}</span></li>)}</ol>}
        </section>
      ) : null}
    </div>
  );
}
