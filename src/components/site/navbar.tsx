"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, CarFront, Radar, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OscarLogo } from "@/components/oscar/logo";
import { cn } from "@/lib/utils";
import { navigate, useHashRoute, type Route } from "@/lib/router";

const NAV_ITEMS: Array<{ label: string; route: Route }> = [
  { label: "Inicio", route: { view: "home" } },
  { label: "Servicios", route: { view: "home" } },
  { label: "Ingresar Vehículo", route: { view: "intake" } },
  { label: "Seguimiento", route: { view: "seguimiento" } },
];

export function PublicNavbar() {
  const route = useHashRoute();
  const [open, setOpen] = useState(false);

  const isActive = (r: Route) => r.view === route.view;

  return (
    <header className="sticky top-0 z-40 border-b border-carbon-800 bg-carbon-950/90 backdrop-blur-md">
      <div className="h-0.5 diag-stripes" aria-hidden />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Marca */}
        <button
          onClick={() => navigate({ view: "home" })}
          className="group flex min-w-0 items-center gap-2.5"
          aria-label="Ir al inicio — Taller Mecánico OS-CAR"
        >
          <OscarLogo compact className="size-9 shrink-0 transition-transform group-hover:scale-105" />
          <div className="min-w-0 leading-none">
            <span className="display-impact block text-lg text-oscar-yellow">OS-CAR</span>
            <span className="label-tech hidden sm:block">Taller Mecánico · Posadas</span>
          </div>
        </button>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                if (item.label === "Servicios") {
                  if (route.view === "home") {
                    document.getElementById("servicios")?.scrollIntoView({ behavior: "smooth" });
                  } else {
                    navigate({ view: "home" });
                    setTimeout(() => document.getElementById("servicios")?.scrollIntoView({ behavior: "smooth" }), 120);
                  }
                  return;
                }
                navigate(item.route);
              }}
              className={cn(
                "rounded-md px-3 py-2 font-display text-sm font-semibold uppercase tracking-wider transition-colors",
                isActive(item.route)
                  ? "text-oscar-yellow"
                  : "text-steel hover:bg-carbon-800 hover:text-oscar-yellow",
              )}
            >
              {item.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={() => navigate({ view: "admin-login" })}
          >
            <LogIn className="size-4" aria-hidden />
            Portal Taller
          </Button>
        </nav>

        {/* Acciones mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            variant="carbon"
            size="icon-sm"
            aria-label="Consultar seguimiento"
            onClick={() => navigate({ view: "seguimiento" })}
          >
            <Radar className="size-4" aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            aria-label="Ingresar vehículo"
            onClick={() => navigate({ view: "intake" })}
          >
            <CarFront className="size-4" aria-hidden />
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="carbon" size="icon-sm" aria-label="Abrir menú">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-carbon-800 bg-carbon-900 p-0">
              <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-carbon-800 p-4">
                  <OscarLogo compact className="size-8" />
                  <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Cerrar menú">
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
                <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Menú móvil">
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        setOpen(false);
                        navigate(item.route);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left font-display text-base font-bold uppercase tracking-wide transition-colors",
                        isActive(item.route)
                          ? "border-oscar-yellow/50 bg-oscar-yellow/10 text-oscar-yellow"
                          : "border-transparent text-steel hover:border-carbon-700 hover:bg-carbon-800",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate({ view: "admin-login" });
                    }}
                    className="flex w-full items-center gap-3 rounded-md border border-carbon-700 px-4 py-3 text-left font-display text-base font-bold uppercase tracking-wide text-steel transition-colors hover:border-oscar-yellow/40 hover:text-oscar-yellow"
                  >
                    <LogIn className="size-4" aria-hidden />
                    Portal Taller
                  </button>
                </nav>
                <div className="border-t border-carbon-800 p-4">
                  <p className="label-tech mb-2">WhatsApp directo</p>
                  <Button asChild variant="carbon" className="w-full">
                    <Link href="https://wa.me/543764353566" target="_blank" rel="noopener noreferrer">
                      +54 3764-353566
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
