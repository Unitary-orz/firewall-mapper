## 目标

在悬停预览卡里把"对象名 + 类型徽标"并排到同一行；类型文案更明确，能区分"对象 / 组 / NAT 池 / 未定义"；**字面量（IP、端口、any 通配）不再显示类型徽标**——因为它们本来就不是对象，挂个徽标反而是噪音。

## 改动

仅 `src/components/ObjectPreview.tsx`。

### 1. 类型标签文案

更新 `kindLabel`：

| kind | 旧 | 新 |
|---|---|---|
| address | 地址 | 地址对象 |
| address-group | 地址组 | 地址组 |
| service | 服务 | 服务对象 |
| service-group | 服务组 | 服务组 |
| nat-pool | NAT 池 | NAT 池 |
| unknown | 未定义 | 未定义引用 |
| literal-ip / literal-port / literal-any | — | **不显示徽标** |

### 2. 标题区：名称与徽标并排

旧结构：标题与徽标分两行。

新结构：

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <span className="text-sm font-semibold break-all">{r.name}</span>
  {!isLiteral && (
    <Badge tone={r.kind === "unknown" ? "danger" : "default"}>
      {kindLabel[r.kind]}
    </Badge>
  )}
</div>
```

字面量 (`isLiteral === true`) 不渲染徽标，只保留下方原有的 `r.literal` 说明文字（"通配（不限制）" / "字面 IP / 网段" / "字面端口"）来承担类型信息。

### 3. 组成员行（MemberRow）

`kindTag` 文案同步成"地址对象 / 地址组 / 服务对象 / 服务组 / 未定义引用"，与主预览一致。MemberRow 本身不出现字面量场景（成员必须是已定义对象），所以保持显示徽标即可。

## 不动的部分

- 不引入新组件 / 依赖。
- `RefsPreview`、表格行号、其它路由文件、解析器、store 全部不动。

## 验收

1. 悬停地址对象 / 地址组 / 服务对象 / 服务组 / NAT 池：弹窗第一行是"名字 + 类型徽标"，类型徽标紧贴名字右侧。
2. 悬停 `any`、`192.168.1.0/24`、`8080-8090` 等字面量：弹窗里**没有徽标**，只显示名字和下方一行灰色说明文字。
3. 悬停未在配置里定义的名字：第一行显示"名字 + 红色'未定义引用'徽标"。
