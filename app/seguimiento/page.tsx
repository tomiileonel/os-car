import Link from "next/link";
import TrackingForm from "./TrackingForm";

export const metadata = {
  title: "Seguimiento | OS-CAR",
  description: "Consultá el estado público de tu reparación.",
};

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="os-page">
      <div className="os-page-inner">
        <nav className="os-topbar" aria-label="Navegación principal">
          <Link className="os-brand" href="/">OS-CAR</Link>
          <Link className="os-back" href="/">Volver al inicio</Link>
        </nav>
        <section className="os-panel">
          <div className="os-panel-content">
            <p className="os-eyebrow">SEGUIMIENTO PÚBLICO</p>
            <h1 className="os-title">Seguí tu vehículo</h1>
            <p className="os-lede">
              Pegá el código que recibiste al ingresar el vehículo. No usamos teléfono ni patente como contraseña.
            </p>
            <TrackingForm initialToken={params.token ?? ""} />
          </div>
        </section>
      </div>
    </main>
  );
}
