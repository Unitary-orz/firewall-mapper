import { useConfigStore } from "@/lib/store";
import type { CrossRef } from "@/lib/parser";
import type { NatRule } from "@/lib/parser/types";
import { EmptyConfig } from "@/components/EmptyConfig";
import { Badge, LineLink } from "@/components/DataTable";
import { useShowFullPortRange, useShowLineNumbers, useShowPolicyZone } from "@/lib/uiPrefs";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  type FlowSnatEntry,
  serviceGroupMembers,
  serviceRefKind,
  serviceToPorts,
} from "@/lib/access";
import { ObjectName } from "@/components/ObjectPreview";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

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

// The five-column path grid is shared by every row and by the field header, so
// the header labels always sit exactly above their column.
export const FOCUS_GRID =
  "grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_11rem]";

const FOCUS_FIELDS = [
  { label: "来源", cls: "" },
  { label: "NAT / 直连", cls: "" },
  { label: "目的", cls: "" },
  { label: "服务 / 端口", cls: "justify-end pl-1 pr-2" },
  { label: "策略状态", cls: "justify-end pl-1" },
];

/** Field header for one group of path rows. Mobile rows carry their own
 *  inline labels, so the header only shows on desktop widths. */
export function FocusLineHead() {
  return (
    <div
      className={cn(
        "mb-1 hidden items-center gap-x-2 border-b border-border/70 px-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70 sm:grid",
        FOCUS_GRID,
      )}
    >
      {FOCUS_FIELDS.map((f) => (
        <div key={f.label} className={cn("min-w-0 truncate", f.cls)}>
          {f.label}
        </div>
      ))}
    </div>
  );
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
  const isMobile = useIsMobile();
  const hasNat = line.nat.length > 0 || line.snat.length > 0;
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

  if (isMobile) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border border-l-4 bg-background/40 p-2.5 text-xs",
          accent,
        )}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] text-muted-foreground">来源</div>
            <div className="min-w-0 truncate" title={hideSrc ? undefined : line.src}>
              {!hideSrc ? <NodePlain name={line.src} /> : <Placeholder />}
            </div>
          </div>
          <ArrowRight className="mb-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-right">
            <div className="mb-1 text-[10px] text-muted-foreground">目的</div>
            <div className="min-w-0 truncate" title={hideDst ? undefined : line.dst}>
              {hideDst ? (
                <Placeholder />
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">
                  <ObjectName name={line.dst} />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 border-t border-border/60 pt-2">
          <div className="mb-1 text-[10px] text-muted-foreground">NAT / 直连</div>
          <div className="min-w-0 max-w-full">
            <NatToken nat={line.nat} snat={line.snat} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] text-muted-foreground">服务</span>
            {!hideSvc ? <SvcChip svc={line.service} names={line.serviceNames} /> : <Placeholder />}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <ActionBadge action={line.action} />
            {line.policies.length > 0 && <PolicyCountBadge policies={line.policies} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid items-center gap-x-2 gap-y-1 rounded-md border border-border border-l-4 bg-background/40 px-2 py-1.5 text-xs",
        accent,
        FOCUS_GRID,
      )}
    >
      <div className="flex min-w-0 items-center overflow-hidden">
        {!hideSrc ? <NodePlain name={line.src} /> : <Placeholder />}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <NatToken nat={line.nat} snat={line.snat} />
      </div>
      <div className="flex min-w-0 items-center overflow-hidden">
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
      <div className="flex min-w-0 items-center justify-end overflow-hidden pl-1 pr-2">
        {!hideSvc ? <SvcChip svc={line.service} names={line.serviceNames} /> : <Placeholder />}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 whitespace-nowrap pl-1">
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
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden font-mono text-xs text-foreground/90">
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

export function SvcChip({ svc, names = [] }: { svc: string; names?: string[] }) {
  const serviceNames = names.filter((name) => name && name !== svc);
  const primaryName = serviceNames[0];
  const extraCount = Math.max(0, serviceNames.length - 1);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs 2xl:max-w-[20rem]",
        primaryName ? "border-border bg-accent/50" : "border-border bg-muted/40",
      )}
    >
      {primaryName && (
        <span className="flex min-w-0 items-center gap-1 truncate px-0.5 font-medium text-accent-foreground">
          <span className="min-w-0 truncate">
            <ObjectName name={primaryName} prefer="service" className="text-inherit" />
          </span>
          {extraCount > 0 && <ExtraServiceNames names={serviceNames} count={extraCount} />}
        </span>
      )}
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] leading-4 text-muted-foreground",
          primaryName && "rounded border border-border/60 bg-background/70 px-1.5 py-px",
        )}
      >
        {svc}
      </span>
    </span>
  );
}

