import type { ServiceObject } from "./parser/types";

// Fallback definitions only: explicit configuration objects always take precedence.
const ports: Record<string, string[]> = {
  https: ["tcp/443"],
  http: ["tcp/80"],
  ssh: ["tcp/22"],
  telnet: ["tcp/23"],
  ftp: ["tcp/21"],
  "ftp-data": ["tcp/20"],
  smtp: ["tcp/25"],
  pop3: ["tcp/110"],
  pop3s: ["tcp/995"],
  imap: ["tcp/143"],
  imaps: ["tcp/993"],
  dns: ["udp/53", "tcp/53"],
  domain: ["udp/53", "tcp/53"],
  ntp: ["udp/123"],
  snmp: ["udp/161"],
  snmptrap: ["udp/162"],
  ldap: ["tcp/389", "udp/389"],
  ldaps: ["tcp/636"],
  icmp: ["icmp"],
};

export function getBuiltinService(name: string): ServiceObject | undefined {
  const resolved = Object.hasOwn(ports, name.toLowerCase()) ? ports[name.toLowerCase()] : undefined;
  if (!resolved) return undefined;
  return {
    name,
    lineNo: 0,
    entries: resolved.map((value) => {
      const [protocol = "", destPort] = value.split("/");
      return destPort ? { protocol, destPort } : { protocol };
    }),
  };
}
