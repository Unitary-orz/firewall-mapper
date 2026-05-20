import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { buildCrossRef, parseConfig, runAudit, type CrossRef } from "./parser";
import type { AuditFinding, ParsedConfig } from "./parser/types";

interface StoreCtx {
  cfg: ParsedConfig | null;
  xr: CrossRef | null;
  audit: AuditFinding[];
  loadText: (text: string, fileName?: string) => void;
  clear: () => void;
  fileName?: string;
}

const Ctx = createContext<StoreCtx | null>(null);
const LS_KEY = "fw-config-raw-v1";
const LS_NAME = "fw-config-name-v1";

export function ConfigStoreProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const r = localStorage.getItem(LS_KEY);
      const n = localStorage.getItem(LS_NAME) ?? undefined;
      if (r) {
        setRaw(r);
        setFileName(n);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadText = useCallback((text: string, name?: string) => {
    setRaw(text);
    setFileName(name);
    try {
      localStorage.setItem(LS_KEY, text);
      if (name) localStorage.setItem(LS_NAME, name);
    } catch {
      // quota
    }
  }, []);

  const clear = useCallback(() => {
    setRaw(null);
    setFileName(undefined);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_NAME);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<StoreCtx>(() => {
    if (!raw)
      return { cfg: null, xr: null, audit: [], loadText, clear, fileName };
    const cfg = parseConfig(raw, fileName);
    const xr = buildCrossRef(cfg);
    const audit = runAudit(cfg, xr);
    return { cfg, xr, audit, loadText, clear, fileName };
  }, [raw, fileName, loadText, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfigStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigStoreProvider missing");
  return v;
}
