import type { FocusLine } from "./access";

export type NatFilter = "all" | "nat" | "direct";
export type AssociationFilter = "all" | "associated" | "unassociated";
export type ActionFilter = "all" | "permit" | "deny";

export interface AccessLineFilter {
  nat: NatFilter;
  association: AssociationFilter;
  action: ActionFilter;
}

export const DEFAULT_ACCESS_LINE_FILTER: AccessLineFilter = {
  nat: "all",
  association: "all",
  action: "all",
};

export function countActiveAccessFilters(filter: AccessLineFilter): number {
  return (
    Number(filter.nat !== "all") +
    Number(filter.association !== "all") +
    Number(filter.action !== "all")
  );
}

export function filterAccessLines(lines: FocusLine[], filter: AccessLineFilter): FocusLine[] {
  if (countActiveAccessFilters(filter) === 0) return lines;
  return lines.filter((line) => {
    if (filter.nat === "nat" && line.nat.length === 0) return false;
    if (filter.nat === "direct" && line.nat.length > 0) return false;

    const associated = line.policies.length > 0;
    if (filter.association === "associated" && !associated) return false;
    if (filter.association === "unassociated" && associated) return false;

    // A DNAT line marked "associated" is, by definition, covered by a permit
    // policy, so it belongs to the permit result set as well.
    const permitted = line.action === "permit" || line.action === "associated";
    if (filter.action === "permit" && !permitted) return false;
    if (filter.action === "deny" && line.action !== "deny") return false;
    return true;
  });
}
