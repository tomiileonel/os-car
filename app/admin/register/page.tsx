"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { adminRegisterApi, ApiClientError } from "@/lib/api-client";

export default function AdminRegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden. Verificalas antes de continuar.");
      return;
    }

    setLoading(true);

    try {
      await adminRegisterApi.register({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password,
        inviteCode: inviteCode.trim() ? inviteCode.trim() : undefined,
      });

      // El flujo administrativo exige que el registro termine explícitamente en el login:
      // no se emite sesión automática ni se accede directamente al dashboard.
      router.push("/admin/login?registered=1");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Ocurrió un error inesperado al procesar el registro.");
      }
      setLoading(false);
    }
  }

  return (
    <main className="os-page">
      <div className="os-page-inner" style={{ maxWidth: 520 }}>
        <nav className="os-topbar" aria-label="Navegación principal">
          <Link className="os-brand" href="/">OS-CAR</Link>
          <Link className="os-back" href="/">Volver al inicio</Link>
        </nav>
        <section className="os-panel">
          <div className="os-panel-content">
            <p className="os-eyebrow">REGISTRO DE PERSONAL</p>
            <h1 className="os-title">Crear cuenta administrativa</h1>
            <p className="os-lede">
              Registrá tu cuenta para acceder al sistema operativo y panel de control del taller.
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: -14, marginBottom: 28 }}>
              Por políticas de seguridad, el registro de nuevos administradores requiere un código de invitación
              otorgado por el dueño o supervisor del taller, salvo para la inicialización del primer administrador.
            </p>
            <form className="os-form" onSubmit={submit}>
              <label className="os-field">
                <span className="os-label">Nombre y apellido</span>
                <input
                  className="os-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>

              <label className="os-field">
                <span className="os-label">Contraseña (mínimo 8 caracteres)</span>
                <input
                  className="os-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>

              <label className="os-field">
                <span className="os-label">Confirmar contraseña</span>
                <input
                  className="os-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </label>

              <label className="os-field">
                <span className="os-label">Código de invitación (opcional si es setup inicial)</span>
                <input
                  className="os-input"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Ej: INV-MECANICO-..."
                  autoComplete="off"
                />
              </label>

              {error ? (
                <div className="os-message os-message-error" role="alert">
                  {error}
                </div>
              ) : null}

              <button className="os-button" type="submit" disabled={loading}>
                {loading ? "Registrando cuenta…" : "Registrarme"}
              </button>
            </form>

            <div style={{ marginTop: 24, textAlign: "center", fontSize: 14 }}>
              <span style={{ color: "var(--text-muted)" }}>¿Ya tenés una cuenta? </span>
              <Link
                href="/admin/login"
                style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "underline" }}
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

