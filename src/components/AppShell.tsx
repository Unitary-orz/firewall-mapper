import { Link, useLocation } from "@tanstack/react-router";
import { Menu, Settings2 } from "lucide-react";
import { useState } from "react";
import { useConfigStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useShowLineNumbers,
  useShowFullPortRange,
  useShowPolicyZone,
  useShowDisabled,
  useShowFocusStats,
} from "@/lib/uiPrefs";

const nav = [
  { to: "/", label: "概览" },
  { to: "/search", label: "全局搜索" },
  { to: "/objects", label: "地址对象" },
  { to: "/services", label: "服务对象" },
  { to: "/policies", label: "策略" },
  { to: "/nat", label: "NAT" },
  { to: "/intermediaries", label: "中间节点" },
  { to: "/access-graph", label: "访问关系" },
  { to: "/audit", label: "审计" },
  { to: "/raw", label: "原文" },
] as const;

function DisplaySettings() {
  const [showLineNo, setShowLineNo] = useShowLineNumbers();
  const [showFullPort, setShowFullPort] = useShowFullPortRange();
  const [showPolicyZone, setShowPolicyZone] = useShowPolicyZone();
  const [showDisabled, setShowDisabled] = useShowDisabled();
  const [showFocusStats, setShowFocusStats] = useShowFocusStats();
  const activeCount = (showLineNo ? 1 : 0) + (showFullPort ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground"
          title="显示选项"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>显示</span>
          {activeCount > 0 && (
            <span className="ml-0.5 rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] max-w-72 p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">显示选项</div>
        <div className="space-y-3">
          <label className="flex min-h-9 cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示行号</div>
              <div className="text-xs text-muted-foreground">
                仅用于追溯原始配置文本，平时无需打开
              </div>
            </div>
            <Switch checked={showLineNo} onCheckedChange={setShowLineNo} className="mt-0.5" />
          </label>
          <label className="flex min-h-9 cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示全端口范围</div>
              <div className="text-xs text-muted-foreground">默认把 1-65535 显示为 any</div>
            </div>
            <Switch checked={showFullPort} onCheckedChange={setShowFullPort} className="mt-0.5" />
          </label>
          <label className="flex min-h-9 cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示策略 Zone</div>
              <div className="text-xs text-muted-foreground">多数环境为 any→any，默认隐藏</div>
            </div>
            <Switch
              checked={showPolicyZone}
              onCheckedChange={setShowPolicyZone}
              className="mt-0.5"
            />
          </label>
          <label className="flex min-h-9 cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示其他已禁用项</div>
              <div className="text-xs text-muted-foreground">
                默认隐藏；策略列表以外的相关视图同步生效
              </div>
            </div>
            <Switch checked={showDisabled} onCheckedChange={setShowDisabled} className="mt-0.5" />
          </label>
          <label className="flex min-h-9 cursor-pointer select-none items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm">显示访问关系的候选统计</div>
              <div className="text-xs text-muted-foreground">
                候选数量、全量 FlowGroup 数以及每个候选的命中条数
              </div>
            </div>
            <Switch
              checked={showFocusStats}
              onCheckedChange={setShowFocusStats}
              className="mt-0.5"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { cfg, fileName, clear } = useConfigStore();
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const currentFile = cfg ? (
    <span className="min-w-0 font-mono text-xs text-muted-foreground">
      <span className="break-all">{fileName ?? "config"}</span>
      <span className="ml-1 whitespace-nowrap">· {cfg.meta.totalLines} 行</span>
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">未加载配置</span>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto max-w-[1400px] px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 sm:hidden"
                  aria-label="打开导航"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-4 sm:hidden">
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle>防火墙配置审计台</SheetTitle>
                  <SheetDescription>选择要查看的配置模块</SheetDescription>
                </SheetHeader>
                <nav aria-label="手机导航" className="mt-5 grid grid-cols-2 gap-2">
                  {nav.map((n) => {
                    const active = loc.pathname === n.to;
                    return (
                      <Link
                        key={n.to}
                        to={n.to}
                        onClick={() => setNavOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        {n.label}
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    当前配置
                  </div>
                  {currentFile}
                  {cfg && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => {
                        clear();
                        setNavOpen(false);
                      }}
                    >
                      清除当前配置
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <Link
              to="/"
              className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight sm:text-base"
            >
              防火墙配置审计台
            </Link>
            <DisplaySettings />
            <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              {cfg ? (
                <>
                  <span className="max-w-64 truncate rounded bg-secondary px-2 py-1 font-mono">
                    {fileName ?? "config"} · {cfg.meta.totalLines} 行
                  </span>
                  <Button size="sm" variant="ghost" onClick={clear}>
                    清除
                  </Button>
                </>
              ) : (
                <span>未加载配置</span>
              )}
            </div>
          </div>

          <nav aria-label="主导航" className="mt-3 hidden flex-wrap gap-1 sm:flex">
            {nav.map((n) => {
              const active = loc.pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded px-2.5 py-1 text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-1.5 flex items-center justify-between gap-2 pl-10 sm:hidden">
            <div className="min-w-0 flex-1 truncate">{currentFile}</div>
            {cfg && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={clear}
              >
                清除
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
