## 目标

让 `addrMatches` 在「两边都是对象名（不是字面 IP）」时，也能识别出它们指向同一个 IP/网段，避免「api-172.23.51.28」与「API网关-172.23.51.28」这种同 IP 不同名的对象被误判。

## 原因

当前 `addrIdentity` 只在输入是字面 IP 时才把它解析成包含它的对象集合。如果输入是对象名，只展开成 group/object 名集合，从不展开成「具体 IP / CIDR / range / domain / mac」。结果两个不同名但同 IP 的对象，识别集合永远不相交。

## 改动

只改 `src/lib/access.ts`。复用现有 `findAddressesContainingIp` + `inCidr` + `inRange`，不动 UI、不动 svcMatches。

### 1. 新增「展开到字面端点」的 helper

把一个名字展开成两类标识的并集：

- `name:<原对象/分组名>` — 原有的名字层匹配
- `host:<ip>` / `net:<cidr>` / `range:<a-b>` / `domain:<v>` / `mac:<v>` — 字面端点

```ts
function addrLeaves(
  name: string,
  cfg: ParsedConfig,
  seen: Set<string> = new Set()
): Set<string> {
  const out = new Set<string>();
  if (seen.has(name)) return out;
  seen.add(name);
  out.add(`name:${name}`);

  if (isIpLiteral(name)) {
    out.add(`host:${name}`);
    // 同时纳入包含它的对象（向上一层）
    findAddressesContainingIp(name, cfg).forEach((n) => out.add(`name:${n}`));
    return out;
  }

  const obj = cfg.addresses.find((a) => a.name === name);
  if (obj) {
    obj.entries.forEach((e) => out.add(`${e.kind}:${e.value}`));
    return out;
  }

  const grp = cfg.addressGroups.find((g) => g.name === name);
  if (grp) {
    grp.members.forEach((m) =>
      addrLeaves(m, cfg, seen).forEach((x) => out.add(x))
    );
  }
  return out;
}
```

### 2. 改 `addrMatches`

把名字层比较 + 字面层比较合一：

```ts
export function addrMatches(a, b, cfg) {
  if (!a || !b) return false;
  if (a === "any" || b === "any") return true;
  if (a === b) return true;

  const A = addrLeaves(a, cfg);
  const B = addrLeaves(b, cfg);

  // 1) 直接交集（覆盖名字层和「相同字面端点」）
  for (const x of A) if (B.has(x)) return true;

  // 2) 跨形态匹配：host ∈ net / host ∈ range
  const aHosts = pickHosts(A);
  const bHosts = pickHosts(B);
  if (anyHostInside(aHosts, B, cfg)) return true;
  if (anyHostInside(bHosts, A, cfg)) return true;

  return false;
}

function pickHosts(s: Set<string>): string[] {
  const out: string[] = [];
  s.forEach((v) => v.startsWith("host:") && out.push(v.slice(5)));
  return out;
}

function anyHostInside(
  hosts: string[],
  other: Set<string>,
  cfg: ParsedConfig
): boolean {
  for (const ip of hosts) {
    for (const v of other) {
      if (v.startsWith("net:") && inCidr(ip, v.slice(4))) return true;
      if (v.startsWith("range:") && inRange(ip, v.slice(6))) return true;
    }
  }
  return false;
}
```

### 3. 删掉旧的 `addrIdentity`

它的功能被 `addrLeaves` 完全覆盖。`collectAddressMembers` 仍被其他位置（focus 过滤）用到，保持。

## 不动

- `svcMatches`（已字面化）
- `findCoveringPolicies`（公式已正确）
- Flow / FocusLine / UI / 文案

## 验证

- 路由 `/access-graph?focus=src&id=财富大厦统一出口`：DNAT「api-172.23.51.28」应变为「已关联策略」，弹出展示「API网关-172.23.51.28」相关 permit 策略。
- 字面 IP ↔ 对象（旧用例）仍工作。
- `any` 行为不变。
- 跨形态：host 包含在另一边的 net/range 中也能命中。
- Typecheck 全绿。