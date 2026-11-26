import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";
import { lookupIndex } from "@/lib/access";
import { getBuiltinService } from "@/lib/builtinServices";
import { useShowFullPortRange } from "@/lib/uiPrefs";
import { L, DescQuote } from "@/components/previewAtoms";
import type {
  AddressGroup,
  AddressObject,
  NatPool,
  ServiceGroup,
  ServiceObject,
} from "@/lib/parser/types";

type Kind =
  | "address"
  | "address-group"
  | "service"
  | "builtin-service"
  | "service-group"
  | "nat-pool"
  | "literal-ip"
  | "literal-port"
  | "literal-any"
  | "unknown";

interface Resolved {
  kind: Kind;
  name: string;
  lineNo?: number;
  description?: string;
  literal?: string; // 解析为字面量时的说明
  addr?: AddressObject;
  addrGroup?: AddressGroup;
  svc?: ServiceObject;
  svcGroup?: ServiceGroup;
  pool?: NatPool;
}

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const RANGE_RE = /^\d{1,3}(\.\d{1,3}){3}-\d{1,3}(\.\d{1,3}){3}$/;
const PORT_RE = /^\d{1,5}(-\d{1,5})?$/;
const PROTO_PORT_RE = /^(tcp|udp)\/\d{1,5}(-\d{1,5})?$/i;
const ANY_RE = /^any(-(src|dst|ip|service))?$/i;

function classifyLiteral(name: string): Resolved | null {
  if (ANY_RE.test(name)) return { kind: "literal-any", name, literal: "通配（不限制）" };
  if (IP_RE.test(name)) return { kind: "literal-ip", name, literal: "字面 IP / 网段" };
  if (RANGE_RE.test(name)) return { kind: "literal-ip", name, literal: "字面 IP 区间" };
  if (PORT_RE.test(name) || PROTO_PORT_RE.test(name))
    return { kind: "literal-port", name, literal: "字面端口" };
  return null;
}

export type ResolvePrefer = "address" | "service" | "nat-pool";

function useResolve(name: string, prefer: ResolvePrefer = "address"): Resolved {
  const { cfg } = useConfigStore();
  if (!cfg || !name) return { kind: "unknown", name };

  if (prefer === "nat-pool") {
    const preferredPool = lookupIndex(cfg).poolByName.get(name);
    if (preferredPool)
      return {
        kind: "nat-pool",
        name,
        lineNo: preferredPool.lineNo,
        description: preferredPool.description,
        pool: preferredPool,
      };
  }

  // 名称冲突时（地址对象与服务对象同名），按调用方语境优先解析
  if (prefer === "service") {
    const ps = lookupIndex(cfg).svcByName.get(name);
    if (ps)
      return { kind: "service", name, lineNo: ps.lineNo, description: ps.description, svc: ps };
    const psg = lookupIndex(cfg).svcGrpByName.get(name);
    if (psg)
      return {
        kind: "service-group",
        name,
        lineNo: psg.lineNo,
        description: psg.description,
        svcGroup: psg,
      };
    const builtin = getBuiltinService(name);
    if (builtin) return { kind: "builtin-service", name, svc: builtin };
  }

  const a = lookupIndex(cfg).addrByName.get(name);
  if (a) return { kind: "address", name, lineNo: a.lineNo, description: a.description, addr: a };
  const ag = lookupIndex(cfg).grpByName.get(name);
  if (ag)
    return {
      kind: "address-group",
      name,
      lineNo: ag.lineNo,
      description: ag.description,
      addrGroup: ag,
    };
  const s = lookupIndex(cfg).svcByName.get(name);
  if (s) return { kind: "service", name, lineNo: s.lineNo, description: s.description, svc: s };
  const sg = lookupIndex(cfg).svcGrpByName.get(name);
  if (sg)
    return {
      kind: "service-group",
      name,
      lineNo: sg.lineNo,
      description: sg.description,
      svcGroup: sg,
    };
  const p = lookupIndex(cfg).poolByName.get(name);
  if (p)
    return {
      kind: "nat-pool",
      name,
      lineNo: p.lineNo,
      description: p.description,
      pool: p,
    };
  const lit = classifyLiteral(name);
  if (lit) return lit;
  const builtin = getBuiltinService(name);
  if (builtin) return { kind: "builtin-service", name, svc: builtin };
  return { kind: "unknown", name };
}

