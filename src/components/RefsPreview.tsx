import { Link } from "@tanstack/react-router";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/DataTable";
import { useConfigStore } from "@/lib/store";

export function RefsPreview({
  name,
  kind,
}: {
  name: string;
  kind: "address" | "service";
}) {
  const { xr } = useConfigStore();
  if (!xr) return null;
  const refs =
    kind === "service"
      ? xr.serviceUsedBy.get(name) ?? []
      : xr.addressUsedBy.get(name) ?? [];

  if (refs.length === 0) return <Badge tone="warn">未引用</Badge>;

  const byKind = [...new Set(refs.map((r) => r.by))].join(", ");
  const shown = refs.slice(0, 50);

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="text-xs cursor-help underline decoration-dotted underline-offset-2 text-primary">
          {refs.length} 处（{byKind}）
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-[28rem] max-h-96 overflow-auto" align="start">
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            {name} · 被引用 {refs.length} 处
          </div>
          <ul className="space-y-1">
            {shown.map((r, i) => (
              <li key={i} className="text-xs flex gap-2">
                <Link
                  to="/raw"
                  search={{ line: r.lineNo }}
                  className="text-primary hover:underline font-mono shrink-0"
                >
                  L{r.lineNo}
                </Link>
                <Badge tone="muted">{r.by}</Badge>
                <span className="text-muted-foreground break-all">
                  {r.detail}
                </span>
              </li>
            ))}
            {refs.length > shown.length && (
              <li className="text-xs text-muted-foreground">
                …还有 {refs.length - shown.length} 处
              </li>
            )}
          </ul>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
