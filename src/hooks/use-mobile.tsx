import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const listeners = new Set<() => void>();
let mediaQuery: MediaQueryList | null = null;

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mediaQuery.addEventListener("change", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && mediaQuery) {
      mediaQuery.removeEventListener("change", notify);
      mediaQuery = null;
    }
  };
}

function getSnapshot() {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

// All mobile-aware rows share one media-query listener instead of creating a
// separate browser listener for every object and table cell.
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
