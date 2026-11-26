// 防火墙配置解析后的领域模型

export type AddressKind = "host" | "net" | "range" | "domain" | "mac";

export interface AddressEntry {
  kind: AddressKind;
  value: string; // 显示用：IP / CIDR / "a-b" / 域名 / MAC
}

export interface AddressObject {
  name: string;
  description?: string;
  entries: AddressEntry[];
  lineNo: number;
}

export interface AddressGroup {
  name: string;
  description?: string;
  members: string[]; // 引用的 address / address-group 名称
  lineNo: number;
}

export interface ServiceEntry {
  protocol: string; // tcp/udp/icmp/ip
  destPort?: string; // "443" 或 "1-65535"
  sourcePort?: string;
}

export interface ServiceObject {
  name: string;
  description?: string;
  entries: ServiceEntry[];
  lineNo: number;
}

export interface ServiceGroup {
  name: string;
  description?: string;
  members: string[];
  lineNo: number;
}

export interface PolicyRule {
  id: string;
  srcZone: string;
  dstZone: string;
  srcAddr: string;
  dstAddr: string;
  service: string;
  field7: string;
  field8: string;
  schedule: string;
  action: "permit" | "deny" | string;
  /** 无 enable 子行或原文出现 disable 时为 true；仅明确 enable 才启用。 */
  disabled?: boolean;
  lineNo: number;
  raw: string;
}

export interface NatPool {
  name: string;
  description?: string;
  addressFrom?: string;
  addressTo?: string;
  lineNo: number;
}

export interface NatRule {
  id: string;
  kind: "destination" | "source" | "static" | string;
  iface: string;
  srcAddr: string;
  origDstAddr: string;
  origDstService: string; // DNAT 的入口服务，或 SNAT 的原始服务
  translatedPool: string; // DNAT 的目的转换池；SNAT 非出接口时的转换后源
  servicePort?: string; // DNAT 可选 service <port>
  // ---- SNAT 专用 ----
  translatedSrc?: string; // 转换后的源（对象 / 池 / 字面量）；出接口取址时为空
  egressInterface?: boolean; // 源 NAT 走出接口取址
  description?: string;
  disabled?: boolean;
  log?: boolean;
  lineNo: number;
  raw: string;
}

export interface InterfaceEntry {
  name: string;
  ips: string[];
  attrs: string[];
  lineNo: number;
}

export interface ScheduleEntry {
  kind: "onetime" | "recurring" | string;
  name: string;
  description?: string;
  absolute?: string;
  periodic?: string;
  lineNo: number;
}

export interface IntermediaryNode {
  // 中间节点：WAF/代理/网关/堡垒/LB
  category: "waf" | "gateway" | "proxy" | "bastion" | "lb" | "other";
  name: string;
  address?: string; // 解析到的代表 IP
  evidence: string[]; // 命中规则的简要说明
}

export interface ParsedConfig {
  meta: {
    version?: string;
    buildtime?: string;
    totalLines: number;
    fileName?: string;
  };
  addresses: AddressObject[];
  addressGroups: AddressGroup[];
  services: ServiceObject[];
  serviceGroups: ServiceGroup[];
  policies: PolicyRule[];
  natPools: NatPool[];
  natRules: NatRule[];
  interfaces: InterfaceEntry[];
  schedules: ScheduleEntry[];
  intermediaries: IntermediaryNode[];
  rawLines: string[]; // 行号即数组下标 + 1
}

export interface AuditFinding {
  id: string;
  severity: "info" | "warn" | "high";
  category: string;
  title: string;
  detail: string;
  refLine?: number;
  refKind?: string;
  refName?: string;
}
