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

export function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  arr.forEach((x) => {
    const k = key(x);
    const cur = m.get(k);
    if (cur) cur.push(x);
    else m.set(k, [x]);
  });
  return m;
}

// ---------- FocusLineRow ----------

export function FocusLineRow({
  line,
  hideSrc,
  hideDst,
  hideSvc,
  mutedDst,
}: {
  line: FocusLine;
  hideSrc?: boolean;
  hideDst?: boolean;
  hideSvc?: boolean;
  mutedDst?: boolean;
}) {
  const hasNat = line.nat.length > 0;
  const accent =
    line.action === "unassociated"
      ? "border-l-amber-500"
      : line.action === "deny"
        ? "border-l-destructive"
        : line.action === "associated"
          ? "border-l-blue-500/70"
          : hasNat
            ? "border-l-blue-500/70"
            : "border-l-emerald-500/60";
  return (
    <div
      className={cn(
        "grid items-center gap-x-2 gap-y-1 rounded-md border border-border border-l-4 bg-background/40 px-2 py-1.5 text-xs",
        accent,
        "grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)_minmax(0,auto)_minmax(0,auto)]",
      )}
    >
      <div className="flex min-w-0 items-center">
        {!hideSrc ? <NodePlain name={line.src} /> : <Placeholder />}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <NatToken nat={line.nat} />
      </div>
      <div className="flex min-w-0 items-center">
        {hideDst ? (
          <Placeholder />
        ) : mutedDst ? (
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/70">
            <ObjectName name={line.dst} />
          </span>
        ) : (
          <NodePlain name={line.dst} />
        )}
      </div>
      <div className="flex min-w-0 items-center pl-1">
        {!hideSvc ? <SvcChip svc={line.service} /> : <Placeholder />}
      </div>
      <div className="flex items-center justify-end gap-1.5 pl-1">
        <ActionBadge action={line.action} />
        {line.policies.length > 0 && <PolicyCountBadge policies={line.policies} />}
      </div>
    </div>
  );
}

export function Connector() {
  return <span className="h-px w-3 shrink-0 bg-border" />;
}

export function Placeholder() {
  return <span className="font-mono text-xs text-muted-foreground/40">—</span>;
}

// ---------- NodeChip / SvcChip / ActionBadge ----------

export function NodeChip({ name, role }: { name: string; role: "src" | "dst" }) {
  const cat = classifyIntermediary(name);
  const cls =
    role === "src" ? "border-emerald-500/40 bg-transparent" : "border-blue-500/40 bg-transparent";

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs",
        cls,
      )}
    >
      <span className="min-w-0 truncate">
        <ObjectName name={name} />
      </span>
      {cat && (
        <span className="shrink-0 rounded bg-background/60 px-1 text-[10px] uppercase text-muted-foreground">
          {CAT_LABEL[cat]}
        </span>
      )}
    </span>
  );
}

export function NodePlain({ name }: { name: string }) {
  const cat = classifyIntermediary(name);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-foreground/90">
      <span className="min-w-0 truncate">
        <ObjectName name={name} />
      </span>
      {cat && (
        <span className="shrink-0 rounded bg-muted/60 px-1 text-[10px] uppercase text-muted-foreground">
          {CAT_LABEL[cat]}
        </span>
      )}
    </span>
  );
}

export function SvcChip({ svc }: { svc: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 font-mono text-xs">
      {svc}
    </span>
  );
}

export function ActionBadge({ action }: { action: string }) {
  if (action === "permit")
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        permit
      </span>
    );
  if (action === "deny")
    return (
      <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        deny
      </span>
    );
  if (action === "associated")
    return (
      <span
        className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
        title="转化后的目的+后端端口被至少一条 permit 策略覆盖"
      >
        已关联策略
      </span>
    );
  if (action === "unassociated" || action === "none")
    return (
      <span
        className="text-[11px] text-muted-foreground/70"
        title="转化后的目的+后端端口没有任何 permit 策略覆盖"
      >
        未关联策略
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {action}
    </span>
  );
}

