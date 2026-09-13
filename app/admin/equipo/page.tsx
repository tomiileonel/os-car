import Link from "next/link";
import { requireActiveAdmin } from "@/server/auth/active-admin";
import { InviteAdminForm } from "./InviteAdminForm";

export default async function EquipoPage() {
  // Corte en el borde: solo OWNER/TALLER_SUPERVISOR llegan a ver este
  // formulario. Cualquier otro rol es redirigido a /admin/login por
  // requireActiveAdmin antes de que se renderice nada del cliente — el
  // POST /api/admin/invite vuelve a validar esto server-side, así que
  // este check es defensa en profundidad, no la única barrera.
  const { adminUser, workshopId } = await requireActiveAdmin({
    roles: ["OWNER", "TALLER_SUPERVISOR"],
  });

  return (
    <main className="os-page">
      <div className="os-page-inner">
        <nav className="os-topbar" aria-label="Navegación administrativa">
          <Link className="os-brand" href="/admin">OS-CAR / ADMIN</Link>
          <Link className="os-back" href="/admin">Volver al panel</Link>
        </nav>
        <section className="os-panel">
          <div className="os-panel-content">
            <p className="os-eyebrow">GESTIÓN DE PERSONAL</p>
            <h1 className="os-title">Equipo del taller</h1>
            <p className="os-lede">
              El registro público está deshabilitado. Para dar de alta un nuevo administrador,
              generá una invitación acá: se crea la cuenta con una contraseña provisoria que
              tenés que comunicarle por un canal seguro (no queda visible después de esta pantalla).
            </p>
            <InviteAdminForm workshopId={workshopId} actorRole={String(adminUser.role)} />
          </div>
        </section>
      </div>
    </main>
  );
}
