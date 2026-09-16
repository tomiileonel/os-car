"use client";

import { useState } from "react";
import Link from "next/link";
import { Radar as RadarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/oscar/kit";
import { WORKSHOP } from "@/lib/oscar";
import { navigate } from "@/lib/router";

export function SeguimientoView() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();
  const valid = trimmed.length >= 8 && trimmed.length <= 64;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div className="bevel clip-corner rounded-xl p-7 sm:p-9">
        <SectionHeader
          kicker="Portal del cliente"
          title="Seguí tu vehículo en vivo"
          icon={RadarIcon}
        />
        <p className="-mt-1 mb-6 text-sm leading-relaxed text-steel">
          Ingresá el código de seguimiento que recibiste al dejar tu auto en el taller
          (te lo mostramos al confirmar el ingreso y te lo enviamos por WhatsApp).
        </p>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setError("El código tiene entre 8 y 64 caracteres. Revisalo e intentá de nuevo.");
              return;
            }
            setError(null);
            navigate({ view: "tracking", code: trimmed });
          }}
        >
          <div className="space-y-2">
            <label htmlFor="trackcode" className="label-tech">Código de seguimiento</label>
            <div className="relative">
              <RadarIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-lead" aria-hidden />
              <Input
                id="trackcode"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                placeholder="OSCAR2026…"
                className="pl-10 font-mono text-sm uppercase tracking-wider"
                autoComplete="off"
                autoFocus
                aria-invalid={!!error}
              />
            </div>
            {error && <p className="font-mono text-xs text-oscar-red">{error}</p>}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!valid}>
            Ver estado de mi vehículo
          </Button>
        </form>

        <div className="mt-6 rounded-md border border-carbon-800 bg-carbon-950/50 p-4">
          <p className="label-tech mb-1.5">¿No tenés el código a mano?</p>
          <p className="text-xs leading-relaxed text-steel">
            Escribinos por WhatsApp con tu patente y te lo reenviamos al instante.
          </p>
          <Button asChild variant="carbon" size="sm" className="mt-3">
            <Link href={WORKSHOP.whatsappUrl} target="_blank" rel="noopener noreferrer">
              WhatsApp {WORKSHOP.phoneDisplay}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
