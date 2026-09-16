"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHashRoute, useScrollTopOnRouteChange, navigate } from "@/lib/router";
import { useSession } from "@/lib/store";
import { PublicNavbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { HomeView } from "@/components/views/home-view";
import { IntakeView } from "@/components/views/intake-view";
import { SeguimientoView } from "@/components/views/seguimiento-view";
import { TrackingView } from "@/components/views/tracking-view";
import { AdminLoginView } from "@/components/admin/admin-login";
import { WorkshopCockpit } from "@/components/admin/cockpit/cockpit";

/**
 * Núcleo administrativo: CENTRO DE MANDO UNIFICADO. Las 5 rutas operativas
 * históricas convergen aquí — la sesión se resuelve antes de montar el
 * cockpit para que nunca haya parpadeo de datos sin autenticar.
 */
function AdminArea({ view }: { view: string }) {
  const { admin, loaded, refresh } = useSession();

  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  // Si ya hay sesión, "admin/login" redirige al cockpit.
  useEffect(() => {
    if (admin && view === "admin-login") navigate({ view: "admin-cockpit" }, { replace: true });
  }, [admin, view]);

  if (!loaded) {
    return (
      <div className="flex min-h-[60vh] flex-1 items-center justify-center">
        <div
          className="tech-grid-fine h-16 w-16 animate-spin rounded-full border-2 border-carbon-700 border-t-oscar-yellow"
          aria-label="Cargando centro de mando"
        />
      </div>
    );
  }

  if (!admin) return <AdminLoginView />;

  return <WorkshopCockpit />;
}

export default function Page() {
  const route = useHashRoute();
  useScrollTopOnRouteChange(route);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  const isAdmin = route.view.startsWith("admin");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        {!isAdmin && <PublicNavbar />}
        <main className="flex flex-1 flex-col">
          {route.view === "home" && <HomeView />}
          {route.view === "intake" && <IntakeView />}
          {route.view === "seguimiento" && <SeguimientoView />}
          {route.view === "tracking" && route.code && <TrackingView code={route.code} />}
          {isAdmin && <AdminArea view={route.view} />}
        </main>
        {!isAdmin && <SiteFooter />}
      </div>
    </QueryClientProvider>
  );
}
