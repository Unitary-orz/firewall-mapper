import type {
  ParsedConfig,
  NatRule,
  PolicyRule,
  AddressObject,
  AddressGroup,
  NatPool,
  ServiceObject,
  ServiceGroup,
} from "./parser/types";
import { isPolicyExpired } from "./policyStatus";
import { getBuiltinService } from "./builtinServices";

export type IntermediaryCat = "waf" | "gateway" | "proxy" | "bastion" | "lb";

export const CAT_LABEL: Record<IntermediaryCat, string> = {
  waf: "WAF",
  gateway: "网关",
  proxy: "代理",
  bastion: "堡垒机",
  lb: "负载均衡",
};

// ---------- per-cfg index + memo caches ----------
// All hot helpers below resolve names via Maps and memoize recursive results
// keyed on the immutable ParsedConfig instance. This turns repeated O(N) array
// .find() calls into O(1) Map lookups and avoids re-expanding the same name
// across every policy × NAT × line iteration. Forward type references below
// (AddrEndpoint / Flow / FocusLine / NodeAggregate) are declared later in the
// same module; TS hoists interface/type declarations.

interface AccessIndex {
  addrByName: Map<string, AddressObject>;
  grpByName: Map<string, AddressGroup>;
  poolByName: Map<string, NatPool>;
  svcByName: Map<string, ServiceObject>;
  svcGrpByName: Map<string, ServiceGroup>;
  endpoints: Map<string, AddrEndpoint[]>;
  service: Map<string, string[]>;
  serviceNames: Map<string, string[]>;
  members: Map<string, Set<string>>;
  expandAddr: Map<string, Set<string>>;
  expandSvc: Map<string, Set<string>>;
  addrContainsIp: Map<string, string[]>;
  // Cached per "show disabled NAT" state so toggling the display option does
  // not invalidate the name/endpoints indexes above.
  flowsByDisabled?: Map<boolean, Flow[]>;
  focusLinesByDisabled?: Map<boolean, FocusLine[]>;
  nodeAggregatesByDisabled?: Map<boolean, NodeAggregate[]>;
}

const indexCache = new WeakMap<ParsedConfig, AccessIndex>();

function idx(cfg: ParsedConfig): AccessIndex {
  let v = indexCache.get(cfg);
  if (v) return v;
  v = {
    addrByName: new Map(cfg.addresses.map((a) => [a.name, a])),
    grpByName: new Map(cfg.addressGroups.map((g) => [g.name, g])),
    poolByName: new Map(cfg.natPools.map((p) => [p.name, p])),
    svcByName: new Map(cfg.services.map((s) => [s.name, s])),
    svcGrpByName: new Map(cfg.serviceGroups.map((g) => [g.name, g])),
    endpoints: new Map(),
    service: new Map(),
    serviceNames: new Map(),
    members: new Map(),
    expandAddr: new Map(),
    expandSvc: new Map(),
    addrContainsIp: new Map(),
  };
  indexCache.set(cfg, v);
  return v;
}

/** O(1) name lookups shared by UI previews. */
export function lookupIndex(cfg: ParsedConfig) {
  return idx(cfg);
}

/** NAT rules the current display state should surface. Disabled rules stay
 *  hidden unless the caller opts in, so a `disable`d rule never creates a
 *  flow branch, a node aggregate entry or a list row by default. */
export function visibleNatRules(cfg: ParsedConfig, showDisabled = false): NatRule[] {
  return showDisabled ? cfg.natRules : cfg.natRules.filter((r) => !r.disabled);
}

/** Cached top-level flow + focus-line builders so navigating away and back
 *  does not re-run buildFlows / buildFocusLines from scratch. Results are
 *  keyed on the "show disabled NAT" display option. */
export function getFlows(cfg: ParsedConfig, showDisabled = false): Flow[] {
  const i = idx(cfg);
  let m = i.flowsByDisabled;
  if (!m) m = i.flowsByDisabled = new Map();
  const hit = m.get(showDisabled);
  if (hit) return hit;
  const v = buildFlows(cfg, showDisabled);
  m.set(showDisabled, v);
  return v;
}

export function getFocusLines(cfg: ParsedConfig, showDisabled = false): FocusLine[] {
  const i = idx(cfg);
  let m = i.focusLinesByDisabled;
  if (!m) m = i.focusLinesByDisabled = new Map();
  const hit = m.get(showDisabled);
  if (hit) return hit;
  const v = buildFocusLines(getFlows(cfg, showDisabled), cfg);
  m.set(showDisabled, v);
  return v;
}

export function getNodeAggregates(cfg: ParsedConfig, showDisabled = false): NodeAggregate[] {
  const i = idx(cfg);
  let m = i.nodeAggregatesByDisabled;
  if (!m) m = i.nodeAggregatesByDisabled = new Map();
  const hit = m.get(showDisabled);
  if (hit) return hit;
  const v = buildNodeAggregates(cfg, showDisabled);
  m.set(showDisabled, v);
  return v;
}

export function classifyIntermediary(name: string): IntermediaryCat | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("waf")) return "waf";
  if (name.includes("堡垒") || lower.includes("bastion")) return "bastion";
  if (
    name.includes("数据库网关") ||
    name.includes("api网关") ||
    lower.includes("gateway") ||
    lower.includes("api-")
  )
    return "gateway";
  if (name.includes("代理") || lower.includes("proxy")) return "proxy";
  if (name.includes("负载") || lower.includes("lb") || lower.includes("slb")) return "lb";
  return undefined;
}

