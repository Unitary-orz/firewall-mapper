import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useConfigStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "概览 · 防火墙配置审计台" },
      {
        name: "description",
        content:
          "上传防火墙配置文件，查看对象、策略、NAT、中间节点统计与风险概览。",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const { cfg, audit, loadText, fileName } = useConfigStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const onFile = async (f: File) => {
    setLoading(true);
    const text = await f.text();
    loadText(text, f.name);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>上传防火墙配置</CardTitle>
          <CardDescription>
            支持 Topsec 风格 SYSCONFIG.TXT 文本配置。文件在浏览器本地解析，
            <strong> 不会上传到任何服务器</strong>，可放心使用。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/40 p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) await onFile(f);
            }}
          >
            <p className="text-sm text-muted-foreground">
              拖拽配置文件到此处，或点击下方按钮选择
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.cfg,.conf,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await onFile(f);
              }}
            />
            <Button
              className="mt-3"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              {loading ? "解析中…" : "选择文件"}
            </Button>
            {fileName && (
              <p className="mt-3 text-xs text-muted-foreground">
                当前：<span className="font-mono">{fileName}</span>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {cfg && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">概览</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="地址对象" value={cfg.addresses.length} to="/objects" />
              <Stat label="地址组" value={cfg.addressGroups.length} to="/objects" />
              <Stat label="服务对象" value={cfg.services.length} to="/services" />
              <Stat label="服务组" value={cfg.serviceGroups.length} to="/services" />
              <Stat label="策略" value={cfg.policies.length} to="/policies" />
              <Stat label="NAT 规则" value={cfg.natRules.length} to="/nat" />
              <Stat label="NAT 池" value={cfg.natPools.length} to="/nat" />
              <Stat
                label="中间节点"
                value={cfg.intermediaries.length}
                to="/intermediaries"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">审计提示</h2>
              <Link
                to="/audit"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                查看全部 →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SeverityStat
                label="高风险"
                value={audit.filter((a) => a.severity === "high").length}
                color="bg-destructive/15 text-destructive"
              />
              <SeverityStat
                label="警告"
                value={audit.filter((a) => a.severity === "warn").length}
                color="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
              />
              <SeverityStat
                label="提示"
                value={audit.filter((a) => a.severity === "info").length}
                color="bg-secondary text-muted-foreground"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </Link>
  );
}

function SeverityStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}
