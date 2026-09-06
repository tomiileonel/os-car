"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "~/lib/auth-client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message || "No pudimos iniciar sesión.");
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
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
            <p className="os-eyebrow">ACCESO ADMINISTRATIVO</p>
            <h1 className="os-title">Panel del taller</h1>
            <p className="os-lede">El acceso está protegido por Better Auth y los permisos se validan en servidor.</p>
            <form className="os-form" onSubmit={submit}>
              <label className="os-field"><span className="os-label">Email</span><input className="os-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label className="os-field"><span className="os-label">Contraseña</span><input className="os-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
              {error ? <div className="os-message os-message-error" role="alert">{error}</div> : null}
              <button className="os-button" type="submit" disabled={loading}>{loading ? "Ingresando…" : "Ingresar al taller"}</button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