const kindLabel: Record<Kind, string> = {
  address: "地址对象",
  "address-group": "地址组",
  service: "服务对象",
  "builtin-service": "内置服务",
  "service-group": "服务组",
  "nat-pool": "NAT 池",
  "literal-ip": "字面 IP",
  "literal-port": "字面端口",
  "literal-any": "通配",
  unknown: "未定义引用",
};

function AddressEntries({ a }: { a: AddressObject }) {
  return (
    <div className="space-y-0.5 font-mono text-xs">
      {a.entries.length === 0 ? (
        <span className="text-muted-foreground">（空）</span>
      ) : (
        a.entries.map((e, i) => (
          <div key={i} className="flex items-baseline gap-1">
            <L>{e.kind}</L>
            <span className="text-foreground break-all">{e.value}</span>
          </div>
        ))
      )}
    </div>
  );
}

function isFullPort(p?: string) {
  return p === "1-65535";
}

function ServiceEntries({ s }: { s: ServiceObject }) {
  const [showFull] = useShowFullPortRange();
  const fmt = (p?: string) => (p ? (!showFull && isFullPort(p) ? "any" : p) : "any");
  return (
    <div className="space-y-0.5 font-mono text-xs">
      {s.entries.length === 0 ? (
        <span className="text-muted-foreground">（空）</span>
      ) : (
        s.entries.map((e, i) => {
          const srcHidden = !showFull && isFullPort(e.sourcePort);
          return (
            <div key={i} className="flex items-baseline gap-x-2 flex-wrap">
              <span className="flex items-baseline gap-1">
                <L>协议</L>
                <span className="text-foreground">{e.protocol}</span>
              </span>
              <span className="flex items-baseline gap-1">
                <L>目的</L>
                <span className="text-foreground">{fmt(e.destPort)}</span>
              </span>
              {e.sourcePort && !srcHidden && (
                <span className="flex items-baseline gap-1">
                  <L>源</L>
                  <span className="text-foreground">{e.sourcePort}</span>
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function MemberRow({ m, prefer = "address" }: { m: string; prefer?: ResolvePrefer }) {
  const { cfg } = useConfigStore();
  const [showFull] = useShowFullPortRange();
  if (!cfg) return null;
  const svcFirst = prefer === "service";
  const rawA = lookupIndex(cfg).addrByName.get(m);
  const rawAg = lookupIndex(cfg).grpByName.get(m);
  const s = lookupIndex(cfg).svcByName.get(m);
  const sg = lookupIndex(cfg).svcGrpByName.get(m);
  const builtin = !s && !sg ? getBuiltinService(m) : undefined;
  // 同名冲突时按语境优先
  const a = svcFirst && (s || sg || builtin) ? undefined : rawA;
  const ag = svcFirst && (s || sg || builtin) ? undefined : rawAg;

  let kindTag = "未定义引用";
  let summary = "";
  if (a) {
    kindTag = "地址对象";
    summary =
      a.entries
        .map((e) => `${e.kind}:${e.value}`)
        .slice(0, 3)
        .join("，") + (a.entries.length > 3 ? " …" : "");
  } else if (ag) {
    kindTag = "地址组";
    summary = `${ag.members.length} 成员`;
  } else if (s) {
    kindTag = "服务对象";
    const fmt = (p?: string) => (p ? (!showFull && isFullPort(p) ? "any" : p) : "any");
    summary =
      s.entries
        .map((e) => {
          const src =
            e.sourcePort && !(!showFull && isFullPort(e.sourcePort)) ? `←${e.sourcePort}` : "";
          return `${e.protocol}/${fmt(e.destPort)}${src}`;
        })
        .slice(0, 3)
        .join("，") + (s.entries.length > 3 ? " …" : "");
  } else if (sg) {
    kindTag = "服务组";
    summary = `${sg.members.length} 成员`;
  } else if (builtin) {
    kindTag = "内置服务";
    summary = builtin.entries
      .map((entry) => (entry.destPort ? `${entry.protocol}/${entry.destPort}` : entry.protocol))
      .join("，");
  }

  const desc = a?.description ?? ag?.description ?? s?.description ?? sg?.description;
  const unresolved = !a && !ag && !s && !sg && !builtin;

  return (
    <li className="py-1.5 px-2 space-y-0.5">
      <div className="flex items-baseline gap-2">
        <div className="flex items-baseline gap-x-2 text-xs min-w-0 flex-1 truncate">
          <ObjectName name={m} prefer={prefer} />
          {summary && (
            <span className="font-mono text-muted-foreground break-all truncate min-w-0">
              {summary}
            </span>
          )}
        </div>
        <span className="shrink-0">
          <Badge tone={unresolved ? "danger" : "muted"}>{kindTag}</Badge>
        </span>
      </div>
      {desc && <DescQuote className="text-[11px] line-clamp-2">{desc}</DescQuote>}
    </li>
  );
}

function GroupMembers({
  members,
  prefer = "address",
}: {
  members: string[];
  prefer?: ResolvePrefer;
}) {
  if (members.length === 0) return <div className="text-xs text-muted-foreground">（空）</div>;
  const max = 30;
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <ul className="divide-y divide-border/40 rounded-md border border-border/40">
      {shown.map((m, i) => (
        <MemberRow key={i} m={m} prefer={prefer} />
      ))}
      {rest > 0 && <li className="text-xs text-muted-foreground py-1.5 px-2">…还有 {rest} 个</li>}
    </ul>
  );
}

function PoolDetail({ p }: { p: NatPool }) {
  const hasTo = p.addressTo && p.addressTo !== p.addressFrom;
  return (
    <div className="flex items-baseline gap-x-3 flex-wrap font-mono text-xs">
      <span className="flex items-baseline gap-1">
        <L>起始</L>
        <span className="text-foreground">{p.addressFrom ?? "—"}</span>
      </span>
      {hasTo && (
        <span className="flex items-baseline gap-1">
          <L>结束</L>
          <span className="text-foreground">{p.addressTo}</span>
        </span>
      )}
    </div>
  );
}

export function ObjectName({
  name,
  className = "",
  prefer = "address",
}: {
  name: string;
  className?: string;
  prefer?: ResolvePrefer;
}) {
  const r = useResolve(name, prefer);
  const isMobile = useIsMobile();
  const isEmpty = !name;

  if (isEmpty) {
    return <span className={`font-mono text-xs text-muted-foreground ${className}`}>—</span>;
  }

  const isLiteral =
    r.kind === "literal-any" || r.kind === "literal-ip" || r.kind === "literal-port";

  const colorCls = isLiteral
    ? "text-muted-foreground"
    : r.kind === "unknown"
      ? "text-destructive"
      : "text-primary";

  const details = (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 break-all text-sm font-semibold">{r.name}</span>
        {!isLiteral && (
          <span className="shrink-0">
            <Badge tone={r.kind === "unknown" ? "danger" : "default"}>{kindLabel[r.kind]}</Badge>
          </span>
        )}
      </div>
      {r.literal && <div className="text-xs text-muted-foreground">{r.literal}</div>}
      {r.description && <DescQuote>{r.description}</DescQuote>}
      {r.addr && <AddressEntries a={r.addr} />}
      {r.svc && <ServiceEntries s={r.svc} />}
      {r.pool && <PoolDetail p={r.pool} />}
      {r.addrGroup && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            成员（{r.addrGroup.members.length}）
          </div>
          <GroupMembers members={r.addrGroup.members} />
        </div>
      )}
      {r.svcGroup && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            成员（{r.svcGroup.members.length}）
          </div>
          <GroupMembers members={r.svcGroup.members} prefer="service" />
        </div>
      )}
      {r.kind === "unknown" && (
        <div className="text-xs text-destructive">
          在配置中找不到该名称的定义，可能引用了已删除的对象。
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`查看 ${name} 的详情`}
            className={`inline max-w-full break-all text-left align-baseline font-mono text-xs ${colorCls} ${className}`}
          >
            {name}
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
        <span className={`cursor-help font-mono text-xs ${colorCls} ${className}`}>{name}</span>
      </HoverCardTrigger>
      <HoverCardContent
        className="max-h-96 w-96 max-w-[calc(100vw-1.5rem)] overflow-auto"
        align="start"
      >
        {details}
      </HoverCardContent>
    </HoverCard>
  );
}
