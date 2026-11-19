import type { ParsedConfig } from "./parser/types";
import { addrMatches, expandAddressNames, isIpLiteral, type FocusLine } from "./access";

function includesQuery(value: string | undefined, query: string): boolean {
  return !!value && value.toLowerCase().includes(query);
}

/** Filter only by the source/destination objects shown in the path graph.
 * Service, NAT, policy and action fields deliberately do not participate. */
export function filterAccessLinesByObject(
  lines: FocusLine[],
  query: string,
  cfg?: ParsedConfig,
): FocusLine[] {
  const q = query.trim().toLowerCase();
  if (!q) return lines;

  if (cfg && isIpLiteral(q)) {
    return lines.filter(
      (line) =>
        (line.src !== "any" && addrMatches(line.src, q, cfg)) ||
        (line.dst !== "any" && addrMatches(line.dst, q, cfg)),
    );
  }

  // Like global search, object descriptions and literal address entries can
  // also find an object. Include every parent group of a matching object.
  const matchingNames = new Set<string>();
  if (cfg) {
    const addWithParents = (name: string) => {
      expandAddressNames(name, cfg).forEach((item) => matchingNames.add(item));
    };
    cfg.addresses.forEach((address) => {
      if (
        includesQuery(address.name, q) ||
        includesQuery(address.description, q) ||
        address.entries.some((entry) => includesQuery(entry.value, q))
      ) {
        addWithParents(address.name);
      }
    });
    cfg.addressGroups.forEach((group) => {
      if (
        includesQuery(group.name, q) ||
        includesQuery(group.description, q) ||
        group.members.some((member) => includesQuery(member, q))
      ) {
        addWithParents(group.name);
      }
    });
    cfg.natPools.forEach((pool) => {
      if (
        includesQuery(pool.name, q) ||
        includesQuery(pool.description, q) ||
        includesQuery(pool.addressFrom, q) ||
        includesQuery(pool.addressTo, q)
      ) {
        addWithParents(pool.name);
      }
    });
  }

  return lines.filter((line) => {
    const source = line.src.toLowerCase();
    const destination = line.dst.toLowerCase();
    return (
      source.includes(q) ||
      destination.includes(q) ||
      matchingNames.has(line.src) ||
      matchingNames.has(line.dst)
    );
  });
}
