import Link from "next/link";
import { Suspense } from "react";
import { getAdminBootstrapStatus } from "@/server/services/admin-bootstrap.service";
import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage() {
  const bootstrapStatus = await getAdminBootstrapStatus();

  return (
    <main className="os-page">
      <div className="os-page-inner" style={{ maxWidth: 520 }}>
        <nav className="os-topbar" aria-label="Navegación principal">
          <Link className="os-brand" href="/">OS-CAR</Link>
          <Link className="os-back" href="/">Volver al inicio</Link>
        </nav>
        <section className="os-panel">
          <Suspense fallback={<div className="os-panel-content"><p className="os-lede">Cargando…</p></div>}>
            <LoginForm canRegister={bootstrapStatus.canRegister} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

