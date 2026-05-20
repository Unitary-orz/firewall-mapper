## 对象预览（ObjectPreview）优化

参考 RefsPreview 已落地的样式语言（小号 uppercase 标签 L()、引用样式描述、tone 化 Badge、紧凑两排布局），把对象 Hover 卡片做一致化优化。

### 现状问题

1. **卡片头部**：仅 `名称 + Badge(kindLabel)`，描述用单独一行普通灰字，缺少和 RefsPreview 一致的"引用样式"（左边框 + italic）。
2. **AddressEntries / ServiceEntries**：每行以 `Badge(kind/protocol)` 起头，颜色一律 muted，视觉密度高、缺少字段标签，端口/源端口靠空格拼接，可读性一般。
3. **MemberRow**：
   - `Badge(kindTag)` + 名称 + 长 summary + 描述全部挤在一行 `flex-wrap`，描述断行后与上一行成员混在一起难分辨。
   - summary 是纯文本（"host:1.1.1.1，range:..."），没有字段标签，未利用 L() 风格。
   - 描述同样缺引用样式。
4. **GroupMembers 标题**：`成员（N）` 与 RefsPreview 段标题风格不一致（后者是 `byLabel（N）` + 可选操作按钮）。
5. **PoolDetail**：单行 mono，缺少 `起始/结束` 字段标签。
6. **literal / unknown 提示**：literal 提示和 description 都用同款 `text-xs text-muted-foreground`，无法区分"系统注释"和"用户描述"。
7. **共享工具**：`L()` 目前定义在 RefsPreview 内部，对象预览复用时需要抽出（或在 ObjectPreview 内复制一份）。

### 优化方案

**A. 提取共享原子（轻量）**
- 在 `src/components/RefsPreview.tsx` 把 `L`（小号 uppercase label）和"引用样式描述"类名（`border-l-2 border-border pl-2 italic`）抽到新文件 `src/components/previewAtoms.tsx`，导出 `L`、`DescQuote`（包装 children 的 span/div）。
- RefsPreview 和 ObjectPreview 都从这里 import，保持视觉一致。

**B. 卡片头部 (ObjectName HoverCardContent)**
- 标题行保持 `名称 + Badge(kindLabel)`，但把 Badge 放到 `ml-auto`，让名称靠左独占主要空间。
- `r.description` 改用 `DescQuote`：`border-l-2 border-border pl-2 italic text-xs text-muted-foreground`，与 RefsPreview 描述一致。
- `r.literal`（系统说明，如"通配（不限制）"）保持普通 muted 文本，**不**加引用样式 —— 区分"系统注释"和"用户描述"。
- `unknown` 提示行使用 `text-destructive` + 小图标语义（保留现样式即可）。

**C. AddressEntries**
- 每条改为：`<L>kind</L> <span className="text-foreground">{value}</span>`，去掉 Badge，密度更低。
- 容器保留 `space-y-0.5 font-mono text-xs`。

**D. ServiceEntries**
- 每条改为：`<L>协议</L> {protocol} <L>目的</L> {destPort ?? 'any'} [<L>源</L> {sourcePort}]`，端口区段用 `text-foreground`，标签用 L()。
- 多个源端口/目的端口情况下间距用 `gap-x-2`。

**E. MemberRow（GroupMembers 中的每个成员）**
- 重构为两排（与 RefsPreview PolicyLine/NatLine 一致）：
  - 第一排：`<L>类型</L> kindTag · <ObjectName name={m}/> · summary（mono，截断）` + 右侧 `Badge(类型 tone)`（unresolved → danger，否则 muted）。
  - 第二排（仅当有描述）：`DescQuote` 包装 description，与 RefsPreview NAT 描述一致。
- summary 在第一排用 `truncate min-w-0`，避免挤压第二排。
- 列表 `<ul>` 增加 `divide-y divide-border/40 rounded-md border border-border/40 px-2 py-1` —— 借鉴 RefsPreview SectionBlock 的列表外观。

**F. GroupMembers 段标题**
- ObjectName 卡片中"成员（N）"行套用 RefsPreview 段标题样式：`text-xs font-medium text-muted-foreground`，并提供"超过 N 个时截断 + 还有 X 个"提示（>30 截断，与 RefsPreview 一致）。

**G. PoolDetail**
- 改为：`<L>起始</L> {addressFrom} [<L>结束</L> {addressTo}]`。

**H. Hover 卡宽度**
- 当前 `w-96`，配合更紧凑的两排布局够用；保持不变，仅在必要的 truncate 处加 `min-w-0`。

### 不在此次改动范围

- 不改 parser / store / 业务字段。
- 不改 hover 触发逻辑、`ObjectName` 对外 API。
- 不改 RefsPreview 已有视觉（只抽离 L/DescQuote 共享原子）。
- 不调 literal/unknown 的语义颜色规则。

### 受影响文件

- `src/components/previewAtoms.tsx`（新建，导出 `L`、`DescQuote`）
- `src/components/RefsPreview.tsx`（改 import，删除本地 L 定义；描述行换成 `DescQuote`）
- `src/components/ObjectPreview.tsx`（按 B–G 重写各子组件）
