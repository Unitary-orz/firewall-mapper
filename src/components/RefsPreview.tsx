import { useMemo, useState } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";
import type { RefUsage } from "@/lib/parser";
import type { NatRule, PolicyRule } from "@/lib/parser/types";

const byLabel: Record<RefUsage["by"], string> = {
  policy: "策略",
  nat: "NAT",
  "address-group": "地址组",
  "service-group": "服务组",
};

const sectionOrder: RefUsage["by"][] = [
  "policy",
  "nat",
  "address-group",
  "service-group",
];

const actionLabel: Record<string, string> = {
  permit: "允许",
  deny: "拒绝",
};

const natKindLabel: Record<string, string> = {
  destination: "目的 NAT",
  source: "源 NAT",
  static: "静态 NAT",
};

const ANY_RE = /^any(-(src|dst|ip|service))?$/i;
const isAny = (v: string) => !v || ANY_RE.test(v);

function policyWeight(p: PolicyRule): number {
  const a = isAny(p.srcAddr);
  const b = isAny(p.dstAddr);
  if (a && b) return 100;
  if (a || b) return 10;
  return 0;
}

function natWeight(n: NatRule): number {
  const a = isAny(n.srcAddr);
  const b = isAny(n.origDstAddr);
  if (a && b) return 100;
  if (a || b) return 10;
  return 0;
}

function cmpId(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** Highlight: render bold/primary if value equals the previewed object name */
function H({ hit, value }: { hit: string; value: string }) {
  const v = value || "—";
  if (v === hit) {
    return (
      <strong className="font-semibold text-primary">{v}</strong>
    );
  }
  return <span className="text-foreground">{v}</span>;
}

function PolicyLine({ p, hit }: { p: PolicyRule; hit: string }) {
  const action = actionLabel[p.action] ?? p.action;
  const actionTone = p.action === "permit" ? "ok" : p.action === "deny" ? "danger" : "muted";
  const showSchedule = p.schedule && p.schedule !== "always" && p.schedule !== "-";
  const showZone = (p.srcZone || p.dstZone) && !(p.srcZone === "any" && p.dstZone === "any");
  return (
    <div className="flex items-baseline gap-1.5 flex-wrap font-mono text-xs">
      <H hit={hit} value={p.srcAddr} />
      <span className="text-muted-foreground">→</span>
      <H hit={hit} value={p.dstAddr} />
      <span className="text-muted-foreground">服务</span>
      <H hit={hit} value={p.service} />
      <Badge tone={actionTone}>{action}</Badge>
      {showZone && (
        <Badge tone="muted">
          {p.srcZone || "any"}→{p.dstZone || "any"}
        </Badge>
      )}
      {showSchedule && <Badge tone="warn">仅 {p.schedule}</Badge>}
      <span className="ml-auto text-muted-foreground">#{p.id}</span>
    </div>
  );
}

function NatLine({ n, hit }: { n: NatRule; hit: string }) {
  const k = natKindLabel[n.kind] ?? n.kind;
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-1.5 flex-wrap font-mono text-xs">
        <H hit={hit} value={n.srcAddr} />
        <span className="text-muted-foreground">→</span>
        <H hit={hit} value={n.origDstAddr} />
        {n.origDstService && (
          <span className="text-muted-foreground">:{n.origDstService}</span>
        )}
        <span className="text-muted-foreground">⇒</span>
        <H hit={hit} value={n.translatedPool} />
        {n.servicePort && (
          <span className="text-muted-foreground">:{n.servicePort}</span>
        )}
        <Badge tone="default">{k}</Badge>
        {n.disabled && <Badge tone="muted">已禁用</Badge>}
        {n.log && <Badge tone="muted">log</Badge>}
        <span className="ml-auto text-muted-foreground">#{n.id}</span>
      </div>
      {n.description && (
        <div className="text-muted-foreground italic break-all">
          {n.description}
        </div>
      )}
    </div>
  );
}

function GroupLine({
  name,
  count,
  description,
  hit,
}: {
  name: string;
  count: number;
  description?: string;
  hit: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-1.5 flex-wrap font-mono text-xs">
        <H hit={hit} value={name} />
        <Badge tone="muted">成员 {count}</Badge>
      </div>
      {description && (
        <div className="text-muted-foreground italic break-all">
          {description}
        </div>
      )}
    </div>
  );
}

interface Section {
  by: RefUsage["by"];
  /** Already sorted (priority first, any-any last). */
  items: RefUsage[];
  anyAnyCount: number;
}

