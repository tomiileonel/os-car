import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminBootstrapStatus } from "@/server/services/admin-bootstrap.service";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function AdminRegisterPage() {
  const bootstrapStatus = await getAdminBootstrapStatus();

  // Guard server-side: si ya existe al menos un administrador, el registro está cerrado
  // y redirige de inmediato a /admin/login.
  if (!bootstrapStatus.canRegister) {
    redirect("/admin/login");
  }

  return (
    <main className="os-page">
      <div className="os-page-inner" style={{ maxWidth: 520 }}>
        <nav className="os-topbar" aria-label="Navegación principal">
          <Link className="os-brand" href="/">OS-CAR</Link>
          <Link className="os-back" href="/">Volver al inicio</Link>
        </nav>
        <section className="os-panel">
          <RegisterForm />
        </section>
      </div>
    </main>
  );
}


