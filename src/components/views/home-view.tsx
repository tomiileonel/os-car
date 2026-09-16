"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Gauge,
  Thermometer,
  Droplets,
  Disc3,
  CarFront,
  BatteryCharging,
  ArrowRight,
  Radar,
  ClipboardList,
  KeyRound,
  ShieldCheck,
  Users,
  Wrench,
  Timer,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OscarLogo } from "@/components/oscar/logo";
import { KpiTile, TechProgressBar, WorkshopTicker } from "@/components/oscar/kit";
import { api } from "@/lib/api-client";
import { WORKSHOP, money } from "@/lib/oscar";
import { navigate } from "@/lib/router";
import { useState } from "react";

interface PublicStats {
  baysTotal: number;
  baysOccupied: number;
  ordersInProgress: number;
  avgApprovalHours: number | null;
}

const SERVICES = [
  {
    icon: Gauge,
    title: "Inyección Electrónica",
    desc: "Escaneo OBD-II, diagnóstico de sensores y actuadores, limpieza de inyectores.",
    tag: "CHECK ENGINE",
  },
  {
    icon: Thermometer,
    title: "Refrigeración",
    desc: "Radiadores, bombas de agua, termostatos y climatización con carga de gas.",
    tag: "TEMP",
  },
  {
    icon: Droplets,
    title: "Lubricación & Service",
    desc: "Cambios de aceite y filtros con lubricantes sintéticos de primera línea.",
    tag: "OIL",
  },
  {
    icon: Disc3,
    title: "Frenos",
    desc: "Pastillas, discos, bombas y sangrado completo con líquido DOT4.",
    tag: "BRAKES",
  },
  {
    icon: CarFront,
    title: "Suspensión & Dirección",
    desc: "Amortiguadores, terminales, alineación y balanceo computarizado.",
    tag: "CHASSIS",
  },
  {
    icon: BatteryCharging,
    title: "Electricidad",
    desc: "Baterías, alternadores, arranques y diagnóstico de circuitos.",
    tag: "ELEC",
  },
] as const;

