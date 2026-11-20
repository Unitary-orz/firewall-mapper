import { useSyncExternalStore } from "react";

type PrefKey =
  | "cfg.showLineNo"
  | "cfg.showFullPortRange"
  | "cfg.showPolicyZone"
  | "cfg.showDisabled"
  | "cfg.hideDisabledRows"
  | "cfg.hideUnassociated"
  | "cfg.showFocusStats";

const defaults: Record<PrefKey, boolean> = {
  "cfg.showLineNo": false,
  "cfg.showFullPortRange": false,
  "cfg.showPolicyZone": false,
  "cfg.showDisabled": false,
  "cfg.hideDisabledRows": true,
  "cfg.hideUnassociated": false,
  "cfg.showFocusStats": true,
};

function read(key: PrefKey): boolean {
  if (typeof window === "undefined") return defaults[key];
  try {
    // cfg.hideDisabledRows 是策略表格曾使用的旧键。优先读取它，保留用户
    // 上一次的选择；之后两个键会一起写入，全站共用 cfg.showDisabled。
    if (key === "cfg.showDisabled") {
      const legacy = window.localStorage.getItem("cfg.hideDisabledRows");
      if (legacy !== null) return legacy === "0";
    }
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
    if (key === "cfg.showDisabled") {
      window.localStorage.setItem("cfg.hideDisabledRows", v ? "0" : "1");
    }
  } catch {
    // ignore
  }
  getListeners(key).forEach((cb) => cb());
  if (key === "cfg.showDisabled") {
    getListeners("cfg.hideDisabledRows").forEach((cb) => cb());
  }
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

// 兼容策略表格的“隐藏”语义，底层与 NAT、搜索和关系图共用同一偏好。
export const setHideDisabledRows = (v: boolean) => setPref("cfg.showDisabled", !v);
export const useHideDisabledRows = (): [boolean, (v: boolean) => void] => {
  const [showDisabled, setShowDisabled] = useShowDisabled();
  return [!showDisabled, (v: boolean) => setShowDisabled(!v)];
};

// 访问关系中「未关联策略」的流量是否隐藏；默认不勾选，即照常显示。
export const setHideUnassociated = (v: boolean) => setPref("cfg.hideUnassociated", v);
export const useHideUnassociated = () => useBoolPref("cfg.hideUnassociated");

// 访问关系页的候选统计：顶部「候选 N · 全量 FlowGroup N」以及每个候选的命中数。
export const setShowFocusStats = (v: boolean) => setPref("cfg.showFocusStats", v);
export const useShowFocusStats = () => useBoolPref("cfg.showFocusStats");