/** Expand a name to itself + any address-group transitively containing it. */
export function expandAddressNames(name: string, cfg: ParsedConfig): Set<string> {
  if (name === "any") return new Set(["any"]);
  const cache = idx(cfg).expandAddr;
  const cached = cache.get(name);
  if (cached) return cached;
  // Build a reverse "member -> containing-group" index lazily once per cfg
  // (stored inside expandAddr under a sentinel key) to avoid scanning all
  // groups on every iteration.
  const out = new Set<string>([name]);
  const reverse = getReverseAddrGroupIndex(cfg);
  const stack = [name];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    const parents = reverse.get(cur);
    if (!parents) continue;
    parents.forEach((p) => {
      if (seen.has(p)) return;
      seen.add(p);
      out.add(p);
      stack.push(p);
    });
  }
  cache.set(name, out);
  return out;
}

const addrReverseCache = new WeakMap<ParsedConfig, Map<string, string[]>>();
function getReverseAddrGroupIndex(cfg: ParsedConfig): Map<string, string[]> {
  let m = addrReverseCache.get(cfg);
  if (m) return m;
  m = new Map();
  cfg.addressGroups.forEach((g) => {
    g.members.forEach((mem) => {
      const cur = m!.get(mem);
      if (cur) cur.push(g.name);
      else m!.set(mem, [g.name]);
    });
  });
  addrReverseCache.set(cfg, m);
  return m;
}

/** Expand a service name to itself + any service-group transitively containing it. */
export function expandServiceNames(name: string, cfg: ParsedConfig): Set<string> {
  if (name === "any") return new Set(["any"]);
  const cache = idx(cfg).expandSvc;
  const cached = cache.get(name);
  if (cached) return cached;
  const out = new Set<string>([name]);
  const reverse = getReverseSvcGroupIndex(cfg);
  const stack = [name];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    const parents = reverse.get(cur);
    if (!parents) continue;
    parents.forEach((p) => {
      if (seen.has(p)) return;
      seen.add(p);
      out.add(p);
      stack.push(p);
    });
  }
  cache.set(name, out);
  return out;
}

const svcReverseCache = new WeakMap<ParsedConfig, Map<string, string[]>>();
function getReverseSvcGroupIndex(cfg: ParsedConfig): Map<string, string[]> {
  let m = svcReverseCache.get(cfg);
  if (m) return m;
  m = new Map();
  cfg.serviceGroups.forEach((g) => {
    g.members.forEach((mem) => {
      const cur = m!.get(mem);
      if (cur) cur.push(g.name);
      else m!.set(mem, [g.name]);
    });
  });
  svcReverseCache.set(cfg, m);
  return m;
}

// ---------- literal IP / CIDR support ----------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

export function isIpLiteral(s: string): boolean {
  return IPV4.test(s) || CIDR.test(s);
}