function ExtraServiceNames({ names, count }: { names: string[]; count: number }) {
  const isMobile = useIsMobile();
  const details = (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">该端口对应的服务名称</div>
      <ul className="space-y-1.5">
        {names.map((name) => (
          <li key={name} className="flex min-w-0 items-center gap-2">
            <ObjectName name={name} prefer="service" />
          </li>
        ))}
      </ul>
    </div>
  );
  const label = `+${count}`;

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`查看其余 ${count} 个服务名称`}
            className="shrink-0 font-normal text-muted-foreground"
          >
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={8}
          className="max-h-[70dvh] w-[calc(100vw-1.5rem)] max-w-sm overflow-y-auto p-3"
        >
          {details}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="shrink-0 cursor-help font-normal text-muted-foreground">{label}</span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 max-w-[calc(100vw-1.5rem)] p-3">
        {details}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Service token with its definition preview, kind and resolved real ports. */
export function ServiceRefPreview({ name, className = "" }: { name?: string; className?: string }) {
  const { cfg } = useConfigStore();
  const [showFull] = useShowFullPortRange();
  if (!name) return <span className={cn("text-muted-foreground", className)}>—</span>;

  const kind = cfg ? serviceRefKind(name, cfg) : "literal";
  const ports = cfg ? serviceToPorts(name, cfg) : [];
  const portText = fmtPortList(ports, showFull);
  const kindLabel =
    kind === "service-group"
      ? "服务组"
      : kind === "service"
        ? "服务对象"
        : kind === "builtin"
          ? "内置服务"
          : kind === "any"
            ? "通配"
            : "字面端口";

  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1", className)}
    >
      <ObjectName name={name} prefer="service" className="text-inherit" />
      {kind === "service-group" && (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
          服务组
        </span>
      )}
      {portText && portText !== name && (
        <span
          className="shrink-0 font-mono text-[10px] text-muted-foreground"
          title={`${kindLabel}${ports.length > 0 ? `：${ports.join("、")}` : ""}`}
        >
          {portText}
        </span>
      )}
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
        title="该访问路径被至少一条 permit 策略覆盖"
      >
        已关联策略
      </span>
    );
  if (action === "unassociated" || action === "none")
    return (
      <span
        className="text-[11px] text-muted-foreground/70"
        title="该访问路径没有任何 permit 或 deny 策略覆盖"
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
      <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] max-w-96 p-2">
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
              <ObjectName name={p.srcAddr} />
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <ObjectName name={p.dstAddr} />
              <span className="text-muted-foreground">
                [<ObjectName name={p.service} prefer="service" />]
              </span>
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

