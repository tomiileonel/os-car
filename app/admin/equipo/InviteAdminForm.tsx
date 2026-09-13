"use client";

import { FormEvent, useState } from "react";
import { adminInviteApi, ApiClientError } from "@/lib/api-client";
import type { InviteAdminPayload, InviteAdminResultDto } from "@/lib/api-client";

const ROLE_OPTIONS: Array<{ value: InviteAdminPayload["role"]; label: string }> = [
  { value: "TALLER_SUPERVISOR", label: "Supervisor de taller" },
  { value: "ADMIN", label: "Administrativo" },
  { value: "RECEPCIONISTA", label: "Recepcionista" },
  { value: "MECANICO", label: "Mecánico" },
  { value: "OWNER", label: "Dueño (acceso total)" },
];

interface InviteAdminFormProps {
  workshopId: string;
  actorRole: string;
}

export function InviteAdminForm({ workshopId }: InviteAdminFormProps): React.JSX.Element {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteAdminPayload["role"]>("RECEPCIONISTA");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteAdminResultDto | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const invited = await adminInviteApi.invite({
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
      });
      setResult(invited);
      setEmail("");
      setDisplayName("");
      setRole("RECEPCIONISTA");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "No pudimos crear la invitación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPassword(): Promise<void> {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API puede fallar por permisos del navegador; la
      // contraseña sigue visible en pantalla para copiar a mano.
    }
  }

  if (result) {
    return (
      <div className="os-form" role="status">
        <div className="os-message os-message-success">
          Administrador <strong>{result.displayName}</strong> creado con rol {result.role}.
        </div>
        <div className="os-field os-field-full">
          <span className="os-label">Contraseña provisoria (se muestra una sola vez)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code
              style={{
                flex: 1,
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "#0c1424",
                border: "1px solid var(--border)",
                fontSize: 15,
                letterSpacing: "0.02em",
                wordBreak: "break-all",
              }}
            >
              {result.temporaryPassword}
            </code>
            <button type="button" className="os-button" onClick={() => void copyPassword()}>
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            Comunicásela a {result.email} por un canal seguro (no por este mismo sistema). Va a
            tener que cambiarla en su primer inicio de sesión.
          </p>
        </div>
        <button type="button" className="os-button" onClick={() => setResult(null)}>
          Invitar a otra persona
        </button>
      </div>
    );
  }

  return (
    <form className="os-form" onSubmit={(event) => void submit(event)}>
      <input type="hidden" name="workshopId" value={workshopId} />
      <div className="os-form-grid">
        <label className="os-field">
          <span className="os-label">Nombre y apellido</span>
          <input
            className="os-input"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
          />
        </label>
        <label className="os-field">
          <span className="os-label">Email</span>
          <input
            className="os-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <label className="os-field os-field-full">
          <span className="os-label">Rol</span>
          <select
            className="os-select"
            value={role}
            onChange={(event) => setRole(event.target.value as InviteAdminPayload["role"])}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div className="os-message os-message-error" role="alert">
          {error}
        </div>
      ) : null}
      <button className="os-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creando…" : "Crear invitación"}
      </button>
    </form>
  );
}
