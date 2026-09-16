"use client";

import { useState } from "react";
import { ShieldAlert, KeyRound, Wrench, Lock, LogIn } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OscarLogo } from "@/components/oscar/logo";
import { api, ApiClientError } from "@/lib/api-client";
import { useSession } from "@/lib/store";
import { WORKSHOP } from "@/lib/oscar";
import { useToast } from "@/hooks/use-toast";

const DEMO_ACCOUNTS = [
  { email: "admin@oscar.com", label: "Oscar · Dueño", role: "OWNER" },
  { email: "recepcion@oscar.com", label: "Laura · Recepción", role: "RECEPCIONISTA" },
  { email: "mecanico@oscar.com", label: "Marcos · Mecánico", role: "MECANICO" },
] as const;

export function AdminLoginView() {
  const { toast } = useToast();
  const { setAdmin } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ admin: { id: string; displayName: string; role: string } }>(
        "/api/admin/auth/login",
        { email: email.trim().toLowerCase(), password },
      );
      setAdmin(data.admin);
      toast({ title: `¡Hola, ${data.admin.displayName.split(" ")[0]}! 👋`, description: "Sesión iniciada. Bienvenido al cockpit." });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Error de conexión con el taller.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* Fondo taller */}
      <div className="absolute inset-0" aria-hidden>
        <Image src="/hero-garage.jpg" alt="" fill sizes="100vw" priority className="object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-b from-carbon-950/85 via-carbon-950/92 to-carbon-950" />
        <div className="absolute inset-0 tech-grid" />
      </div>

      <div className="bevel-raised clip-corner relative w-full max-w-md rounded-xl p-7 sm:p-9">
        <div className="mb-7 flex flex-col items-center text-center">
          <OscarLogo compact className="size-14" />
          <h1 className="display-impact mt-4 text-2xl text-titanium">Portal del Taller</h1>
          <p className="label-tech mt-1.5">Acceso restringido al personal de OS-CAR</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="label-tech">Email operativo</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lead" aria-hidden />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="operador@oscar.com"
                autoComplete="username"
                className="pl-10"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="label-tech">Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lead" aria-hidden />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pl-10"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-md border border-oscar-red/50 bg-oscar-red/10 p-3" role="alert">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-oscar-red" aria-hidden />
              <p className="text-xs text-titanium">{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Wrench className="size-4 animate-pulse" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
            {busy ? "Verificando credenciales…" : "Ingresar al cockpit"}
          </Button>
        </form>

        {/* Cuentas demo */}
        <div className="mt-6 border-t border-carbon-800 pt-5">
          <p className="label-tech mb-2.5">Accesos rápidos (demo del taller)</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setEmail(acc.email);
                  setPassword("oscar2026");
                  setError(null);
                }}
                className="rounded-md border border-carbon-700 bg-carbon-950/60 px-3 py-2 text-left transition-colors hover:border-oscar-yellow/50 hover:bg-oscar-yellow/5"
              >
                <span className="block text-xs font-semibold text-titanium">{acc.label}</span>
                <span className="block font-mono text-[0.6rem] uppercase tracking-widest text-lead">{acc.role} · oscar2026</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center font-mono text-[0.6rem] uppercase tracking-[0.2em] text-lead">
            {WORKSHOP.address}
          </p>
        </div>
      </div>
    </div>
  );
}
