import Link from "next/link";
import { requireActiveAdmin } from "@/server/auth/active-admin";

export default async function AdminPage() {
  const { session } = await requireActiveAdmin();

  return (
    <main className="os-page">
      <div className="os-page-inner">
        <nav className="os-topbar" aria-label="Navegación administrativa">
          <Link className="os-brand" href="/admin">OS-CAR / ADMIN</Link>
          <Link className="os-back" href="/">Salir al inicio</Link>
        </nav>
        <section className="os-panel">
          <div className="os-panel-content">
            <p className="os-eyebrow">OPERACIÓN DEL TALLER</p>
            <h1 className="os-title">Buen día, {session.user.name}</h1>
            <p className="os-lede">Este es el núcleo operativo. Las siguientes vistas se conectan al mismo modelo de órdenes, costos y bahías.</p>
            <div className="admin-grid">
              <article className="admin-card"><h2>Recepción</h2><p>Ingresá vehículos y abrí órdenes de trabajo.</p></article>
              <article className="admin-card"><h2>Órdenes</h2><p>Diagnóstico, mano de obra, repuestos y estados.</p></article>
              <article className="admin-card"><h2>Bahías</h2><p>Visualizá disponibilidad y asignaciones activas.</p></article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
