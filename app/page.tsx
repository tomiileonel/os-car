"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const { error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      setError(error.message || "Error al iniciar sesión");
    } else {
      setMessage("Sesión iniciada correctamente");
    }
  };

  const handleLogout = async () => {
    await authClient.signOut();
  };

  return (
    <main style={{ maxWidth: 440, margin: "60px auto", padding: "24px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
          OS-CAR
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>
          Panel de Autenticación (Better Auth + PostgreSQL)
        </p>
      </div>

      {isPending ? (
        <p style={{ textAlign: "center", color: "#94a3b8" }}>Cargando sesión...</p>
      ) : session ? (
        <div style={{ background: "#1e293b", padding: 24, borderRadius: 12, border: "1px solid #334155" }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Bienvenido, {session.user.name}</p>
          <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>{session.user.email}</p>
          <button
            onClick={handleLogout}
            style={{ marginTop: 16, width: "100%", padding: "10px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
          >
            Cerrar Sesión
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin} style={{ background: "#1e293b", padding: 24, borderRadius: 12, border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dueno@taller.com"
              required
              style={{ width: "100%", padding: "10px 12px", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "white", fontSize: 14 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: "100%", padding: "10px 12px", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "white", fontSize: 14 }}
            />
          </div>

          {error && (
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444", color: "#fca5a5", fontSize: 13 }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ padding: 10, borderRadius: 8, background: "rgba(34, 197, 94, 0.15)", border: "1px solid #22c55e", color: "#86efac", fontSize: 13 }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            style={{ width: "100%", padding: "10px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, marginTop: 8 }}
          >
            Iniciar Sesión
          </button>
        </form>
      )}
    </main>
  );
}
