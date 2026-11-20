import { createFileRoute } from "@tanstack/react-router";
import { useConfigStore } from "@/lib/store";
import { EmptyConfig } from "@/components/EmptyConfig";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  line: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute("/raw")({
  head: () => ({
    meta: [
      { title: "原文 · 防火墙配置审计台" },
      { name: "description", content: "查看带行号的原始配置文本，可跳转高亮指定行。" },
      { property: "og:title", content: "原文 · 防火墙配置审计台" },
      { property: "og:description", content: "查看带行号的原始配置文本，可跳转高亮指定行。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: searchSchema,
  component: RawPage,
});

function RawPage() {
  const { cfg } = useConfigStore();
  const { line: focusLine } = Route.useSearch();
  const [jump, setJump] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusLine && ref.current) {
      const el = ref.current.querySelector(`[data-line="${focusLine}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusLine, cfg]);

  if (!cfg) return <EmptyConfig />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">原始配置</h1>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex">
        <Input
          placeholder="跳转到行号"
          aria-label="跳转到行号"
          inputMode="numeric"
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const n = Number(jump);
            if (n > 0) {
              ref.current
                ?.querySelector(`[data-line="${n}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
          className="h-10 sm:max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-10 px-4"
          onClick={() => {
            const n = Number(jump);
            if (n > 0) {
              const el = ref.current?.querySelector(`[data-line="${n}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }}
        >
          跳转
        </Button>
        <span className="col-span-2 text-xs text-muted-foreground">
          共 {cfg.rawLines.length} 行{focusLine ? ` · 当前高亮 L${focusLine}` : ""}
        </span>
      </div>
      <div
        ref={ref}
        className="max-h-[72dvh] overflow-auto rounded-lg border border-border bg-card font-mono text-[11px] leading-relaxed sm:max-h-[75vh] sm:text-xs"
      >
        {cfg.rawLines.map((l, i) => {
          const n = i + 1;
          const active = focusLine === n;
          return (
            <div
              key={n}
              data-line={n}
              className={`flex border-l-2 ${
                active ? "border-primary bg-primary/10" : "border-transparent hover:bg-secondary/40"
              }`}
            >
              <span className="w-14 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground">
                {n}
              </span>
              <pre className="whitespace-pre-wrap break-all px-3 py-0.5">{l || " "}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
