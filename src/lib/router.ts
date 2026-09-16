"use client";

/**
 * OS-CAR — Router hash de la SPA.
 *
 * El núcleo administrativo vive en un CENTRO DE MANDO UNIFICADO (#/admin):
 * las 5 rutas operativas históricas (recepcion, bahias, ordenes, almacen,
 * hotel-neumaticos + telemetria) CONVERGEN en el Cockpit. Los hashes legacy
 * siguen resolviendo (deep-links compatibles) como hints de pestaña/panel.
 */
import { useEffect, useState, useCallback } from "react";

export type CockpitTab = "bahias" | "recepcion" | "ordenes";
export type CockpitPanel = "stock" | "outbox";

export type Route =
  | { view: "home" }
  | { view: "intake" }
  | { view: "seguimiento" }
  | { view: "tracking"; code: string }
  | { view: "admin-login" }
  | { view: "admin-cockpit"; tab?: CockpitTab; orderId?: string; panel?: CockpitPanel };

/** Ruta inicial neutra — coincide con el SSR (siempre la vista pública home). */
const INITIAL_ROUTE: Route = { view: "home" };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  const segments = clean.split("/").filter(Boolean).map(decodeURIComponent);

  if (segments.length === 0) return { view: "home" };

  if (segments[0] === "cliente" && segments[1] === "alta") return { view: "intake" };
  if (segments[0] === "seguimiento") return { view: "seguimiento" };
  if (segments[0] === "tracking" && segments[1]) return { view: "tracking", code: segments[1] };

  if (segments[0] === "admin") {
    if (segments[1] === "login") return { view: "admin-login" };
    if (segments[1] === "recepcion") {
      return segments[2]
        ? { view: "admin-cockpit", tab: "recepcion", orderId: segments[2] }
        : { view: "admin-cockpit", tab: "recepcion" };
    }
    if (segments[1] === "ordenes") {
      if (segments[2]) return { view: "admin-cockpit", tab: "ordenes", orderId: segments[2] };
      return { view: "admin-cockpit", tab: "ordenes" };
    }
    if (segments[1] === "bahias") {
      return segments[2]
        ? { view: "admin-cockpit", tab: "bahias", orderId: segments[2] }
        : { view: "admin-cockpit", tab: "bahias" };
    }
    if (segments[1] === "almacen") return { view: "admin-cockpit", panel: "stock" };
    if (segments[1] === "telemetria") return { view: "admin-cockpit", panel: "outbox" };
    // hotel-neumaticos y cualquier otra variante → cockpit por defecto.
    return { view: "admin-cockpit" };
  }

  return { view: "home" };
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case "home":
      return "#/";
    case "intake":
      return "#/cliente/alta";
    case "seguimiento":
      return "#/seguimiento";
    case "tracking":
      return `#/tracking/${encodeURIComponent(route.code)}`;
    case "admin-login":
      return "#/admin/login";
    case "admin-cockpit": {
      // La pestaña se conserva al seleccionar una orden (cero pérdida de contexto).
      if (route.orderId) return `#/admin/${route.tab ?? "ordenes"}/${encodeURIComponent(route.orderId)}`;
      if (route.panel === "stock") return "#/admin/almacen";
      if (route.panel === "outbox") return "#/admin/telemetria";
      if (route.tab === "recepcion") return "#/admin/recepcion";
      if (route.tab === "ordenes") return "#/admin/ordenes";
      return "#/admin/bahias";
    }
  }
}

export function navigate(route: Route, opts?: { replace?: boolean }): void {
  const hash = routeToHash(route);
  if (opts?.replace) {
    window.history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

/**
 * Nota: la ruta se resuelve DESPUÉS del montaje (nunca en el primer render)
 * para que el HTML del servidor y el primer render del cliente coincidan
 * y no haya hydration mismatch. El SSR siempre pinta la vista pública home;
 * al montarse, se aplica el hash real.
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(INITIAL_ROUTE);

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return route;
}

/** Scroll a tope en cada cambio de vista. */
export function useScrollTopOnRouteChange(route: Route): void {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [route.view, "code" in route ? route.code : "", "orderId" in route ? route.orderId : "", "panel" in route ? route.panel : ""]);
}

export const go = navigate;
export const useNavigate = (): ((route: Route, opts?: { replace?: boolean }) => void) =>
  useCallback((route: Route, opts?: { replace?: boolean }) => navigate(route, opts), []);
