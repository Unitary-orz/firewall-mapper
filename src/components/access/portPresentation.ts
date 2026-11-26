/** Keep policy-bearing ports visible; summarize only multiple unmatched ports. */
export function presentChainPorts<T extends { policies: readonly unknown[] }>(chain: T[]) {
  const associated = chain.filter((line) => line.policies.length > 0);
  const unmatched = chain.filter((line) => line.policies.length === 0);
  if (unmatched.length <= 1) return { visible: chain, hidden: [] as T[] };
  if (associated.length > 0) return { visible: associated, hidden: unmatched };
  return { visible: chain.slice(0, 1), hidden: chain.slice(1) };
}