function ipToInt(ip: string): number | null {
  const m = ip.match(IPV4);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const m = cidr.match(CIDR);
  if (!m) return false;
  const base = ipToInt(m.slice(1, 5).join("."));
  const bits = Number(m[5]);
  const i = ipToInt(ip);
  if (base == null || i == null || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (i & mask) === (base & mask);
}

function inRange(ip: string, range: string): boolean {
  const [a, b] = range.split("-").map((s) => s.trim());
  const ai = ipToInt(a);
  const bi = ipToInt(b);
  const i = ipToInt(ip);
  if (ai == null || bi == null || i == null) return false;
  return i >= ai && i <= bi;
}

/** Address object names whose entries contain `ip` (literal IPv4). */
export function findAddressesContainingIp(ip: string, cfg: ParsedConfig): string[] {
  if (!IPV4.test(ip)) return [];
  const cache = idx(cfg).addrContainsIp;
  const cached = cache.get(ip);
  if (cached) return cached;
  const hits: string[] = [];
  cfg.addresses.forEach((a) => {
    const ok = a.entries.some((e) => {
      if (e.kind === "host") return e.value === ip;
      if (e.kind === "net") return inCidr(ip, e.value);
      if (e.kind === "range") return inRange(ip, e.value);
      return false;
    });
    if (ok) hits.push(a.name);
  });
  cache.set(ip, hits);
  return hits;
}

/** Build the expanded name set for a user input (object name OR literal IP). */
export function resolveEndpoint(
  input: string,
  cfg: ParsedConfig,
): { names: Set<string>; literalHits: string[] } {
  if (input === "any") return { names: new Set(["any"]), literalHits: [] };
  if (isIpLiteral(input)) {
    const hits = findAddressesContainingIp(input, cfg);
    const names = new Set<string>();
    hits.forEach((n) => expandAddressNames(n, cfg).forEach((x) => names.add(x)));
    return { names, literalHits: hits };
  }
  return { names: expandAddressNames(input, cfg), literalHits: [] };
}

// ---------- service summary ----------

export function summarizeService(name: string, cfg: ParsedConfig): string {
  if (!name || name === "any") return name || "—";
  return serviceToPorts(name, cfg).join(", ");
}

// ---------- per-node aggregates for intermediaries page ----------

export interface NodeAggregate {
  name: string;
  cat: IntermediaryCat;
  address?: string;
  lineNo?: number;
  // 谁可以访问该节点（前端→节点）
  inboundPolicies: PolicyRule[];
  // 节点对外（节点→后端）
  outboundPolicies: PolicyRule[];
  // 外部 DNAT 落到该节点（外部 IP:port → 节点）
  inboundDnat: NatRule[];
  // 暴露端口（来自 DNAT 的 servicePort / origDstService）
  exposedPorts: string[];
}

export function buildNodeAggregates(cfg: ParsedConfig, showDisabled = false): NodeAggregate[] {
  const map = new Map<string, NodeAggregate>();
  const ensure = (name: string, cat: IntermediaryCat, address?: string, lineNo?: number) => {
    const cur = map.get(name);
    if (cur) {
      if (!cur.address && address) cur.address = address;
      if (!cur.lineNo && lineNo) cur.lineNo = lineNo;
      return cur;
    }
    const n: NodeAggregate = {
      name,
      cat,
      address,
      lineNo,
      inboundPolicies: [],
      outboundPolicies: [],
      inboundDnat: [],
      exposedPorts: [],
    };
    map.set(name, n);
    return n;
  };

  cfg.addresses.forEach((a) => {
    const c = classifyIntermediary(a.name);
    if (c) ensure(a.name, c, a.entries[0]?.value, a.lineNo);
  });
  cfg.addressGroups.forEach((g) => {
    const c = classifyIntermediary(g.name);
    if (c) ensure(g.name, c, undefined, g.lineNo);
  });
  cfg.natPools.forEach((p) => {
    const c = classifyIntermediary(p.name);
    if (c) {
      const addr =
        p.addressFrom && p.addressTo && p.addressFrom !== p.addressTo
          ? `${p.addressFrom}-${p.addressTo}`
          : p.addressFrom;
      ensure(p.name, c, addr, p.lineNo);
    }
  });

  cfg.policies.forEach((p) => {
    const a = map.get(p.srcAddr);
    if (a) a.outboundPolicies.push(p);
    const b = map.get(p.dstAddr);
    if (b) b.inboundPolicies.push(p);
  });
  visibleNatRules(cfg, showDisabled).forEach((r) => {
    const n = map.get(r.translatedPool);
    if (n) {
      n.inboundDnat.push(r);
      // Exposed ports are the real ports behind the service token: a service
      // group name must not show up where a port is expected.
      const token = r.servicePort ?? r.origDstService;
      if (token) {
        serviceToPorts(token, cfg).forEach((p) => {
          if (!n.exposedPorts.includes(p)) n.exposedPorts.push(p);
        });
      }
    }
  });

  return [...map.values()].sort(
    (a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name),
  );
}

export type SvcRefKind = "service" | "service-group" | "builtin" | "literal" | "any";

/** What a service token really refers to: a service object, a service group
 *  (several objects), a literal port/protocol, or the `any` wildcard. The UI
 *  uses this so a group name like `172.23.51.9` never reads as a port. */
export function serviceRefKind(name: string, cfg: ParsedConfig): SvcRefKind {
  if (!name || name === "any") return "any";
  const i = lookupIndex(cfg);
  if (i.svcByName.has(name)) return "service";
  if (i.svcGrpByName.has(name)) return "service-group";
  if (getBuiltinService(name)) return "builtin";
  return "literal";
}

// ---------- flow model: aggregate src→dst with DNAT + policies ----------

export interface FlowDnatEntry {
  rule: NatRule;
  entryAddr: string;
  entryPort: string; // "" if any
  backendPort: string; // "" if not translated; equals entryPort when no port change
  /** Literal ports behind entryPort / backendPort (["any"] when unrestricted). */
  entryPorts: string[];
  backendPorts: string[];
  /** Whether each service token is an object, a group, a literal or `any`. */
  entryKind: SvcRefKind;
  backendKind: SvcRefKind;
}

export interface FlowSnatEntry {
  rule: NatRule;
  /** SNAT 服务在策略匹配前展开为真实协议 / 端口。 */
  ports: string[];
}

export interface FlowPolicySegment {
  policy: PolicyRule;
  ports: string[]; // expanded literal ports (or ["any"])
}

export type CoverageKind = "ok" | "partial" | "orphan" | "no-nat";

export interface FlowCoverage {
  kind: CoverageKind;
  exposed: string[]; // expanded DNAT backend ports
  gap: string[]; // exposed ports not covered by any permit
}

export interface Flow {
  key: string;
  src: string;
  dst: string;
  dnat: FlowDnatEntry[];
  snat: FlowSnatEntry[];
  policies: FlowPolicySegment[];
  permitPorts: Set<string>;
  denyPorts: Set<string>;
  allPorts: Set<string>; // union of dnat ports + policy ports (for service facet)
  coverage: FlowCoverage;
}

/** Expand a service name (object/group) to literal "proto/port" strings. */
export function serviceToPorts(name: string, cfg: ParsedConfig, seen?: Set<string>): string[] {
  if (!name || name === "any") return ["any"];
  // Top-level memoized path. Recursive calls pass a `seen` set to break cycles
  // and must skip the cache to avoid polluting it with partial results.
  if (!seen) {
    const cache = idx(cfg).service;
    const hit = cache.get(name);
    if (hit) return hit;
    const result = serviceToPorts(name, cfg, new Set());
    cache.set(name, result);
    return result;
  }
  if (seen.has(name)) return [];
  seen.add(name);
  const i = idx(cfg);
  const svc = i.svcByName.get(name);
  if (svc) {
    return svc.entries.map((e) => (e.destPort ? `${e.protocol}/${e.destPort}` : e.protocol));
  }
  const grp = i.svcGrpByName.get(name);
  if (grp) {
    const out = new Set<string>();
    grp.members.forEach((m) => serviceToPorts(m, cfg, seen).forEach((p) => out.add(p)));
    return [...out];
  }
  const builtin = getBuiltinService(name);
  if (builtin) {
    return builtin.entries.map((entry) =>
      entry.destPort ? `${entry.protocol}/${entry.destPort}` : entry.protocol,
    );
  }
  return [name]; // literal "tcp/443" or unknown
}

/** Service object names behind a token that resolve to one concrete port.
 * Groups contribute their matching leaf object names, not just the group name. */
export function serviceNamesForPort(name: string, port: string, cfg: ParsedConfig): string[] {
  if (!name || name === "any") return [];
  const cache = idx(cfg).serviceNames;
  const key = `${name}\0${port}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const out = new Set<string>();
  const addIfMatches = (candidate: string) => {
    const ports = serviceToPorts(candidate, cfg);
    if (port === "any" || ports.includes("any")) {
      out.add(candidate);
      return;
    }
    // A port written bare (`443`) carries no protocol, so it has to overlap a
    // service's own proto/port (https → tcp/443) instead of matching by string.
    if (ports.some((q) => portCovers(q, port) || portCovers(port, q))) out.add(candidate);
  };
  const i = idx(cfg);
  if (i.svcByName.has(name)) addIfMatches(name);
  else if (i.svcGrpByName.has(name)) {
    serviceGroupMembers(name, cfg).forEach((member) => addIfMatches(member.name));
  } else if (getBuiltinService(name)) addIfMatches(name);

  const result = [...out];
  cache.set(key, result);
  return result;
}

export function buildFlows(cfg: ParsedConfig, showDisabled = false): Flow[] {
  const map = new Map<string, Flow>();
  const ensure = (src: string, dst: string): Flow => {
    const k = `${src}\t${dst}`;
    let f = map.get(k);
    if (!f) {
      f = {
        key: k,
        src,
        dst,
        dnat: [],
        snat: [],
        policies: [],
        permitPorts: new Set(),
        denyPorts: new Set(),
        allPorts: new Set(),
        coverage: { kind: "no-nat", exposed: [], gap: [] },
      };
      map.set(k, f);
    }
    return f;
  };

  visibleNatRules(cfg, showDisabled).forEach((n) => {
    if (n.kind !== "destination" && n.kind !== "static") return;
    if (!n.translatedPool) return;
    const entryPort = n.origDstService && n.origDstService !== "any" ? n.origDstService : "";
    const backendPort = n.servicePort || entryPort;
    const entryPorts = entryPort ? serviceToPorts(entryPort, cfg) : ["any"];
    const backendPorts = backendPort ? serviceToPorts(backendPort, cfg) : ["any"];
    const f = ensure(n.srcAddr || "any", n.translatedPool);
    f.dnat.push({
      rule: n,
      entryAddr: n.origDstAddr,
      entryPort,
      backendPort,
      entryPorts,
      backendPorts,
      entryKind: serviceRefKind(entryPort, cfg),
      backendKind: serviceRefKind(backendPort, cfg),
    });
    backendPorts.forEach((p) => f.allPorts.add(p));
  });

  visibleNatRules(cfg, showDisabled).forEach((n) => {
    if (n.kind !== "source") return;
    const ports = serviceToPorts(n.origDstService || "any", cfg);
    const f = ensure(n.srcAddr || "any", n.origDstAddr || "any");
    f.snat.push({ rule: n, ports });
    ports.forEach((p) => f.allPorts.add(p));
  });

  // 禁用或已过期的策略仍保留在策略列表和对象引用中，但不能形成有效访问路径。
  cfg.policies
    .filter((p) => !p.disabled && !isPolicyExpired(p, cfg))
    .forEach((p) => {
      const f = ensure(p.srcAddr, p.dstAddr);
      const ports = serviceToPorts(p.service, cfg);
      f.policies.push({ policy: p, ports });
      ports.forEach((port) => {
        f.allPorts.add(port);
        if (p.action === "permit") f.permitPorts.add(port);
        else if (p.action === "deny") f.denyPorts.add(port);
      });
    });

  map.forEach((f) => {
    f.policies.sort(
      (a, b) => Number(a.policy.id) - Number(b.policy.id) || a.policy.lineNo - b.policy.lineNo,
    );
    if (f.dnat.length === 0) {
      f.coverage = { kind: "no-nat", exposed: [], gap: [] };
      return;
    }
    const exposedSet = new Set<string>();
    f.dnat.forEach((d) => {
      const ports = d.backendPort ? serviceToPorts(d.backendPort, cfg) : ["any"];
      ports.forEach((p) => exposedSet.add(p));
    });
    const exposed = [...exposedSet];
    const hasAnyPermit = f.permitPorts.has("any");
    const gap = hasAnyPermit ? [] : exposed.filter((p) => p !== "any" && !f.permitPorts.has(p));
    const kind: CoverageKind =
      f.permitPorts.size === 0 ? "orphan" : gap.length === 0 ? "ok" : "partial";
    f.coverage = { kind, exposed, gap };
  });

  return [...map.values()];
}

export interface FacetOption {
  name: string;
  count: number;
}

export interface FlowFilter {
  src?: string;
  dst?: string;
  svc?: string;
  onlyDnat?: boolean;
  onlyAbnormal?: boolean;
}

function flowMatchSrc(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.src === "any") return true;
  if (f.src === value) return true;
  // literal IP / object — expand and check membership
  const names = resolveEndpoint(value, cfg).names;
  return names.has(f.src);
}

function flowMatchDst(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.dst === "any") return true;
  if (f.dst === value) return true;
  const names = resolveEndpoint(value, cfg).names;
  return names.has(f.dst);
}

// ---------- focus lines: per (src,dst,proto,port,action) row ----------

export interface FocusLine {
  key: string;
  src: string;
  dst: string;
  proto: string; // "tcp" | "udp" | "ip" | "any"
  port: string; // "8443" | "any"
  service: string; // "tcp/8443" or "any"
  serviceNames: string[]; // service object names resolving to this port
  action: string; // "permit" | "deny" | "none" | ...
  policies: PolicyRule[];
  nat: FlowDnatEntry[];
  snat: FlowSnatEntry[];
  coverageKind: CoverageKind;
}

const BARE_PORT = /^\d+(?:-\d+)?$/;

function parsePortStr(p: string): { proto: string; port: string } {
  if (!p || p === "any") return { proto: "any", port: "any" };
  const idx = p.indexOf("/");
  if (idx < 0) {
    // A bare number is a port the config wrote without a protocol, not a
    // protocol name. Reading it as a protocol made `443` never match `tcp/443`.
    if (BARE_PORT.test(p.trim())) return { proto: "ip", port: p.trim() };
    return { proto: p, port: "any" };
  }
  return { proto: p.slice(0, idx), port: p.slice(idx + 1) };
}

/** Row label for a resolved proto/port pair. A wildcard protocol is dropped so
 *  a port the config wrote bare (`443`) still reads bare instead of `ip/443`. */
function svcLabel(proto: string, port: string): string {
  if (port === "any") return "any";
  return proto === "ip" || proto === "any" ? port : `${proto}/${port}`;
}

function pickMatchingDnat(dnats: FlowDnatEntry[], svc: string, cfg: ParsedConfig): FlowDnatEntry[] {
  if (dnats.length === 0) return [];
  if (svc === "any") return dnats;
  return dnats.filter((d) => {
    const ports = d.backendPort ? serviceToPorts(d.backendPort, cfg) : ["any"];
    return ports.some((p) => p === "any" || portCovers(p, svc) || portCovers(svc, p));
  });
}

// ---------- address / service overlap matching (NAT ↔ policy association) ----------

/** Recursively expand an address(-group) to all member address-object names. */
function collectAddressMembers(name: string, cfg: ParsedConfig, seen?: Set<string>): Set<string> {
  if (!seen) {
    const cache = idx(cfg).members;
    const hit = cache.get(name);
    if (hit) return hit;
    const r = collectAddressMembers(name, cfg, new Set());
    cache.set(name, r);
    return r;
  }
  const out = new Set<string>();
  if (seen.has(name)) return out;
  seen.add(name);
  out.add(name);
  const grp = idx(cfg).grpByName.get(name);
  if (grp) {
    grp.members.forEach((m) => {
      collectAddressMembers(m, cfg, seen).forEach((x) => out.add(x));
    });
  }
  return out;
}

/** Literal endpoint extracted from an address/group/pool/IP-literal. */
type AddrEndpoint =
  | { kind: "host"; value: string }
  | { kind: "net"; value: string }
  | { kind: "range"; value: string }
  | { kind: "domain"; value: string }
  | { kind: "mac"; value: string };

function addrEndpoints(name: string, cfg: ParsedConfig, seen?: Set<string>): AddrEndpoint[] {
  if (!name) return [];
  if (!seen) {
    const cache = idx(cfg).endpoints;
    const hit = cache.get(name);
    if (hit) return hit;
    const r = addrEndpoints(name, cfg, new Set());
    cache.set(name, r);
    return r;
  }
  if (seen.has(name)) return [];
  seen.add(name);

  if (isIpLiteral(name)) {
    return CIDR.test(name) ? [{ kind: "net", value: name }] : [{ kind: "host", value: name }];
  }

  const i = idx(cfg);
  const obj = i.addrByName.get(name);
  if (obj) {
    return obj.entries.map((e) => ({ kind: e.kind, value: e.value })) as AddrEndpoint[];
  }

  const pool = i.poolByName.get(name);
  if (pool && pool.addressFrom) {
    if (pool.addressTo && pool.addressTo !== pool.addressFrom) {
      return [{ kind: "range", value: `${pool.addressFrom}-${pool.addressTo}` }];
    }
    return [{ kind: "host", value: pool.addressFrom }];
  }

  const grp = i.grpByName.get(name);
  if (grp) {
    const out: AddrEndpoint[] = [];
    grp.members.forEach((m) => addrEndpoints(m, cfg, seen).forEach((e) => out.push(e)));
    return out;
  }

  return [];
}

/** Numeric [start,end] range for an IP-bearing endpoint. */
function endpointIpRange(e: AddrEndpoint): [number, number] | null {
  if (e.kind === "host") {
    const i = ipToInt(e.value);
    return i == null ? null : [i, i];
  }
  if (e.kind === "net") {
    const m = e.value.match(CIDR);
    if (!m) return null;
    const base = ipToInt(m.slice(1, 5).join("."));
    const bits = Number(m[5]);
    if (base == null || bits < 0 || bits > 32) return null;
    if (bits === 0) return [0, 0xffffffff];
    const mask = (~0 << (32 - bits)) >>> 0;
    const start = (base & mask) >>> 0;
    const end = (start | (~mask >>> 0)) >>> 0;
    return [start, end];
  }
  if (e.kind === "range") {
    const [a, b] = e.value.split("-").map((s) => s.trim());
    const ai = ipToInt(a);
    const bi = ipToInt(b);
    if (ai == null || bi == null) return null;
    return [Math.min(ai, bi), Math.max(ai, bi)];
  }
  return null;
}

function rangesOverlap(x: [number, number], y: [number, number]): boolean {
  return x[0] <= y[1] && y[0] <= x[1];
}

/** True iff A and B have real overlap.
 *  - `any` on either side matches everything.
 *  - Identical name strings match.
 *  - Otherwise both sides are expanded to literal endpoints and must overlap
 *    on IP range / domain value / MAC value. No "shared name" shortcut —
 *    if both sides resolve to disjoint IPs, they DO NOT match. */
const addrMatchCache = new WeakMap<ParsedConfig, Map<string, boolean>>();
const rangeCache = new WeakMap<ParsedConfig, Map<string, [number, number][]>>();

function endpointRangesFor(name: string, cfg: ParsedConfig): [number, number][] {
  let m = rangeCache.get(cfg);
  if (!m) {
    m = new Map();
    rangeCache.set(cfg, m);
  }
  const hit = m.get(name);
  if (hit) return hit;
  const r = addrEndpoints(name, cfg)
    .map(endpointIpRange)
    .filter((x): x is [number, number] => x !== null);
  m.set(name, r);
  return r;
}

export function addrMatches(a: string, b: string, cfg: ParsedConfig): boolean {
  if (!a || !b) return false;
  if (a === "any" || b === "any") return true;
  if (a === b) return true;

  let cache = addrMatchCache.get(cfg);
  if (!cache) {
    cache = new Map();
    addrMatchCache.set(cfg, cache);
  }
  const key = a < b ? `${a}\t${b}` : `${b}\t${a}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const A = addrEndpoints(a, cfg);
  const B = addrEndpoints(b, cfg);
  let result = false;
  if (A.length === 0 || B.length === 0) {
    result = false;
  } else {
    // domain / mac: exact value match
    outer: for (const ea of A) {
      if (ea.kind !== "domain" && ea.kind !== "mac") continue;
      for (const eb of B) {
        if (eb.kind === ea.kind && eb.value === ea.value) {
          result = true;
          break outer;
        }
      }
    }
    if (!result) {
      const aR = endpointRangesFor(a, cfg);
      const bR = endpointRangesFor(b, cfg);
      outer2: for (const x of aR) {
        for (const y of bR) {
          if (rangesOverlap(x, y)) {
            result = true;
            break outer2;
          }
        }
      }
    }
  }
  cache.set(key, result);
  return result;
}

/** True if policy service covers natPort (proto/port literal), or either is "any". */
export function svcMatches(policySvc: string, natPort: string, cfg: ParsedConfig): boolean {
  if (!policySvc || !natPort) return false;
  if (policySvc === "any" || natPort === "any") return true;
  const polPorts = serviceToPorts(policySvc, cfg);
  const natPorts = serviceToPorts(natPort, cfg);
  return natPorts.some((n) => polPorts.some((q) => portCovers(q, n)));
}

function portRange(port: string): [number, number] | null {
  if (!port || port === "any") return [0, 65535];
  const m = /^(\d+)(?:-(\d+))?$/.exec(port.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

/** True if literal port `outer` (e.g. "tcp/30000-40000", "ip", "any") overlaps
 *  literal port `inner` (e.g. "tcp/32081"). Protocol must agree unless one side
 *  is a wildcard protocol (any / ip). */
export function portCovers(outer: string, inner: string): boolean {
  if (outer === inner) return true;
  const o = parsePortStr(outer);
  const n = parsePortStr(inner);
  const wild = (x: string) => x === "any" || x === "ip";
  if (!wild(o.proto) && !wild(n.proto) && o.proto.toLowerCase() !== n.proto.toLowerCase())
    return false;
  // A protocol written without a port (`icmp`, `ike`) says nothing about port
  // numbers, so it only covers a concrete port when the protocols agree.
  if (
    o.port === "any" &&
    !wild(o.proto) &&
    n.port !== "any" &&
    o.proto.toLowerCase() !== n.proto.toLowerCase()
  )
    return false;
  const ro = portRange(o.port);
  const rn = portRange(n.port);
  if (!ro || !rn) return o.port === n.port;
  return ro[0] <= rn[1] && rn[0] <= ro[1];
}

/** Full containment used only when collapsing a duplicate Direct row. Unlike
 * policy association, overlap is not enough: a broader direct path must stay
 * visible for the sources, destinations or ports not covered by NAT. */
function addrFullyCovers(outer: string, inner: string, cfg: ParsedConfig): boolean {
  if (outer === "any") return true;
  if (inner === "any") return false;
  if (outer === inner) return true;
  const outerEndpoints = addrEndpoints(outer, cfg);
  const innerEndpoints = addrEndpoints(inner, cfg);
  if (outerEndpoints.length === 0 || innerEndpoints.length === 0) return false;
  return innerEndpoints.every((innerEndpoint) => {
    if (innerEndpoint.kind === "domain" || innerEndpoint.kind === "mac") {
      return outerEndpoints.some(
        (outerEndpoint) =>
          outerEndpoint.kind === innerEndpoint.kind && outerEndpoint.value === innerEndpoint.value,
      );
    }
    const innerRange = endpointIpRange(innerEndpoint);
    if (!innerRange) return false;
    return outerEndpoints.some((outerEndpoint) => {
      const outerRange = endpointIpRange(outerEndpoint);
      return (
        outerRange !== null && outerRange[0] <= innerRange[0] && outerRange[1] >= innerRange[1]
      );
    });
  });
}

function portFullyCovers(outer: string, inner: string): boolean {
  if (outer === inner || outer === "any" || outer === "ip") return true;
  if (inner === "any" || inner === "ip") return false;
  const o = parsePortStr(outer);
  const n = parsePortStr(inner);
  if (o.proto !== n.proto && o.proto !== "any" && o.proto !== "ip") return false;
  const ro = portRange(o.port);
  const rn = portRange(n.port);
  if (!ro || !rn) return o.port === n.port;
  return ro[0] <= rn[0] && ro[1] >= rn[1];
}

/** Find permit policies whose src+dst+service cover this DNAT under the given flow source. */
export function findCoveringPolicies(
  entry: FlowDnatEntry,
  flowSrc: string,
  cfg: ParsedConfig,
): PolicyRule[] {
  const target = entry.rule.translatedPool;
  const port = entry.backendPort || "any";
  const src = flowSrc || "any";
  return cfg.policies.filter(
    (p) =>
      !p.disabled &&
      !isPolicyExpired(p, cfg) &&
      p.action === "permit" &&
      addrMatches(p.srcAddr, src, cfg) &&
      addrMatches(p.dstAddr, target, cfg) &&
      svcMatches(p.service, port, cfg),
  );
}

/** SNAT 与策略按转换前的原始源、原目的和服务关联；转换后源不参与匹配。 */
export function findMatchingSnatPolicies(entry: FlowSnatEntry, cfg: ParsedConfig): PolicyRule[] {
  const rule = entry.rule;
  return cfg.policies.filter(
    (p) =>
      !p.disabled &&
      !isPolicyExpired(p, cfg) &&
      addrMatches(p.srcAddr, rule.srcAddr || "any", cfg) &&
      addrMatches(p.dstAddr, rule.origDstAddr || "any", cfg) &&
      svcMatches(p.service, rule.origDstService || "any", cfg),
  );
}

export function buildFocusLines(flows: Flow[], cfg: ParsedConfig): FocusLine[] {
  const out: FocusLine[] = [];
  const directOut: FocusLine[] = [];
  flows.forEach((f) => {
    // DNAT-bearing flows: emit one row per exposed (proto/port) by cross-policy coverage.
    if (f.dnat.length > 0) {
      const portMap = new Map<
        string,
        {
          proto: string;
          port: string;
          service: string;
          dnats: FlowDnatEntry[];
          policies: PolicyRule[];
          seen: Set<string>;
        }
      >();
      f.dnat.forEach((d) => {
        const ports = d.backendPort ? serviceToPorts(d.backendPort, cfg) : ["any"];
        const covering = findCoveringPolicies(d, f.src, cfg);
        ports.forEach((p) => {
          const { proto, port } = parsePortStr(p);
          const svc = svcLabel(proto, port);
          let g = portMap.get(svc);
          if (!g) {
            g = {
              proto,
              port,
              service: svc,
              dnats: [],
              policies: [],
              seen: new Set(),
            };
            portMap.set(svc, g);
          }
          if (!g.dnats.includes(d)) g.dnats.push(d);
          // Each port row keeps only the policies whose service really covers that port.
          covering.filter((pol) => svcMatches(pol.service, p, cfg)).forEach((pol) => {
            const k = `${pol.id}@${pol.lineNo}`;
            if (!g!.seen.has(k)) {
              g!.seen.add(k);
              g!.policies.push(pol);
            }
          });
        });
      });
      portMap.forEach((g) => {
        const associated = g.policies.length > 0;
        const sorted = g.policies.sort(
          (a, b) => Number(a.id) - Number(b.id) || a.lineNo - b.lineNo,
        );
        const natServiceNames = [
          ...new Set(g.dnats.flatMap((d) => serviceNamesForPort(d.backendPort, g.service, cfg))),
        ];
        const policyServiceNames = [
          ...new Set(sorted.flatMap((p) => serviceNamesForPort(p.service, g.service, cfg))),
        ];
        out.push({
          key: `${f.key}\t${g.service}\t${associated ? "associated" : "unassociated"}`,
          src: f.src,
          dst: f.dst,
          proto: g.proto,
          port: g.port,
          service: g.service,
          serviceNames: natServiceNames.length > 0 ? natServiceNames : policyServiceNames,
          action: associated ? "associated" : "unassociated",
          policies: sorted,
          nat: g.dnats,
          snat: [],
          coverageKind: associated ? "ok" : "orphan",
        });
      });
      if (f.snat.length === 0) return;
    }

    // SNAT：服务来自原始服务字段，策略按转换前的源、目的和服务匹配。
    if (f.snat.length > 0) {
      const portMap = new Map<
        string,
        {
          proto: string;
          port: string;
          service: string;
          snats: FlowSnatEntry[];
          policies: PolicyRule[];
          seen: Set<string>;
        }
      >();
      f.snat.forEach((entry) => {
        const matching = findMatchingSnatPolicies(entry, cfg);
        entry.ports.forEach((p) => {
          const { proto, port } = parsePortStr(p);
          const svc = svcLabel(proto, port);
          let g = portMap.get(svc);
          if (!g) {
            g = { proto, port, service: svc, snats: [], policies: [], seen: new Set() };
            portMap.set(svc, g);
          }
          if (!g.snats.includes(entry)) g.snats.push(entry);
          matching.forEach((policy) => {
            if (!svcMatches(policy.service, svc, cfg)) return;
            const key = `${policy.id}@${policy.lineNo}`;
            if (g!.seen.has(key)) return;
            g!.seen.add(key);
            g!.policies.push(policy);
          });
        });
      });
      portMap.forEach((g) => {
        const sorted = g.policies.sort(
          (a, b) => Number(a.id) - Number(b.id) || a.lineNo - b.lineNo,
        );
        const associated = sorted.some((p) => p.action === "permit");
        const denied = sorted.some((p) => p.action === "deny");
        const action = associated ? "associated" : denied ? "deny" : "unassociated";
        const natServiceNames = [
          ...new Set(
            g.snats.flatMap((entry) =>
              serviceNamesForPort(entry.rule.origDstService, g.service, cfg),
            ),
          ),
        ];
        const policyServiceNames = [
          ...new Set(sorted.flatMap((p) => serviceNamesForPort(p.service, g.service, cfg))),
        ];
        out.push({
          key: `${f.key}\t${g.service}\t${action}\tSNAT`,
          src: f.src,
          dst: f.dst,
          proto: g.proto,
          port: g.port,
          service: g.service,
          serviceNames: natServiceNames.length > 0 ? natServiceNames : policyServiceNames,
          action,
          policies: sorted,
          nat: [],
          snat: g.snats,
          coverageKind: associated ? "ok" : "orphan",
        });
      });
      return;
    }

    // Pure policy chain (no NAT) — original permit/deny row emission.
    const groups = new Map<
      string,
      { proto: string; port: string; action: string; policies: PolicyRule[] }
    >();
    f.policies.forEach((seg) => {
      seg.ports.forEach((p) => {
        const { proto, port } = parsePortStr(p);
        const k = `${proto}\t${port}\t${seg.policy.action}`;
        let g = groups.get(k);
        if (!g) {
          g = { proto, port, action: seg.policy.action, policies: [] };
          groups.set(k, g);
        }
        if (!g.policies.includes(seg.policy)) g.policies.push(seg.policy);
      });
    });
    groups.forEach((g) => {
      const svc = svcLabel(g.proto, g.port);
      directOut.push({
        key: `${f.key}\t${svc}\t${g.action}`,
        src: f.src,
        dst: f.dst,
        proto: g.proto,
        port: g.port,
        service: svc,
        serviceNames: [
          ...new Set(g.policies.flatMap((p) => serviceNamesForPort(p.service, svc, cfg))),
        ],
        action: g.action,
        policies: g.policies.sort((a, b) => Number(a.id) - Number(b.id) || a.lineNo - b.lineNo),
        nat: [],
        snat: [],
        coverageKind: f.coverage.kind,
      });
    });
  });

  // A policy is first-class evidence for a Direct path, but the very same
  // policy may already be attached to an equivalent DNAT path above. Remove
  // only that exact duplicate; broader any/group paths remain because they
  // also describe real direct access outside the NAT rule's coverage.
  directOut.forEach((line) => {
    const policies = line.policies.filter(
      (policy) =>
        !out.some(
          (natLine) =>
            natLine.policies.some((p) => p.id === policy.id && p.lineNo === policy.lineNo) &&
            addrFullyCovers(natLine.src, line.src, cfg) &&
            addrFullyCovers(natLine.dst, line.dst, cfg) &&
            portFullyCovers(natLine.service, line.service),
        ),
    );
    if (policies.length === 0) return;
    out.push(
      policies.length === line.policies.length
        ? line
        : {
            ...line,
            policies,
            serviceNames: [
              ...new Set(
                policies.flatMap((p) => serviceNamesForPort(p.service, line.service, cfg)),
              ),
            ],
          },
    );
  });
  return out;
}

export type FocusType = "src" | "dst" | "svc";

export interface FocusCandidate {
  id: string; // object name OR "tcp/8443"
  count: number; // number of lines hitting this candidate
}

export function focusCandidates(lines: FocusLine[], focus: FocusType): FocusCandidate[] {
  const m = new Map<string, number>();
  lines.forEach((l) => {
    const key = focus === "src" ? l.src : focus === "dst" ? l.dst : l.service;
    m.set(key, (m.get(key) ?? 0) + 1);
  });
  return [...m.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort(
      (a, b) =>
        (a.id === "any" ? 1 : 0) - (b.id === "any" ? 1 : 0) ||
        b.count - a.count ||
        a.id.localeCompare(b.id),
    );
}

export function filterLinesByFocus(
  lines: FocusLine[],
  focus: FocusType,
  id: string,
  cfg?: ParsedConfig,
): FocusLine[] {
  if (!id) return [];
  const expand =
    cfg && (focus === "src" || focus === "dst") ? collectAddressMembers(id, cfg) : null;
  return lines.filter((l) => {
    if (focus === "src") {
      if (id === "any") return l.src === "any";
      if (l.src === "any") return false;
      if (l.src === id) return true;
      if (expand && expand.has(l.src)) return true;
      if (cfg) {
        const lExp = collectAddressMembers(l.src, cfg);
        if (lExp.has(id)) return true;
        for (const x of lExp) if (expand?.has(x)) return true;
      }
      return false;
    }
    if (focus === "dst") {
      if (id === "any") return l.dst === "any";
      if (l.dst === "any") return false;
      if (l.dst === id) return true;
      if (expand && expand.has(l.dst)) return true;
      if (cfg) {
        const lExp = collectAddressMembers(l.dst, cfg);
        if (lExp.has(id)) return true;
        for (const x of lExp) if (expand?.has(x)) return true;
      }
      return false;
    }
    if (l.service === id) return true;
    // A service object / group name, or a literal port inside a range, still
    // selects the lines whose real ports it overlaps.
    if (!cfg || id === "any" || l.service === "any") return false;
    return serviceToPorts(id, cfg).some(
      (p) => portCovers(p, l.service) || portCovers(l.service, p),
    );
  });
}

function flowMatchSvc(f: Flow, value: string | undefined, cfg: ParsedConfig): boolean {
  if (!value || value === "any") return true;
  if (f.allPorts.has("any")) return true;
  const ports = serviceToPorts(value, cfg);
  return ports.some((p) => p === "any" || f.allPorts.has(p));
}

export function filterFlows(flows: Flow[], cfg: ParsedConfig, filter: FlowFilter): Flow[] {
  return flows.filter((f) => {
    if (!flowMatchSrc(f, filter.src, cfg)) return false;
    if (!flowMatchDst(f, filter.dst, cfg)) return false;
    if (!flowMatchSvc(f, filter.svc, cfg)) return false;
    if (filter.onlyDnat && f.dnat.length === 0) return false;
    if (filter.onlyAbnormal && f.coverage.kind !== "orphan" && f.coverage.kind !== "partial")
      return false;
    return true;
  });
}

/** Facet options for one field, computed from flows filtered by the OTHER fields. */
export function facetFor(
  flows: Flow[],
  cfg: ParsedConfig,
  field: "src" | "dst" | "svc",
  filter: FlowFilter,
): FacetOption[] {
  const sub: FlowFilter = { ...filter };
  if (field === "src") sub.src = undefined;
  if (field === "dst") sub.dst = undefined;
  if (field === "svc") sub.svc = undefined;
  const list = filterFlows(flows, cfg, sub);
  const m = new Map<string, number>();
  if (field === "src") {
    list.forEach((f) => m.set(f.src, (m.get(f.src) ?? 0) + 1));
  } else if (field === "dst") {
    list.forEach((f) => m.set(f.dst, (m.get(f.dst) ?? 0) + 1));
  } else {
    list.forEach((f) => f.allPorts.forEach((p) => m.set(p, (m.get(p) ?? 0) + 1)));
  }
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sortFlows(flows: Flow[]): Flow[] {
  const score = (f: Flow): number => {
    if (f.coverage.kind === "orphan") return 0;
    if (f.coverage.kind === "partial") return 1;
    if (f.dnat.length > 0) return 2;
    return 3;
  };
  return [...flows].sort(
    (a, b) => score(a) - score(b) || a.src.localeCompare(b.src) || a.dst.localeCompare(b.dst),
  );
}

/** Leaf service objects behind a service group (nested groups flattened),
 *  each paired with its real ports. */
export function serviceGroupMembers(
  name: string,
  cfg: ParsedConfig,
): { name: string; ports: string[] }[] {
  const i = lookupIndex(cfg);
  const out: { name: string; ports: string[] }[] = [];
  const seen = new Set<string>();
  const walk = (n: string) => {
    if (seen.has(n)) return;
    seen.add(n);
    const g = i.svcGrpByName.get(n);
    if (g) return g.members.forEach(walk);
    out.push({ name: n, ports: serviceToPorts(n, cfg) });
  };
  walk(name);
  return out;
}