export function PolicyCountBadge({ policies }: { policies: FocusLine["policies"] }) {
  const [showLineNo] = useShowLineNumbers();
  const [showZonePref] = useShowPolicyZone();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Layers className="h-3 w-3" />
          策略 × {policies.length}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          命中策略
        </div>
        <div className="space-y-1">
          {policies.map((p) => (
            <div
              key={`${p.id}@${p.lineNo}`}
              className="flex flex-wrap items-center gap-1.5 rounded border border-border bg-background px-1.5 py-1 font-mono text-[11px]"
            >
              <Badge tone={p.action === "permit" ? "ok" : p.action === "deny" ? "danger" : "muted"}>
                {p.action}
              </Badge>
              <span className="text-muted-foreground">#{p.id}</span>
              {showZonePref &&
                !((!p.srcZone || p.srcZone === "any") && (!p.dstZone || p.dstZone === "any")) && (
                  <span className="text-[10px] text-muted-foreground">
                    {p.srcZone || "any"}→{p.dstZone || "any"}
                  </span>
                )}
              <span>{p.srcAddr}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span>{p.dstAddr}</span>
              <span className="text-muted-foreground">[{p.service}]</span>
              {showLineNo && (
                <span className="ml-auto">
                  <LineLink line={p.lineNo} />
                </span>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------- NatToken: direct / DNAT / SNAT / NAT×N ----------

export function NatToken({ nat }: { nat: FlowDnatEntry[] }) {
  const [showFull] = useShowFullPortRange();
  if (nat.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/80">
        <span className="h-px w-6 bg-foreground/40" />
        <ArrowRight className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.5} />
        <span className="text-[10px] uppercase tracking-wide">direct</span>
        <ArrowRight className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.5} />
        <span className="h-px w-6 bg-foreground/40" />
      </span>
    );
  }
  if (nat.length === 1) {
    return <DnatLabel entry={nat[0]} showFull={showFull} />;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-transparent px-2 py-0.5 font-mono text-[11px] text-amber-700 hover:bg-amber-500/5 dark:text-amber-300"
        >
          NAT × {nat.length}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[28rem] p-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          NAT 规则链
        </div>
        <div className="space-y-1">
          {nat.map((d) => (
            <DnatLabel key={`${d.rule.id}@${d.rule.lineNo}`} entry={d} showFull={showFull} block />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// 主图短格式：DNAT #203  防火墙IP:11743 → api-172.23.51.28:11743
// hover 展示完整 "转换为" 字段 + iface / 行号 / disabled
export function DnatLabel({
  entry,
  showFull,
  block,
}: {
  entry: FlowDnatEntry;
  showFull: boolean;
  block?: boolean;
}) {
  const [showLineNo] = useShowLineNumbers();
  const kind = entry.rule.kind === "source" ? "SNAT" : "DNAT";
  const entryPort = entry.entryPort ? fmtPort(entry.entryPort, showFull) : "";
  const backendPort = entry.backendPort ? fmtPort(entry.backendPort, showFull) : "";
  const trigger = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-[22rem] items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] hover:bg-amber-500/15",
        block && "w-full max-w-none",
      )}
    >
      <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">{kind}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {entry.entryAddr}
        {entryPort && (
          <span className="text-amber-700/70 dark:text-amber-300/70">:{entryPort}</span>
        )}
      </span>
      <ArrowRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 truncate text-amber-700 dark:text-amber-300">
        {entry.rule.translatedPool}
        {backendPort && backendPort !== entryPort && (
          <span className="text-amber-700/70 dark:text-amber-300/70">:{backendPort}</span>
        )}
      </span>

      {entry.rule.disabled && <Badge tone="warn">disabled</Badge>}
    </span>
  );

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="cursor-help">{trigger}</span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[26rem] p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {kind} #{entry.rule.id}
          </span>
          {entry.rule.iface && (
            <span className="text-[11px] text-muted-foreground">接口 {entry.rule.iface}</span>
          )}
          {entry.rule.disabled && <Badge tone="warn">disabled</Badge>}
          {showLineNo && (
            <span className="ml-auto">
              <LineLink line={entry.rule.lineNo} />
            </span>
          )}
        </div>
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-foreground">
              原始目的
            </span>
            <span className="break-all text-muted-foreground">
              {entry.entryAddr}
              {entryPort && (
                <span className="text-amber-700/70 dark:text-amber-300/70">:{entryPort}</span>
              )}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              转换为
            </span>
            <span className="break-all text-amber-700 dark:text-amber-300">
              {entry.rule.translatedPool}
              {backendPort && (
                <span className="text-amber-700/70 dark:text-amber-300/70">:{backendPort}</span>
              )}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function fmtPort(p: string, showFull: boolean): string {
  if (!p) return "";
  if (!showFull && p === "1-65535") return "any";
  return p;
}
