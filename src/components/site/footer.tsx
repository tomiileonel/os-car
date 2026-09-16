"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { MapPin, Clock, Phone, Wrench } from "lucide-react";
import { OscarLogo } from "@/components/oscar/logo";
import { WORKSHOP } from "@/lib/oscar";
import { navigate } from "@/lib/router";

const subscribeNoop = () => () => {};

export function SiteFooter() {
  // Fecha client-only (locale/TZ del navegador) sin mismatch de hidratación:
  // useSyncExternalStore renderiza el snapshot del servidor en el primer paint
  // y el del cliente inmediatamente después.
  const today = useSyncExternalStore(
    subscribeNoop,
    () => new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date()),
    () => "--/--/----",
  );
  return (
    <footer className="mt-auto border-t border-carbon-800 bg-carbon-900">
      <div className="h-1 diag-stripes" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* Marca */}
        <div>
          <OscarLogo className="max-w-[220px]" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-steel">
            Diagnóstico computarizado, refrigeración, lubricación y mecánica integral.
            Tu vehículo en manos de especialistas, con seguimiento en vivo y presupuestos claros.
          </p>
          <p className="mt-4 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-lead">
            © {new Date().getFullYear()} {WORKSHOP.name} · Todos los derechos reservados
          </p>
        </div>

        {/* Contacto */}
        <div>
          <h3 className="display-impact mb-4 text-sm text-oscar-yellow">Contacto</h3>
          <ul className="space-y-3 text-sm text-steel">
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-oscar-yellow" aria-hidden />
              <span>{WORKSHOP.address}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-oscar-yellow" aria-hidden />
              <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-oscar-yellow">
                {WORKSHOP.phoneDisplay}
              </Link>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-oscar-yellow" aria-hidden />
              <span>{WORKSHOP.hours}</span>
            </li>
          </ul>
        </div>

        {/* Accesos */}
        <div>
          <h3 className="display-impact mb-4 text-sm text-oscar-yellow">Accesos rápidos</h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <button onClick={() => navigate({ view: "intake" })} className="flex items-center gap-2 text-steel transition-colors hover:text-oscar-yellow">
                <Wrench className="size-3.5" aria-hidden />
                Ingresar mi vehículo
              </button>
            </li>
            <li>
              <button onClick={() => navigate({ view: "seguimiento" })} className="flex items-center gap-2 text-steel transition-colors hover:text-oscar-yellow">
                <Wrench className="size-3.5" aria-hidden />
                Seguimiento en vivo
              </button>
            </li>
            <li>
              <button onClick={() => navigate({ view: "admin-login" })} className="flex items-center gap-2 text-steel transition-colors hover:text-oscar-yellow">
                <Wrench className="size-3.5" aria-hidden />
                Portal del taller
              </button>
            </li>
          </ul>
        </div>
      </div>
      {/* Barra inferior técnica */}
      <div className="border-t border-carbon-800 bg-carbon-950">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-lead sm:px-6">
          <span>OS-CAR WORKSHOP OS · v2.6</span>
          <span className="tabular-nums">Últ. sync {today ?? "—"} · TZ America/Buenos_Aires</span>
        </div>
      </div>
    </footer>
  );
}