export function NatToken({ nat, snat = [] }: { nat: FlowDnatEntry[]; snat?: FlowSnatEntry[] }) {
  const [showFull] = useShowFullPortRange();
  const count = nat.length + snat.length;
  if (count === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 text-muted-foreground/80"
        title="这条策略路径没有被等价的 DNAT 或 SNAT 链路覆盖；不表示对实际路由的额外判断"
      >
        <span className="h-px w-6 bg-foreground/40" />
        <ArrowRight className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.5} />
        <span className="whitespace-nowrap text-[10px] tracking-wide">无 NAT</span>
        <ArrowRight className="h-3.5 w-3.5 text-foreground/70" strokeWidth={2.5} />
        <span className="h-px w-6 bg-foreground/40" />
      </span>
    );
  }
  if (count === 1) {
    if (nat[0]) return <DnatLabel entry={nat[0]} showFull={showFull} />;
    if (snat[0]) return <SnatLabel entry={snat[0]} />;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-transparent px-2 py-0.5 font-mono text-[11px] text-amber-700 hover:bg-amber-500/5 dark:text-amber-300"
        >
          NAT × {count}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[calc(100vw-1.5rem)] max-w-[28rem] p-2">
        <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          NAT 规则
        </div>
        <div className="space-y-1">
          {nat.map((d) => (
            <DnatLabel key={`${d.rule.id}@${d.rule.lineNo}`} entry={d} showFull={showFull} block />
          ))}
          {snat.map((s) => (
            <SnatLabel key={`${s.rule.id}@${s.rule.lineNo}`} entry={s} block />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** SNAT 的转换后源：地址池 / 对象正常预览；出接口取址显示接口真实 IP。 */
export function SnatTranslatedSource({
  rule,
  showInterface = true,
  interactive = true,
  className,
}: {
  rule: NatRule;
  showInterface?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const { cfg } = useConfigStore();
  if (rule.egressInterface) {
    const iface = cfg?.interfaces.find((item) => item.name === rule.iface);
    // “ip address dhcp …” 不是地址，只有真实 IP / CIDR 才能作为出接口地址。
    const ips = (iface?.ips ?? []).filter((ip) => isIpLiteral(ip));
    const primary = ips[0]?.replace(/\/\d+$/, "");
    return (
      <span
        className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-1", className)}
        title={ips.length > 0 ? `${rule.iface}：${ips.join("、")}` : `${rule.iface} 出接口取址`}
      >
        {primary ? (
          interactive ? (
            <ObjectName name={primary} className="text-inherit" />
          ) : (
            <span>{primary}</span>
          )
        ) : (
          <span>出接口取址</span>
        )}
        {ips.length > 1 && <span className="text-muted-foreground">+{ips.length - 1}</span>}
        {showInterface && (
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">
            （{rule.iface} 出接口）
          </span>
        )}
      </span>
    );
  }
  if (rule.translatedSrc) {
    return interactive ? (
      <ObjectName
        name={rule.translatedSrc}
        prefer="nat-pool"
        className={cn("text-inherit", className)}
      />
    ) : (
      <span className={className}>{rule.translatedSrc}</span>
    );
  }
  return <span className={cn("text-muted-foreground", className)}>—</span>;
}

export function SnatLabel({ entry, block }: { entry: FlowSnatEntry; block?: boolean }) {
  const isMobile = useIsMobile();
  const [showLineNo] = useShowLineNumbers();
  const rule = entry.rule;
  const details = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          SNAT #{rule.id}
        </span>
        {rule.iface && <span className="text-[11px] text-muted-foreground">接口 {rule.iface}</span>}
        {rule.disabled && <Badge tone="warn">disabled</Badge>}
        {showLineNo && (
          <span className="ml-auto">
            <LineLink line={rule.lineNo} />
          </span>
        )}
      </div>
      <div className="space-y-1.5 font-mono text-xs">
        <div className="flex items-baseline gap-2">
          <span className="w-16 shrink-0 text-[10px] text-muted-foreground">原始源</span>
          <ObjectName name={rule.srcAddr} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-16 shrink-0 text-[10px] text-muted-foreground">原目的</span>
          <ObjectName name={rule.origDstAddr} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-16 shrink-0 text-[10px] text-muted-foreground">服务</span>
          <ServiceRefPreview name={rule.origDstService} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="w-16 shrink-0 text-[10px] text-amber-700 dark:text-amber-400">
            转换为源
          </span>
          <SnatTranslatedSource rule={rule} className="text-amber-700 dark:text-amber-300" />
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        策略按转换前的源、目的和服务匹配{rule.log ? " · log" : ""}
      </div>
    </div>
  );
  const trigger = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] hover:bg-amber-500/15 2xl:max-w-[22rem]",
        block && "w-full max-w-none",
      )}
    >
      <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">SNAT</span>
      <span className="shrink-0 text-muted-foreground">源</span>
      <ArrowRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 truncate text-amber-700 dark:text-amber-300">
        <SnatTranslatedSource rule={rule} showInterface={false} interactive={false} />
      </span>
      {rule.egressInterface && (
        <span className="shrink-0 text-[10px] text-muted-foreground">{rule.iface}</span>
      )}
      {rule.disabled && <Badge tone="warn">disabled</Badge>}
    </span>
  );

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`SNAT #${rule.id} 详情`}
            className={cn("min-w-0 max-w-full text-left", block && "w-full")}
          >
            {trigger}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] max-w-[26rem] p-3">
          {details}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`SNAT #${rule.id} 详情`}
          className={cn("min-w-0 max-w-full cursor-help text-left", block && "w-full")}
        >
          {trigger}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
        {details}
      </HoverCardContent>
    </HoverCard>
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
  // Ports are resolved from the service token, so a service object or a service
  // group both show the real ports they stand for instead of their name.
  const entryPorts = fmtPortList(entry.entryPorts, showFull);
  const backendPorts = fmtPortList(entry.backendPorts, showFull);
  const { cfg } = useConfigStore();
  const entryGroup = entry.entryKind === "service-group" ? entry.entryPort : "";
  const backendGroup = entry.backendKind === "service-group" ? entry.backendPort : "";
  const backendSame = entry.backendPort === entry.entryPort;
  const groupMembers = useMemo(
    () =>
      cfg && (entryGroup || backendGroup)
        ? serviceGroupMembers(entryGroup || backendGroup, cfg)
        : [],
    [cfg, entryGroup, backendGroup],
  );
  const svcTok = (group: string, ports: string, count: number, preview = false, token = "") => {
    if (preview && token) {
      return (
        <span className="text-amber-700/70 dark:text-amber-300/70">
          :<ServiceRefPreview name={token} className="text-inherit" />
        </span>
      );
    }
    return group ? (
      <span className="text-amber-700/70 dark:text-amber-300/70">
        :<span className="mx-0.5 rounded bg-amber-500/15 px-1 text-[10px]">组</span>
        {group}
        {count > 0 && <span className="opacity-70"> ·{count}</span>}
      </span>
    ) : ports ? (
      <span className="text-amber-700/70 dark:text-amber-300/70">:{ports}</span>
    ) : null;
  };
  const entryCount = entryGroup ? groupMembers.length : 0;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressOpenRef = useRef(false);

  // Hover remains transient; a click pins the same card so touch users and
  // keyboard users can read it without keeping the pointer over the label.
  useEffect(() => {
    if (!pinned) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [pinned]);

  const handleOpenChange = (next: boolean) => {
    // Escape closes the card even while it is focused or hovered. Do not let
    // that same focus/hover immediately open it again.
    if (next && suppressOpenRef.current) return;
    // Radix asks to close on pointer leave; ignore that while click-pinned.
    if (!next && pinned) return;
    setOpen(next);
  };
  const togglePinned = () => {
    // Unpinning while hovered must not immediately reopen the transient card.
    suppressOpenRef.current = pinned;
    setPinned(!pinned);
    setOpen(!pinned);
  };
  const handleEscape = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    suppressOpenRef.current = true;
    setPinned(false);
    setOpen(false);
  };
  const trigger = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] hover:bg-amber-500/15 2xl:max-w-[22rem]",
        block && "w-full max-w-none",
      )}
    >
      <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">{kind}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {entry.entryAddr}
        {svcTok(entryGroup, entryPorts, entryCount)}
      </span>
      <ArrowRight className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 truncate text-amber-700 dark:text-amber-300">
        {entry.rule.translatedPool}
        {!backendSame &&
          backendPorts !== entryPorts &&
          svcTok(backendGroup, backendPorts, backendGroup && !entryGroup ? groupMembers.length : 0)}
      </span>
      {entry.rule.disabled && <Badge tone="warn">disabled</Badge>}
    </span>
  );

  return (
    <HoverCard open={open} onOpenChange={handleOpenChange} openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${kind} #${entry.rule.id} 详情，点击固定`}
          aria-expanded={open}
          title="悬停查看详情，点击固定"
          onClick={togglePinned}
          onKeyDown={handleEscape}
          onPointerLeave={() => {
            suppressOpenRef.current = false;
          }}
          onBlur={() => {
            if (!triggerRef.current?.matches(":hover")) suppressOpenRef.current = false;
          }}
          className={cn("min-w-0 max-w-full cursor-pointer text-left", block && "w-full")}
        >
          {trigger}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        ref={contentRef}
        onKeyDown={handleEscape}
        align="start"
        className="max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
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
              <ObjectName name={entry.entryAddr} className="text-inherit" />
              {svcTok(entryGroup, entryPorts, 0, true, entry.entryPort)}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              转换为
            </span>
            <span className="break-all text-amber-700 dark:text-amber-300">
              <ObjectName
                name={entry.rule.translatedPool}
                prefer="nat-pool"
                className="text-inherit"
              />
              {backendSame ? (
                <span className="ml-2 text-muted-foreground">（服务不变）</span>
              ) : (
                svcTok(backendGroup, backendPorts, 0, true, entry.backendPort)
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

/** Compact port list for the pill: already-resolved ports, full ranges folded
 *  to `any` (and hidden), long lists shortened to `first +N`. */
export function fmtPortList(ports: string[], showFull: boolean): string {
  const out: string[] = [];
  for (const p of ports) {
    const slash = p.indexOf("/");
    const proto = slash > 0 ? p.slice(0, slash) : "";
    const port = slash > 0 ? p.slice(slash + 1) : p;
    if (!showFull && port === "1-65535") {
      if (!out.includes("any")) out.push("any");
      continue;
    }
    const shown = proto ? `${proto}/${port}` : port;
    if (!out.includes(shown)) out.push(shown);
  }
  const real = out.filter((p) => p !== "any");
  if (real.length === 0) return "";
  if (real.length === 1) return real[0];
  return `${real[0]} +${real.length - 1}`;
}
