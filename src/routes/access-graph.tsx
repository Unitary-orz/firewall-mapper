import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import type { CrossRef } from "@/lib/parser";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { useShowFullPortRange, useShowLineNumbers, useShowPolicyZone } from "@/lib/uiPrefs";
import React, { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, ChevronsUpDown, ChevronDown, X, Layers } from "lucide-react";
import {
  getFlows,
  getFocusLines,
  classifyIntermediary,
  CAT_LABEL,
  focusCandidates,
  filterLinesByFocus,
  isIpLiteral,
  type FocusLine,
  type FocusType,
  type FocusCandidate,
  type FlowDnatEntry,
} from "@/lib/access";
import { ObjectName } from "@/components/ObjectPreview";
import { cn } from "@/lib/utils";

import { groupBy, FocusLineRow, NodeChip, SvcChip } from "@/components/access/FocusRows";
interface SearchParams {
  focus?: FocusType;
  id?: string;
  // legacy params (migrated on mount)
  src?: string;
  dst?: string;
  svc?: string;
}

export const Route = createFileRoute("/access-graph")({
  head: () => ({
    meta: [
      { title: "访问路径分析 · 防火墙配置审计台" },
      {
        name: "description",
        content: "三入口（源/目的/服务）+ 横向 Focus Graph，按 FlowGroup 聚合策略与 NAT。",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => {
    const f = s.focus;
    return {
      focus: f === "src" || f === "dst" || f === "svc" ? f : undefined,
      id: typeof s.id === "string" ? s.id : undefined,
      src: typeof s.src === "string" ? s.src : undefined,
      dst: typeof s.dst === "string" ? s.dst : undefined,
      svc: typeof s.svc === "string" ? s.svc : undefined,
    };
  },
  component: AccessGraphPage,
});

const FOCUS_LABEL: Record<FocusType, string> = {
  src: "源",
  dst: "目的",
  svc: "服务",
};

const FOCUS_PLACEHOLDER: Record<FocusType, string> = {
  src: "选择 / 搜索来源对象 / 输入 IP",
  dst: "选择 / 搜索目的对象 / 输入 IP",
  svc: "选择 / 搜索服务端口 (tcp/443)",
};

function AccessGraphPage() {
  const { cfg, xr } = useConfigStore();
  const search = useSearch({ from: "/access-graph" });
  const navigate = useNavigate({ from: "/access-graph" });

  const focus: FocusType = search.focus ?? "dst";
  const id = search.id ?? "";

  // legacy params → migrate once
  useEffect(() => {
    if (search.focus || (!search.src && !search.dst && !search.svc)) return;
    const migrated: { focus: FocusType; id: string } | null = search.dst
      ? { focus: "dst", id: search.dst }
      : search.src
        ? { focus: "src", id: search.src }
        : search.svc
          ? { focus: "svc", id: search.svc }
          : null;
    if (!migrated) return;
    navigate({
      search: { focus: migrated.focus, id: migrated.id },
      replace: true,
    });
  }, [search, navigate]);

  const setFocus = (next: FocusType) => {
    if (next === focus) return;
    navigate({ search: { focus: next, id: undefined }, replace: true });
  };
  const setId = (next: string) => {
    navigate({
      search: { focus, id: next && next.length > 0 ? next : undefined },
      replace: true,
    });
  };

  const allLines = useMemo(() => (cfg ? getFocusLines(cfg) : []), [cfg]);
  const candidates = useMemo(() => focusCandidates(allLines, focus), [allLines, focus]);
  const lines = useMemo(
    () => (cfg ? filterLinesByFocus(allLines, focus, id, cfg) : []),
    [allLines, focus, id, cfg],
  );

  if (!cfg) return <EmptyConfig />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">访问路径分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          先选一个上下文（源 / 目的 / 服务），下方展示局部横向 Focus Graph： 来源 → NAT/直连 → 目的
          → 服务端口/动作，按 FlowGroup 聚合。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <FocusTabs focus={focus} onChange={setFocus} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FocusPicker focus={focus} value={id} options={candidates} onChange={setId} xr={xr} />
          {id && (
            <span className="text-xs text-muted-foreground">
              命中 <b className="text-foreground">{lines.length}</b> 条 FlowGroup
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            候选 {candidates.length} · 全量 FlowGroup {allLines.length}
          </span>
        </div>
      </div>

      {!id ? (
        <FocusEmpty focus={focus} candidates={candidates} onPick={setId} />
      ) : (
        <FocusGraph focus={focus} id={id} lines={lines} />
      )}
    </div>
  );
}

// ---------- top tabs ----------

function FocusTabs({ focus, onChange }: { focus: FocusType; onChange: (f: FocusType) => void }) {
  const tabs: { id: FocusType; label: string; hint: string }[] = [
    { id: "src", label: "Source", hint: "一个来源的访问面" },
    { id: "dst", label: "Destination", hint: "一个目的的暴露面" },
    { id: "svc", label: "Service", hint: "一个端口的暴露范围" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-secondary/30 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "flex flex-col items-start rounded-md px-3 py-1.5 text-left transition",
            focus === t.id
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="text-sm font-medium">{t.label}</span>
          <span className="text-[10px] text-muted-foreground">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- focus picker (top single-select) ----------

function FocusPicker({
  focus,
  value,
  options,
  onChange,
  xr,
}: {
  focus: FocusType;
  value: string;
  options: FocusCandidate[];
  onChange: (v: string) => void;
  xr?: CrossRef | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = options.filter((o) => {
    const q = query.toLowerCase();
    if (o.id.toLowerCase().includes(q)) return true;
    // if query is IP literal, also match candidates whose object names contain this IP (via xr.ipToNames)
    if ((isIpLiteral(query) || /^[a-z]+\//i.test(query)) && xr) {
      const names = xr.ipToNames.get(query) ?? [];
      if (names.includes(o.id)) return true;
    }
    return false;
  });
  const showLiteral =
    query.length > 0 &&
    !options.some((o) => o.id === query) &&
    (isIpLiteral(query) || /^[a-z]+\/\d+/i.test(query));

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-72 justify-between font-mono text-xs"
          >
            <span className={value ? "" : "text-muted-foreground"}>
              {value || `选择${FOCUS_LABEL[focus]}…`}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={FOCUS_PLACEHOLDER[focus]}
              className="h-9 text-xs"
            />
            <CommandList>
              <CommandEmpty className="py-4 text-xs">没有符合的选项</CommandEmpty>
              {showLiteral && (
                <CommandGroup heading="字面值">
                  <CommandItem
                    value={query}
                    onSelect={() => {
                      onChange(query);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="text-xs"
                  >
                    <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                    使用 <span className="ml-1 font-mono">{query}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading={`候选 (${filtered.length})`}>
                {filtered.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onChange(o.id === value ? "" : o.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === o.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span
                      className={cn("flex-1 font-mono", o.id === "any" && "text-muted-foreground")}
                    >
                      {o.id}
                    </span>
                    <span className="ml-2 text-[10px] text-muted-foreground">{o.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onChange("")}
          title="清除"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ---------- empty state with quick-pick ----------

function FocusEmpty({
  focus,
  candidates,
  onPick,
}: {
  focus: FocusType;
  candidates: FocusCandidate[];
  onPick: (v: string) => void;
}) {
  const top = candidates.filter((c) => c.id !== "any").slice(0, 12);
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8">
      <p className="text-center text-sm text-muted-foreground">
        请在上方选择一个 <b>{FOCUS_LABEL[focus]}</b> 对象以查看 Focus Graph
      </p>
      {top.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-center text-xs text-muted-foreground">常用候选（按命中数）</div>
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-1.5">
            {top.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-xs hover:border-primary/50 hover:bg-primary/5"
              >
                {c.id}
                <span className="ml-1.5 text-[10px] text-muted-foreground">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- focus graph dispatcher ----------

function FocusGraph({ focus, id, lines }: { focus: FocusType; id: string; lines: FocusLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        所选 <b className="font-mono">{id}</b> 没有任何 FlowGroup。
      </div>
    );
  }
  if (focus === "dst") return <DstFocusView dst={id} lines={lines} />;
  if (focus === "src") return <SrcFocusView src={id} lines={lines} />;
  return <SvcFocusView svc={id} lines={lines} />;
}

// ---------- Source focus: grouped by dst ----------

function SrcFocusView({ src, lines }: { src: string; lines: FocusLine[] }) {
  const byDst = useMemo(() => groupBy(lines, (l) => l.dst), [lines]);
  return (
    <div className="space-y-3">
      <FocusHeader anchor={{ name: src, role: "src" }} count={lines.length} />
      {[...byDst.entries()].map(([dst, rows]) => (
        <FocusCard key={dst}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>目的</span>
            <NodeChip name={dst} role="dst" />
            <GroupSummary rows={rows} />
          </div>
          <div className="space-y-1.5">
            {sortRows(rows).map((l) => (
              <FocusLineRow key={l.key} line={l} hideSrc={false} mutedDst />
            ))}
          </div>
        </FocusCard>
      ))}
    </div>
  );
}

function GroupSummary({ rows }: { rows: FocusLine[] }) {
  const total = rows.length;
  const natRows = rows.filter((r) => r.nat.length > 0).length;
  const permitRows = rows.filter((r) => r.action === "permit").length;
  const denyRows = rows.filter((r) => r.action === "deny").length;
  const associatedRows = rows.filter((r) => r.action === "associated").length;
  const unassociatedRows = rows.filter((r) => r.action === "unassociated").length;
  const parts: { label: string; cls?: string }[] = [{ label: `${total} 条` }];
  if (natRows > 0)
    parts.push({ label: `DNAT ${natRows}`, cls: "text-amber-700 dark:text-amber-300" });
  if (associatedRows > 0)
    parts.push({
      label: `已关联 ${associatedRows}`,
      cls: "text-emerald-700 dark:text-emerald-300",
    });
  if (unassociatedRows > 0)
    parts.push({
      label: `未关联 ${unassociatedRows}`,
      cls: "text-amber-700 dark:text-amber-300 font-medium",
    });
  if (permitRows > 0)
    parts.push({ label: `permit ${permitRows}`, cls: "text-emerald-700 dark:text-emerald-300" });
  if (denyRows > 0) parts.push({ label: `deny ${denyRows}`, cls: "text-destructive" });
  return (
    <span
      className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground"
      title="DNAT 转化后的目的+后端端口是否被任一 permit 策略覆盖"
    >
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="opacity-40">·</span>}
          <span className={p.cls}>{p.label}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

// ---------- Destination focus: multi-source fan-in ----------

function DstFocusView({ dst, lines }: { dst: string; lines: FocusLine[] }) {
  const bySrc = useMemo(() => groupBy(lines, (l) => l.src), [lines]);
  return (
    <div className="space-y-3">
      <FocusHeader anchor={{ name: dst, role: "dst" }} count={lines.length} />
      <FocusCard>
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>暴露面</span>
          <NodeChip name={dst} role="dst" />
        </div>
        <div className="space-y-3">
          {[...bySrc.entries()].map(([src, rows]) => (
            <div key={src} className="rounded-md border border-border/60 p-2">
              <div className="mb-1.5 flex items-center gap-2">
                <NodeChip name={src} role="src" />
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {rows.length} 条 → {dst}
                </span>
              </div>
              <div className="space-y-1.5">
                {sortRows(rows).map((l) => (
                  <FocusLineRow key={l.key} line={l} hideSrc mutedDst />
                ))}
              </div>
            </div>
          ))}
        </div>
      </FocusCard>
    </div>
  );
}

// ---------- Service focus: grouped by dst ----------

function SvcFocusView({ svc, lines }: { svc: string; lines: FocusLine[] }) {
  const byDst = useMemo(() => groupBy(lines, (l) => l.dst), [lines]);
  return (
    <div className="space-y-3">
      <FocusHeader anchor={{ name: svc, role: "svc" }} count={lines.length} />
      {[...byDst.entries()].map(([dst, rows]) => (
        <FocusCard key={dst}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>目的</span>
            <NodeChip name={dst} role="dst" />
            <GroupSummary rows={rows} />
          </div>
          <div className="space-y-1.5">
            {sortRows(rows).map((l) => (
              <FocusLineRow key={l.key} line={l} hideSrc={false} hideSvc mutedDst />
            ))}
          </div>
        </FocusCard>
      ))}
    </div>
  );
}

// ---------- shared atoms ----------

function FocusHeader({
  anchor,
  count,
}: {
  anchor: { name: string; role: "src" | "dst" | "svc" };
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">当前焦点</span>
      {anchor.role === "svc" ? (
        <SvcChip svc={anchor.name} />
      ) : (
        <NodeChip name={anchor.name} role={anchor.role} />
      )}
      <span className="text-xs text-muted-foreground">· {count} 条 FlowGroup</span>
    </div>
  );
}

function FocusCard({ children }: { children: React.ReactNode }) {
  return <article className="rounded-lg border border-border bg-card p-3">{children}</article>;
}

const COLLAPSE_THRESHOLD = 12;

function sortRows(rows: FocusLine[]): FocusLine[] {
  const score = (l: FocusLine) =>
    l.action === "unassociated"
      ? 0
      : l.action === "deny"
        ? 1
        : l.action === "associated"
          ? 2
          : l.action === "permit"
            ? 3
            : 4;
  return [...rows].sort(
    (a, b) =>
      score(a) - score(b) ||
      a.proto.localeCompare(b.proto) ||
      a.port.localeCompare(b.port) ||
      a.src.localeCompare(b.src),
  );
}
