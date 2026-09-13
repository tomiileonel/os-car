"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "~/lib/auth-client";

interface LoginFormProps {
  canRegister: boolean;
}

export function LoginForm({ canRegister }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegistered = searchParams.get("registered") === "1" || searchParams.get("registered") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        // Regla de seguridad G11: error genérico fail-closed; no revelar si el correo existe
        setError("Credenciales inválidas o cuenta no autorizada.");
        setLoading(false);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      console.error("[LOGIN_SUBMIT_ERROR]", err);
      setError("Error al conectar con el servicio de autenticación. Por favor, reintentá.");
      setLoading(false);
    }
  }

  return (
    <div className="os-panel-content">
      <p className="os-eyebrow">ACCESO ADMINISTRATIVO</p>
      <h1 className="os-title">Panel del taller</h1>
      <p className="os-lede">El acceso está protegido por Better Auth y los permisos se validan en servidor.</p>

      {isRegistered ? (
        <div className="os-message os-message-success" role="status" style={{ marginBottom: 20 }}>
          ¡Cuenta creada con éxito! Por seguridad, ingresá con tu email y contraseña para acceder al panel.
        </div>
      ) : null}

      <form className="os-form" onSubmit={submit}>
        <label className="os-field">
          <span className="os-label">Email</span>
          <input
            className="os-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="os-field">
          <span className="os-label">Contraseña</span>
          <input
            className="os-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <div className="os-message os-message-error" role="alert">{error}</div> : null}
        <button className="os-button" type="submit" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar al taller"}
        </button>
      </form>

      {canRegister ? (
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 14 }}>
          <span style={{ color: "var(--text-muted)" }}>¿No tenés cuenta aún? </span>
          <Link
            href="/admin/register"
            style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "underline" }}
          >
            Crear cuenta
          </Link>
        </div>
      ) : null}
    </div>
  );
}

