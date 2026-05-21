## 目标

按用户指示重新分配 NAT 详情卡的颜色层级，让「转换为」一侧成为视觉重点，原始侧整体弱化但两侧端口保持同色，便于自然对齐对比。

## 改动范围

仅修改 `src/routes/access-graph.tsx` 中 `DnatEntryPill` 的 HoverCard 详情部分（行 943–964）。Pill 触发器与业务逻辑不动。

### 详情卡颜色重排

| 元素 | 当前 | 调整后 |
|---|---|---|
| 标签 `原始目的` | `text-muted-foreground` | `text-foreground`（正常黑色字） |
| 原始 `entryAddr` IP | `text-foreground` | `text-muted-foreground`（弱化） |
| 原始 `:entryPort` | `text-muted-foreground` | `text-amber-700/70 dark:text-amber-300/70`（与转换后端口同色） |
| 标签 `转换为` | `text-amber-700 dark:text-amber-400` | 保持 |
| 转换 `translatedPool` IP | `text-amber-700 dark:text-amber-300` | 保持 |
| 转换 `:backendPort` | `text-amber-700/70 dark:text-amber-300/70` | 保持 |

### 设计逻辑

- 两个标签（原始目的 / 转换为）使用各自侧的「主」色：原始侧黑、转换侧 amber → 标签是入口，需要明显。
- 原始 IP 用 muted 弱化 → 它只是上下文，不是重点；用户主要关心「转换到哪里」。
- 两侧端口统一 amber/70 → 端口在 NAT 场景里通常前后一致，使用相同的弱 amber 让眼睛快速判定「端口是否变化」：颜色不变 → 端口是 NAT 链路的一部分；如果两边数字相同则一目了然。
- 转换侧 IP + port 都是 amber，强化「这是最终落点」。

### 不改动

- Pill 触发器
- 详情卡标题区（DNAT #203 / 接口 / disabled）
- 业务逻辑

## 验证

预览 `/access-graph?focus=src&id=财富大厦统一出口` 的 DNAT 详情卡：

1. 「原始目的」标签是正常黑字，但右侧 IP 是灰色弱化
2. 两侧端口数字颜色完全一致（amber/70）
3. 「转换为」整行 amber 突出
4. 浅色 / 深色模式都可读