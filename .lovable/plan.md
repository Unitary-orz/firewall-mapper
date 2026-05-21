# 新增 SNAT（`ip nat source`）识别与适配

## 1. 解析器：识别 `ip nat source`

文件：`src/lib/parser/index.ts`

观察样本，SNAT 单行语法稳定为：

```
ip nat source <iface> <srcAddr> <origDstAddr> <translatedSrc> {interface | <poolAddr>} [log] <id>
```

- `<srcAddr>`：原始源（被转换的对象/组/IP）
- `<origDstAddr>`：匹配的目的（命中此规则的访问目的）
- `<translatedSrc>`：转换后的源（地址对象 / 池 / 端口对象，由对象名或字面量给出）
- 第 5 段为关键字 `interface`（出接口取址）或字面量地址（例：`172.23.51.138`）
- 可选 `log`
- 最后一个 token 为数字 ID

续行同 DNAT，沿用现有 `ip nat <id> description|disable|unit-id ...` 块。

实现：在 `ip nat destination` 分支之后增加 `ip nat source` 分支，复用末尾 `id / log` 剥离逻辑，剩余段位映射到下列新字段。

## 2. 数据模型扩展

文件：`src/lib/parser/types.ts`

`NatRule` 扩展（向后兼容，DNAT 字段保留）：

- `kind: "destination" | "source"`（保留 `"static"` 字面量备用）
- 新增 SNAT 专用字段：
  - `translatedSrc?: string`（转换后的源对象 / 池 / 字面量）
  - `egressInterface?: boolean`（`true` 表示走出接口取址，对应关键字 `interface`）
- DNAT 现有字段（`origDstAddr`/`origDstService`/`translatedPool`/`servicePort`）SNAT 不使用。

字段统一含义：

| 字段 | DNAT | SNAT |
|---|---|---|
| `srcAddr` | 匹配源 | 被转换的原始源 |
| `origDstAddr` | 被转换的原始目的 | 匹配目的 |
| `translatedPool` | 转换后的目的池 | —（用 `translatedSrc`） |
| `translatedSrc` | — | 转换后的源 |
| `egressInterface` | — | 出接口取址 |

## 3. NAT 页面：拆为两 Tab

文件：`src/routes/nat.tsx`

将现有「NAT 规则 / NAT 池」改为三 Tab：

1. **目的 NAT**（`cfg.natRules.filter(r => r.kind === "destination")`）— 复用现有列定义
2. **源 NAT**（`cfg.natRules.filter(r => r.kind === "source")`）— 新列定义：
   - #ID / 状态 / 接口
   - 源（`srcAddr`，被转换对象）
   - 目的（`origDstAddr`）
   - 转换为源（`translatedSrc`；若 `egressInterface` 则显示 Badge「出接口」）
   - 描述 / 行号
3. **NAT 池**（保持现状，共用列表）

Tab 标题带计数：`目的 NAT (N)`、`源 NAT (M)`、`NAT 池 (K)`。

## 4. 交叉引用 & 访问图适配

- **交叉引用**（`src/lib/parser/index.ts` 中 `buildCrossRef`）：把 SNAT 的 `srcAddr` / `origDstAddr` / `translatedSrc` 都登记为 `by: "nat"` 的地址引用，使 RefsPreview 能展示 SNAT 引用。
- **访问图 / Flow 构建**（`src/lib/access.ts`）：
  - DNAT 流向逻辑保持不变（外部→`translatedPool`）。
  - SNAT 新增：源 = `srcAddr`（展开后内部 IP 集），目的 = `origDstAddr`，并把「源被转换为 `translatedSrc` / 出接口」作为流的元数据，便于「源不一致」的诊断面板呈现。
  - `addrEndpoints` 已支持对象/池/组扩展，`translatedSrc` 若是池名或对象名可直接复用。
- **中间节点识别**（`intermediaries`）：若 SNAT 的 `translatedSrc` 与已识别的 WAF/网关/代理地址重叠，记一条 evidence「SNAT 出口经 <node>」。

## 5. 校验与回归

- 用用户提供的样本（含 `interface` 与字面量池两种形态、含 `log`、含 `disable`、含中文对象名）覆盖解析；
- 确认现有 DNAT 数量与字段不变；
- 验证 NAT Tab 切换、行号跳转、CSV 导出在两个 Tab 都正常；
- 验证「目的 `api-172.23.51.28` 匹配 `API网关-172.23.51.28`」等先前已修的语义不回归。

## 受影响文件

- `src/lib/parser/types.ts`
- `src/lib/parser/index.ts`
- `src/routes/nat.tsx`
- `src/lib/access.ts`（SNAT 流语义）
