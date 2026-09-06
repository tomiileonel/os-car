import Link from "next/link";
import IntakeForm from "./IntakeForm";

export const metadata = {
  title: "Alta de vehículo | OS-CAR",
  description: "Registrá tu vehículo para iniciar el seguimiento de la reparación.",
};

export default function CustomerIntakePage() {
  return (
    <main className="os-page">
      <div className="os-page-inner">
        <nav className="os-topbar" aria-label="Navegación principal">
          <Link className="os-brand" href="/">OS-CAR</Link>
          <Link className="os-back" href="/">Volver al inicio</Link>
        </nav>
        <section className="os-panel">
          <div className="os-panel-content">
            <p className="os-eyebrow">RECEPCIÓN DIGITAL</p>
            <h1 className="os-title">Dejá los datos de tu vehículo</h1>
            <p className="os-lede">
              Completá este formulario. El taller recibirá la información y te vamos a entregar un acceso privado para seguir la orden.
            </p>
            <IntakeForm />
          </div>
        </section>
      </div>
    </main>
  );
}