export function HomeView() {
  const [code, setCode] = useState("");
  const { data: stats } = useQuery({
    queryKey: ["public-stats"],
    queryFn: () => api.get<PublicStats>("/api/public/stats"),
    refetchInterval: 60_000,
  });

  const baysFree = stats ? stats.baysTotal - stats.baysOccupied : 0;

  return (
    <div className="flex flex-col">
      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden" aria-label="Bienvenida">
        {/* Imagen de fondo */}
        <div className="absolute inset-0" aria-hidden>
          <Image
            src="/hero-garage.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-carbon-950/80 via-carbon-950/60 to-carbon-950" />
          <div className="absolute inset-0 tech-grid" />
        </div>

        <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:pt-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.35fr_1fr]">
            {/* Titular */}
            <div>
              <p className="label-tech mb-3 flex items-center gap-2">
                <span className="led led-green" aria-hidden />
                Taller operativo · {WORKSHOP.address}
              </p>
              <h1 className="display-impact text-4xl text-titanium sm:text-6xl lg:text-7xl">
                Tu auto,
                <br />
                <span className="text-oscar-yellow text-stroke-carbon">en buenas manos</span>
                <br />
                mecánicas.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-steel sm:text-lg">
                Diagnóstico computarizado, reparación y service integral en Posadas.
                Ingresá tu vehículo y <strong className="text-titanium">seguí la reparación en vivo</strong>:
                presupuesto claro, aprobación por línea y registro fotográfico de cada hallazgo.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => navigate({ view: "intake" })}>
                  <ClipboardList className="size-5" aria-hidden />
                  Ingresar mi vehículo
                </Button>
                <Button size="lg" variant="carbon" onClick={() => navigate({ view: "seguimiento" })}>
                  <Radar className="size-5" aria-hidden />
                  Seguir mi auto
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <Phone className="size-4" aria-hidden />
                    WhatsApp
                  </Link>
                </Button>
              </div>

              {/* Acceso operativo directo */}
              <div className="mt-6 flex flex-wrap gap-4 border-t border-carbon-800/80 pt-4 text-xs">
                <div className="flex flex-col gap-0.5">
                  <Link href="/cliente/alta" className="font-semibold text-oscar-yellow hover:underline">
                    Soy cliente
                  </Link>
                  <span className="text-[11px] text-zinc-400">Registrar mi vehículo y acceder al seguimiento.</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Link href="/seguimiento" className="font-semibold text-oscar-yellow hover:underline">
                    Seguir mi vehículo
                  </Link>
                  <span className="text-[11px] text-zinc-400">Consultar el estado, trabajos y costos de mi orden.</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Link href="/admin/login" className="font-semibold text-oscar-yellow hover:underline">
                    Soy admin
                  </Link>
                  <span className="text-[11px] text-zinc-400">Registrarme o ingresar al panel operativo.</span>
                </div>
              </div>

              {/* Quick tracking */}
              <form
                className="mt-8 flex max-w-md items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const c = code.trim();
                  if (c.length >= 8) navigate({ view: "tracking", code: c });
                }}
              >
                <div className="relative flex-1">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Código de seguimiento…"
                    aria-label="Código de seguimiento"
                    className="pr-24 font-mono text-xs uppercase tracking-wider"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 hidden items-center font-mono text-[0.6rem] uppercase tracking-widest text-lead sm:flex">
                    {code.length}/43
                  </span>
                </div>
                <Button type="submit" variant="outline" disabled={code.trim().length < 8} aria-label="Consultar estado">
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </form>
            </div>

            {/* Panel de capacidad */}
            <div className="bevel clip-corner rounded-xl p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="display-impact text-lg text-titanium">Capacidad del taller</h2>
                <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-bay-free">
                  <span className="led led-green" aria-hidden />
                  En vivo
                </span>
              </div>

              <TechProgressBar
                label="Bahías ocupadas"
                value={stats?.baysOccupied ?? 0}
                max={stats?.baysTotal ?? 6}
                tone={baysFree > 0 ? "yellow" : "red"}
              />
              <p className="mt-2 font-mono text-[0.65rem] text-lead">
                {stats ? `${baysFree} de ${stats.baysTotal} bahías libres para ingreso inmediato` : "Sincronizando bahías…"}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-carbon-800 bg-carbon-950/60 p-3">
                  <p className="label-tech">Órdenes activas</p>
                  <p className="display-impact mt-1 text-2xl text-oscar-yellow">{stats?.ordersInProgress ?? "—"}</p>
                </div>
                <div className="rounded-md border border-carbon-800 bg-carbon-950/60 p-3">
                  <p className="label-tech">Respuesta presupuesto</p>
                  <p className="display-impact mt-1 text-2xl text-titanium">
                    {stats?.avgApprovalHours != null ? `${stats.avgApprovalHours.toFixed(1)} h` : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-md border border-oscar-yellow/30 bg-oscar-yellow/5 p-3">
                <ShieldCheck className="size-8 shrink-0 text-oscar-yellow" aria-hidden />
                <p className="text-xs leading-relaxed text-steel">
                  <strong className="text-titanium">Garantía real de trabajo:</strong> control de calidad
                  obligatorio antes de cada entrega.
                </p>
              </div>
            </div>
          </div>

          {/* Tira de confianza */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Años en Posadas" value="15+" icon={Wrench} />
            <KpiTile label="Órdenes / año" value="1.800+" icon={ClipboardList} />
            <KpiTile label="Bahías mecánicas" value={stats?.baysTotal ?? 6} icon={CarFront} />
            <KpiTile label="Clientes que vuelven" value="92%" icon={Users} tone="green" />
          </dl>
        </div>
      </section>

      <WorkshopTicker
        items={[
          "Escaneo OBD-II gratuito con diagnóstico",
          "Hotel de neumáticos con control de dibujo en mm",
          "Aprobá tu presupuesto desde el celular",
          "Flor de Ceibo 1295 · Barrio Itaembé",
          "Servicio de frenos con garantía 6 meses",
          "WhatsApp directo: +54 3764-353566",
        ]}
      />

      {/* ═══════════ SERVICIOS ═══════════ */}
      <section id="servicios" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6" aria-label="Servicios del taller">
        <p className="label-tech mb-2">Lo que hacemos</p>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="display-impact max-w-xl text-3xl text-titanium sm:text-4xl">
            Especialidades <span className="text-oscar-yellow">del taller</span>
          </h2>
          <p className="max-w-md text-sm text-steel">
            Cada servicio sale del mostrador con orden de trabajo, presupuesto detallado y
            seguimiento en vivo. Sin sorpresas.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <article
              key={s.title}
              className="bevel group relative overflow-hidden rounded-lg p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-oscar-yellow/40"
            >
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-oscar-yellow/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-md border border-oscar-yellow/30 bg-oscar-yellow/10 text-oscar-yellow">
                  <s.icon className="size-6" aria-hidden />
                </span>
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-lead">{s.tag}</span>
              </div>
              <h3 className="display-impact mt-4 text-xl text-titanium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-steel">{s.desc}</p>
              <button
                onClick={() => navigate({ view: "intake" })}
                className="mt-4 inline-flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wider text-oscar-yellow/80 transition-colors hover:text-oscar-yellow"
              >
                Reservar service
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ═══════════ PROCESO ═══════════ */}
      <section className="border-y border-carbon-800 bg-carbon-900/50 tech-grid" aria-label="Cómo funciona">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="label-tech mb-2">Cómo funciona</p>
          <h2 className="display-impact mb-10 text-3xl text-titanium sm:text-4xl">
            De la recepción a la <span className="text-oscar-yellow">entrega</span>
          </h2>

          <ol className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ClipboardList,
                title: "01 · Ingresás el vehículo",
                desc: "Cargá tus datos y los del auto desde el celular: patente, kilometraje, combustible y una checklist visual de síntomas. Recibís un código de seguimiento al instante.",
              },
              {
                icon: Gauge,
                title: "02 · Diagnóstico y presupuesto",
                desc: "Asignamos bahía y mecánico. Publicamos el presupuesto desglosado: horas de mano de obra y repuestos, línea por línea. Lo aprobás desde donde estés.",
              },
              {
                icon: KeyRound,
                title: "03 · Reparación y entrega",
                desc: "Vemos el avance en vivo: qué se está haciendo, qué repuesto llegó. Control de calidad obligatorio y entrega con conformidad firmada.",
              },
            ].map((step) => (
              <li key={step.title} className="bevel relative rounded-lg p-6">
                <span className="grid size-12 place-items-center rounded-md border border-oscar-yellow/30 bg-carbon-950 text-oscar-yellow">
                  <step.icon className="size-6" aria-hidden />
                </span>
                <h3 className="display-impact mt-4 text-lg text-titanium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-steel">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══════════ CTA WHATSAPP ═══════════ */}
      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-label="Contacto">
        <div className="bevel-raised clip-corner relative overflow-hidden rounded-xl p-8 sm:p-10">
          <div className="absolute inset-0 tech-grid-fine" aria-hidden />
          <div className="absolute inset-y-0 right-0 hidden w-56 lg:block" aria-hidden>
            <Image src="/tools-board.jpg" alt="" fill sizes="224px" className="object-cover opacity-25 [mask-image:linear-gradient(to_left,black,transparent)]" />
          </div>
          <div className="relative max-w-2xl">
            <h2 className="display-impact text-3xl text-titanium sm:text-4xl">
              ¿Charlamos sobre <span className="text-oscar-yellow">tu vehículo?</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-steel sm:text-base">
              Consultá por tu problema, sacá turno o pedí presupuesto. Te respondemos en el horario
              del taller: {WORKSHOP.hours}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Phone className="size-4" aria-hidden />
                  Escribinos por WhatsApp
                </Link>
              </Button>
              <Button size="lg" variant="carbon" onClick={() => navigate({ view: "intake" })}>
                <Timer className="size-4" aria-hidden />
                Ingreso online
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
