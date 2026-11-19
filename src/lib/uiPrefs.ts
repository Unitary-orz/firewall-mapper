import { useSyncExternalStore } from "react";

type PrefKey =
  | "cfg.showLineNo"
  | "cfg.showFullPortRange"
  | "cfg.showPolicyZone"
  | "cfg.showDisabled"
  | "cfg.hideDisabledRows";

const defaults: Record<PrefKey, boolean> = {
  "cfg.showLineNo": false,
  "cfg.showFullPortRange": false,
  "cfg.showPolicyZone": false,
  "cfg.showDisabled": false,
  "cfg.hideDisabledRows": true,
};

function read(key: PrefKey): boolean {
  if (typeof window === "undefined") return defaults[key];
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return defaults[key];
    return v === "1";
  } catch {
    return defaults[key];
  }
}

const listeners = new Map<PrefKey, Set<() => void>>();

function getListeners(key: PrefKey) {
  let s = listeners.get(key);
  if (!s) {
    s = new Set();
    listeners.set(key, s);
  }
  return s;
}

function makeSubscribe(key: PrefKey) {
  return (cb: () => void) => {
    const s = getListeners(key);
    s.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) cb();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
    }
    return () => {
      s.delete(cb);
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
      }
    };
  };
}

function setPref(key: PrefKey, v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, v ? "1" : "0");
  } catch {
    // ignore
  }
  getListeners(key).forEach((cb) => cb());
}

function useBoolPref(key: PrefKey): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(
    makeSubscribe(key),
    () => read(key),
    () => defaults[key],
  );
  return [v, (nv: boolean) => setPref(key, nv)];
}

export const setShowLineNumbers = (v: boolean) => setPref("cfg.showLineNo", v);
export const useShowLineNumbers = () => useBoolPref("cfg.showLineNo");

export const setShowFullPortRange = (v: boolean) => setPref("cfg.showFullPortRange", v);
export const useShowFullPortRange = () => useBoolPref("cfg.showFullPortRange");

export const setShowPolicyZone = (v: boolean) => setPref("cfg.showPolicyZone", v);
export const useShowPolicyZone = () => useBoolPref("cfg.showPolicyZone");

export const setShowDisabled = (v: boolean) => setPref("cfg.showDisabled", v);
export const useShowDisabled = () => useBoolPref("cfg.showDisabled");

export const setHideDisabledRows = (v: boolean) => setPref("cfg.hideDisabledRows", v);
export const useHideDisabledRows = () => useBoolPref("cfg.hideDisabledRows");