export function RefsPreview({
  name,
  kind,
}: {
  name: string;
  kind: "address" | "service";
}) {
  const { cfg, xr } = useConfigStore();
  const refs =
    xr
      ? kind === "service"
        ? xr.serviceUsedBy.get(name) ?? []
        : xr.addressUsedBy.get(name) ?? []
      : [];

  const sections = useMemo<Section[]>(() => {
    if (!cfg) return [];
    const groups = new Map<RefUsage["by"], RefUsage[]>();
    refs.forEach((r) => {
      const arr = groups.get(r.by) ?? [];
      arr.push(r);
      groups.set(r.by, arr);
    });
    return sectionOrder
      .filter((k) => groups.has(k))
      .map((by) => {
        const items = [...groups.get(by)!];
        let anyAnyCount = 0;
        if (by === "policy") {
          const map = new Map(cfg.policies.map((p) => [p.id, p]));
          items.sort((a, b) => {
            const pa = map.get(a.id);
            const pb = map.get(b.id);
            const wa = pa ? policyWeight(pa) : 0;
            const wb = pb ? policyWeight(pb) : 0;
            if (wa !== wb) return wa - wb;
            return cmpId(a.id, b.id);
          });
          anyAnyCount = items.filter((r) => {
            const p = map.get(r.id);
            return p && policyWeight(p) === 100;
          }).length;
        } else if (by === "nat") {
          const map = new Map(cfg.natRules.map((n) => [n.id, n]));
          items.sort((a, b) => {
            const na = map.get(a.id);
            const nb = map.get(b.id);
            const wa = na ? natWeight(na) : 0;
            const wb = nb ? natWeight(nb) : 0;
            if (wa !== wb) return wa - wb;
            return cmpId(a.id, b.id);
          });
          anyAnyCount = items.filter((r) => {
            const n = map.get(r.id);
            return n && natWeight(n) === 100;
          }).length;
        }
        return { by, items, anyAnyCount };
      });
  }, [cfg, refs]);

  if (!xr) return null;
  if (refs.length === 0) return <Badge tone="warn">未引用</Badge>;

  const summary = sections
    .map((s) => `${byLabel[s.by]} ${s.items.length}`)
    .join(" · ");

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="text-xs cursor-help underline decoration-dotted underline-offset-2 text-primary">
          {refs.length} 处 · {summary}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-[36rem] max-h-[28rem] overflow-auto"
        align="start"
      >
        <div className="space-y-3">
          <div className="text-sm">
            <span className="font-semibold">{name}</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {refs.length} 处引用 · {summary}
            </span>
          </div>
          {sections.map((s) => (
            <SectionBlock
              key={s.by}
              section={s}
              hit={name}
              cfg={cfg!}
            />
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function SectionBlock({
  section,
  hit,
  cfg,
}: {
  section: Section;
  hit: string;
  cfg: NonNullable<ReturnType<typeof useConfigStore>["cfg"]>;
}) {
  const [showAny, setShowAny] = useState(false);
  const { by, items, anyAnyCount } = section;
  const allAnyAny = anyAnyCount > 0 && anyAnyCount === items.length;
  const visibleItems =
    by === "policy" || by === "nat"
      ? showAny
        ? items
        : items.filter((_, i) => i < items.length - anyAnyCount)
      : items;
  const max = 30;
  const shown = visibleItems.slice(0, max);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span>
          {byLabel[by]}（{items.length}）
        </span>
        {anyAnyCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAny((v) => !v)}
            className="text-primary hover:underline"
          >
            {showAny ? "收起" : "展开"} {anyAnyCount} 条 any-any 引用
          </button>
        )}
      </div>
      {allAnyAny && !showAny && (
        <div className="text-xs text-muted-foreground italic">
          该对象仅被通配规则命中，对实际收敛无意义。
        </div>
      )}
      {shown.length > 0 && (
        <ul className="space-y-1.5">
          {shown.map((r, i) => (
            <li
              key={i}
              className="border-l-2 border-border pl-2 py-0.5"
            >
              {by === "policy" && (() => {
                const p = cfg.policies.find((x) => x.id === r.id);
                return p ? (
                  <PolicyLine p={p} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    策略 #{r.id}
                  </span>
                );
              })()}
              {by === "nat" && (() => {
                const n = cfg.natRules.find((x) => x.id === r.id);
                return n ? (
                  <NatLine n={n} hit={hit} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    NAT #{r.id}
                  </span>
                );
              })()}
              {by === "address-group" && (() => {
                const g = cfg.addressGroups.find((x) => x.name === r.id);
                return (
                  <GroupLine
                    name={g?.name ?? r.id}
                    count={g?.members.length ?? 0}
                    description={g?.description}
                    hit={hit}
                  />
                );
              })()}
              {by === "service-group" && (() => {
                const g = cfg.serviceGroups.find((x) => x.name === r.id);
                return (
                  <GroupLine
                    name={g?.name ?? r.id}
                    count={g?.members.length ?? 0}
                    description={g?.description}
                    hit={hit}
                  />
                );
              })()}
            </li>
          ))}
          {visibleItems.length > shown.length && (
            <li className="text-xs text-muted-foreground pl-2">
              …还有 {visibleItems.length - shown.length} 处
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
