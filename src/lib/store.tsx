import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { buildCrossRef, parseConfig, runAudit, type CrossRef } from "./parser";
import type { AuditFinding, ParsedConfig } from "./parser/types";

interface StoreCtx {
  cfg: ParsedConfig | null;
  xr: CrossRef | null;
  audit: AuditFinding[];
  loadText: (text: string, fileName?: string) => void;
  clear: () => void;
  fileName?: string;
  updatedAt?: Date;
}

const Ctx = createContext<StoreCtx | null>(null);
const LS_KEY = "fw-config-raw-v1";
const LS_NAME = "fw-config-name-v1";

const LS_TIME = "fw-config-time-v1";

export function ConfigStoreProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [updatedAt, setUpdatedAt] = useState<Date | undefined>(undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const r = localStorage.getItem(LS_KEY);
      const n = localStorage.getItem(LS_NAME) ?? undefined;
      const t = localStorage.getItem(LS_TIME);
      if (r) {
        setRaw(r);
        setFileName(n);
        if (t) setUpdatedAt(new Date(t));
      }
    } catch {
      // ignore
    }
  }, []);

  const loadText = useCallback((text: string, name?: string) => {
    const now = new Date();
    setRaw(text);
    setFileName(name);
    setUpdatedAt(now);
    try {
      localStorage.setItem(LS_KEY, text);
      if (name) localStorage.setItem(LS_NAME, name);
      else localStorage.removeItem(LS_NAME);
      localStorage.setItem(LS_TIME, now.toISOString());
    } catch {
      toast.warning("配置过大，浏览器无法保存，刷新页面后需要重新导入。");
    }
  }, []);

  const clear = useCallback(() => {
    setRaw(null);
    setFileName(undefined);
    setUpdatedAt(undefined);
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_NAME);
      localStorage.removeItem(LS_TIME);
    } catch {
      // ignore
    }
  }, []);

  // 仅在原文变化时重新解析，文件名/时间变化不触发
  const parsed = useMemo(() => {
    if (!raw) return { cfg: null, xr: null, audit: [] as AuditFinding[] };
    const cfg = parseConfig(raw);
    const xr = buildCrossRef(cfg);
    return { cfg, xr, audit: runAudit(cfg, xr) };
  }, [raw]);

  const value = useMemo<StoreCtx>(() => {
    const cfg = parsed.cfg ? { ...parsed.cfg, meta: { ...parsed.cfg.meta, fileName } } : null;
    return { ...parsed, cfg, loadText, clear, fileName, updatedAt };
  }, [parsed, fileName, updatedAt, loadText, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfigStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ConfigStoreProvider missing");
  return v;
}
