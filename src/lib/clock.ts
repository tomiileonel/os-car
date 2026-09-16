"use client";

/**
 * OS-CAR — Reloj externo hidration-safe para el Cockpit Unificado.
 *
 * Patrón `useSyncExternalStore`: el snapshot del servidor es SIEMPRE 0 y el
 * ticker solo arranca tras el primer subscribe en el cliente, por lo que el
 * HTML del SSR y el primer render del cliente coinciden (cero hydration
 * mismatch en timers "en vivo" de bahías, kanban y HUD).
 */
import { useSyncExternalStore } from "react";

const SERVER_SNAPSHOT = 0;

interface Ticker {
  snapshot: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}

const tickers = new Map<number, Ticker>();
const subscribeCache = new Map<number, (listener: () => void) => () => void>();
const snapshotCache = new Map<number, () => number>();

function getTicker(ms: number): Ticker {
  let ticker = tickers.get(ms);
  if (!ticker) {
    ticker = { snapshot: 0, listeners: new Set(), timer: null };
    tickers.set(ms, ticker);
  }
  return ticker;
}

function startTicker(ticker: Ticker, ms: number): void {
  if (ticker.timer) return;
  ticker.snapshot = Date.now();
  ticker.timer = setInterval(() => {
    const next = Date.now();
    if (next !== ticker.snapshot) {
      ticker.snapshot = next;
      ticker.listeners.forEach((listener) => listener());
    }
  }, ms);
}

function stopTicker(ticker: Ticker): void {
  if (ticker.timer && ticker.listeners.size === 0) {
    clearInterval(ticker.timer);
    ticker.timer = null;
  }
}

function getSubscribe(ms: number): (listener: () => void) => () => void {
  let subscribe = subscribeCache.get(ms);
  if (!subscribe) {
    subscribe = (listener: () => void) => {
      const ticker = getTicker(ms);
      ticker.listeners.add(listener);
      startTicker(ticker, ms);
      return () => {
        ticker.listeners.delete(listener);
        stopTicker(ticker);
      };
    };
    subscribeCache.set(ms, subscribe);
  }
  return subscribe;
}

function getSnapshot(ms: number): () => number {
  let snapshot = snapshotCache.get(ms);
  if (!snapshot) {
    snapshot = () => getTicker(ms).snapshot;
    snapshotCache.set(ms, snapshot);
  }
  return snapshot;
}

/**
 * Timestamp `Date.now()` en ms, actualizado cada `intervalMs`.
 * Devuelve 0 durante SSR / primer render (los componentes deben tratarlo
 * como "reloj no disponible" y pintar un valor neutro).
 */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    getSubscribe(intervalMs),
    getSnapshot(intervalMs),
    () => SERVER_SNAPSHOT,
  );
}
