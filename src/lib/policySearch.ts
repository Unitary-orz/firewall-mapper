/** Search aliases for locating a policy by its numeric rule ID. */
export function policyIdSearchText(id: string): string {
  const value = id.trim();
  return [
    value,
    `#${value}`,
    `id:${value}`,
    `id ${value}`,
    `策略${value}`,
    `策略 ${value}`,
    `策略 #${value}`,
  ].join(" ");
}
