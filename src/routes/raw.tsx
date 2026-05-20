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
      <h1 className="text-2xl font-semibold">原始配置</h1>
      <div className="flex items-center gap-2">
        <Input
          placeholder="跳转到行号"
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="sm"
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
        <span className="text-xs text-muted-foreground">
          共 {cfg.rawLines.length} 行
          {focusLine ? ` · 当前高亮 L${focusLine}` : ""}
        </span>
      </div>
      <div
        ref={ref}
        className="max-h-[75vh] overflow-auto rounded-lg border border-border bg-card font-mono text-xs"
      >
        {cfg.rawLines.map((l, i) => {
          const n = i + 1;
          const active = focusLine === n;
          return (
            <div
              key={n}
              data-line={n}
              className={`flex border-l-2 ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:bg-secondary/40"
              }`}
            >
              <span className="w-14 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground">
                {n}
              </span>
              <pre className="whitespace-pre-wrap break-all px-3 py-0.5">
                {l || " "}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
