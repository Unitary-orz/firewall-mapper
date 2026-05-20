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
  origDstService: string; // 端口或服务对象
  translatedPool: string; // 目的转换池
  servicePort?: string; // 可选 service <port>
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
