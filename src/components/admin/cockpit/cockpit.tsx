"use client";

/**
 * OS-CAR Cockpit — ORQUESTADOR DEL CENTRO DE MANDO UNIFICADO.
 *
 * Converge los 5 dominios operativos (recepción, bahías, órdenes, almacén,
 * hotel de neumáticos + telemetría) en UNA sola vista de pantalla completa:
 *
 *   ┌────────── HUD: ticker · omnisearch Ctrl+K · rol ──────────┐
 *   ├────────────────────────────┬──────────────────────────────┤
 *   │ WORKBOARD (60-65%)         │ DOCK CONTEXTUAL (35-40%)     │
 *   │ [1] Bahías [2] Fila [3] Kbn│ Ficha · transición · stock   │
 *   ├────────────────────────────┴──────────────────────────────┤
 *   │ ▲ DRAWER RETÁCTIL: stock bajo mínimo · outbox worker       │
 *   └────────────────────────────────────────────────────────────┘
 *
 * La URL (#/admin) es la única fuente de verdad de pestaña y orden
 * seleccionada (deep-links compartibles). Atajos: 1/2/3, Ctrl+K, Esc.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api-client";
import { navigate, useHashRoute, type CockpitPanel, type CockpitTab, type Route } from "@/lib/router";
import { useNow } from "@/lib/clock";
import { useSession } from "@/lib/store";
import { CockpitHud } from "@/components/admin/cockpit/hud";
import { CockpitOmnisearch } from "@/components/admin/cockpit/omnisearch";
import { CockpitWorkboard } from "@/components/admin/cockpit/workboard";
import { CockpitDock, DockPlaceholder } from "@/components/admin/cockpit/dock";
import { CockpitBottomDrawer, CockpitDrawerPanel } from "@/components/admin/cockpit/bottom-drawer";
import { QuickIntakeDialog } from "@/components/admin/cockpit/quick-intake";
import {
  ROLE_STORAGE_KEY,
  startOfToday,
  type BayDTO,
  type CockpitRole,
  type IntakePrefill,
  type OrdersListDTO,
  type OverviewDTO,
  type TireSetDTO,
} from "@/components/admin/cockpit/shared";

export function WorkshopCockpit() {
  const route = useHashRoute();
  const queryClient = useQueryClient();
  const { setAdmin } = useSession();

  /* La ruta del cockpit (primer render puede ser la neutra de hidratación). */
  const cockpit: Extract<Route, { view: "admin-cockpit" }> =
    route.view === "admin-cockpit" ? route : { view: "admin-cockpit" };
  const selectedOrderId = cockpit.orderId ?? null;

  /* ─── Estado local (rol persistente, overlays) ─── */
  /* El cockpit solo monta en cliente (la SSR pinta el portal público),
     por lo que la lectura de localStorage en el inicializador es segura. */
  const [role, setRole] = useState<CockpitRole>(() => {
    if (typeof window === "undefined") return "jefe";
    try {
      return window.localStorage.getItem(ROLE_STORAGE_KEY) === "piso" ? "piso" : "jefe";
    } catch {
      return "jefe";
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<CockpitPanel>("stock");
  const [quickIntake, setQuickIntake] = useState<{ open: boolean; prefill: IntakePrefill | null }>({ open: false, prefill: null });

  /* Deep-link de panel (almacén/telemetría) → ajuste de estado durante render
     (patrón oficial “adjust state when props change”) y consumo del hash en
     un efecto que solo navega — sin setState síncrono en efectos. */
  const routePanel = cockpit.panel ?? null;
  const [consumedPanel, setConsumedPanel] = useState<CockpitPanel | null>(null);
  if (routePanel && routePanel !== consumedPanel) {
    setConsumedPanel(routePanel);
    setDrawerPanel(routePanel);
    setDrawerOpen(true);
  } else if (!routePanel && consumedPanel !== null) {
    setConsumedPanel(null);
  }

  useEffect(() => {
    if (routePanel) {
      navigate({ view: "admin-cockpit", tab: cockpit.tab }, { replace: true });
    }
  }, [routePanel, cockpit.tab]);

  const changeRole = useCallback((next: CockpitRole) => {
    setRole(next);
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      /* noop */
    }
    if (next === "piso" && cockpit.tab === "recepcion") {
      navigate({ view: "admin-cockpit", tab: "bahias" }, { replace: true });
    }
  }, [cockpit.tab]);

  /* Deep-link de panel consumido arriba (ajuste durante render). */

  /* ─── Navegación (URL = fuente de verdad) ─── */
  const switchTab = useCallback(
    (tab: CockpitTab) => {
      navigate({ view: "admin-cockpit", tab, orderId: cockpit.orderId }, { replace: true });
    },
    [cockpit.orderId],
  );

  const selectOrder = useCallback(
    (orderId: string) => {
      navigate({ view: "admin-cockpit", tab: cockpit.tab, orderId }, { replace: true });
    },
    [cockpit.tab],
  );

  const clearSelection = useCallback(() => {
    navigate({ view: "admin-cockpit", tab: cockpit.tab }, { replace: true });
  }, [cockpit.tab]);

  const openPanel = useCallback((panel: CockpitPanel) => {
    setDrawerPanel(panel);
    setDrawerOpen(true);
  }, []);

  const openQuickIntake = useCallback((prefill?: IntakePrefill) => {
    setQuickIntake({ open: true, prefill: prefill ?? null });
  }, []);

  /* ─── Atajos de teclado globales ─── */
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing) return;

      if (e.key === "Escape") {
        // Si hay un dialog Radix abierto (omnisearch, wizard, altas), lo cierra él.
        if (document.querySelector('[data-state="open"][role="dialog"]')) return;
        if (drawerOpen) {
          setDrawerOpen(false);
          return;
        }
        if (selectedOrderId) {
          clearSelection();
        }
        return;
      }
      if (e.key === "1") switchTab("bahias");
      else if (e.key === "2" && role === "jefe") switchTab("recepcion");
      else if (e.key === "3") switchTab("ordenes");
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [role, drawerOpen, selectedOrderId, clearSelection, switchTab]);

  /* ─── Telemetría del taller (queries compartidas por cache-key) ─── */
  const now = useNow(30_000);

  const { data: overview } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => api.get<OverviewDTO>("/api/admin/overview"),
    refetchInterval: 30_000,
  });

  const { data: baysData } = useQuery({
    queryKey: ["admin-bays"],
    queryFn: () => api.get<{ bays: BayDTO[] }>("/api/admin/bays"),
    refetchInterval: 15_000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ["admin-orders", ""],
    queryFn: () => api.get<OrdersListDTO>("/api/admin/orders"),
    refetchInterval: 20_000,
  });

  const { data: waitingData } = useQuery({
    queryKey: ["admin-orders", "INGRESADO"],
    queryFn: () => api.get<OrdersListDTO>("/api/admin/orders?status=INGRESADO"),
    refetchInterval: 20_000,
  });

  const { data: tireData } = useQuery({
    queryKey: ["tire-hotel", "custody-list"],
    queryFn: () => api.get<{ sets: TireSetDTO[] }>("/api/admin/tire-hotel?status=EN_CUSTODIA"),
    refetchInterval: 60_000,
  });

  const bays = baysData?.bays ?? [];
  const orders = ordersData?.items ?? [];
  const waiting = waitingData?.items ?? [];
  const tiresInCustody = tireData?.sets.length ?? 0;

  const waitingParts = overview?.ordersByStatus?.ESPERANDO_REPARACION ?? 0;
  const activeOrders = orders.filter((o) => o.status !== "ENTREGADO" && o.status !== "CANCELADA").length;

  const todayBilling = useMemo<number | null>(() => {
    if (!now || orders.length === 0) return null;
    const start = startOfToday(now);
    return orders
      .filter((o) => new Date(o.openedAt).getTime() >= start)
      .reduce((acc, o) => acc + (o.totalEstimated ?? 0), 0);
  }, [orders, now]);

  /* ─── Sesión ─── */
  const logout = useCallback(async () => {
    try {
      await api.post("/api/admin/auth/logout");
    } catch {
      /* la sesión expira igualmente */
    }
    setAdmin(null);
    navigate({ view: "home" });
  }, [setAdmin]);

  const handleIntakeDone = useCallback(
    (orderId: string) => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-bays"] });
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      selectOrder(orderId);
    },
    [queryClient, selectOrder],
  );

  const tab: CockpitTab = role === "piso" && cockpit.tab === "recepcion" ? "bahias" : cockpit.tab ?? "bahias";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-carbon-950" role="application" aria-label="Centro de mando del taller OS-CAR">
      {/* ═══ ZONA SUPERIOR — HUD ═══ */}
      <CockpitHud
        role={role}
        onRoleChange={changeRole}
        onOpenSearch={() => setSearchOpen(true)}
        onLogout={logout}
        baysTotal={bays.length}
        baysOccupied={bays.filter((b) => b.current).length}
        waitingParts={waitingParts}
        pendingApprovals={overview?.pendingApprovals ?? 0}
        tiresInCustody={tiresInCustody}
        todayBilling={todayBilling}
        activeOrders={activeOrders}
      />

      {/* ═══ ZONA CENTRAL — Workboard + Dock ═══ */}
      <div className="relative flex min-h-0 flex-1">
        <CockpitWorkboard
          role={role}
          tab={tab}
          onTabChange={switchTab}
          now={now}
          bays={bays}
          waiting={waiting}
          orders={orders}
          selectedOrderId={selectedOrderId}
          onSelectOrder={selectOrder}
          onOpenQuickIntake={() => openQuickIntake()}
          todayIntakes={overview?.todayIntakes ?? null}
          pendingApprovals={overview?.pendingApprovals ?? null}
          overlay={
            <CockpitDrawerPanel
              role={role}
              open={drawerOpen}
              panel={drawerPanel}
              onPanelChange={setDrawerPanel}
            />
          }
        />

        {/* Dock persistente desktop (35-40%) */}
        <aside
          className="hidden w-[38%] min-w-[340px] max-w-[520px] shrink-0 border-l border-carbon-800 bg-carbon-900/30 lg:flex xl:w-[40%]"
          aria-label="Dock contextual de ficha y logística"
        >
          {selectedOrderId ? (
            <CockpitDock orderId={selectedOrderId} onClose={clearSelection} role={role} onOpenPanel={openPanel} />
          ) : (
            <DockPlaceholder />
          )}
        </aside>

        {/* Dock overlay móvil (tablet / piso con guantes) */}
        <AnimatePresence>
          {selectedOrderId && (
            <motion.div
              key="cockpit-dock-overlay"
              className="fixed inset-0 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.button
                className="absolute inset-0 bg-carbon-950/80 backdrop-blur-sm"
                onClick={clearSelection}
                aria-label="Cerrar ficha"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-carbon-800 bg-carbon-900 shadow-2xl"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              >
                <CockpitDock orderId={selectedOrderId} onClose={clearSelection} role={role} onOpenPanel={openPanel} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ ZONA INFERIOR — Drawer retráctil ═══ */}
      <CockpitBottomDrawer
        role={role}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        panel={drawerPanel}
        onPanelChange={setDrawerPanel}
      />

      {/* ═══ Overlays ═══ */}
      <CockpitOmnisearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        orders={orders}
        onSelectOrder={selectOrder}
        onPrefillIntake={(prefill) => openQuickIntake(prefill)}
        onOpenPanel={openPanel}
      />

      <QuickIntakeDialog
        open={quickIntake.open}
        onOpenChange={(v) => setQuickIntake((s) => ({ ...s, open: v }))}
        prefill={quickIntake.prefill}
        bays={bays}
        onDone={handleIntakeDone}
      />
    </div>
  );
}
