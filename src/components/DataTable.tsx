import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState, type ReactNode } from "react";
import { useHideDisabledRows, useShowLineNumbers } from "@/lib/uiPrefs";
import { splitRowsByDisabled } from "@/lib/tableRows";

export function LineLink({ line }: { line?: number }) {
  const [show] = useShowLineNumbers();
  if (!show) return null;
  if (!line) return <span className="text-muted-foreground">—</span>;
  return <span className="font-mono text-xs text-muted-foreground">L{line}</span>;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "warn" | "danger" | "ok" | "muted";
}) {
  const colors: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    warn: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    danger: "bg-destructive/15 text-destructive",
    ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${colors[tone]}`}>
      {children}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  search?: (row: T) => string;
  className?: string;
  hiddenWhenNoLineNo?: boolean;
}

export function DataTable<T>({
  rows,
  columns: allColumns,
  filename = "export.csv",
  emptyText = "无数据",
  pageSize = 50,
  isDisabledRow,
  searchPlaceholder = "筛选（任意列）",
}: {
  rows: T[];
  columns: Column<T>[];
  filename?: string;
  emptyText?: string;
  pageSize?: number;
  isDisabledRow?: (row: T) => boolean;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [showLineNo] = useShowLineNumbers();
  const [hideDisabled, setHideDisabled] = useHideDisabledRows();
  const columns = useMemo(
    () => allColumns.filter((c) => showLineNo || !c.hiddenWhenNoLineNo),
    [allColumns, showLineNo],
  );

  const { visible: baseRows, hiddenCount } = useMemo(
    () => splitRowsByDisabled(rows, isDisabledRow, hideDisabled),
    [rows, isDisabledRow, hideDisabled],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return baseRows;
    return baseRows.filter((r) =>
      columns.some((c) => {
        const v = c.search ? c.search(r) : typeof c.cell(r) === "string" ? String(c.cell(r)) : "";
        return v.toLowerCase().includes(needle);
      }),
    );
  }, [q, baseRows, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const pageRows = filtered.slice(cur * pageSize, (cur + 1) * pageSize);

  const exportCsv = () => {
    const lines = [
      columns.map((c) => `"${c.header}"`).join(","),
      ...filtered.map((r) =>
        columns
          .map((c) => {
            const v = c.search ? c.search(r) : reactNodeToText(c.cell(r));
            return `"${v.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          className="max-w-xs"
        />
        <span className="text-xs text-muted-foreground">
          共 {filtered.length} 条 · {baseRows.length} 总
          {hiddenCount > 0 ? ` · 已禁用 ${hiddenCount}` : ""}
        </span>
        <div className="flex-1" />
        {isDisabledRow && hiddenCount > 0 && (
          <label
            className="flex cursor-pointer select-none items-center gap-2 px-1 text-sm"
            title={
              hideDisabled
                ? `勾选后显示 ${hiddenCount} 条已禁用记录，导出也会包含`
                : `取消勾选后隐藏 ${hiddenCount} 条已禁用记录，导出也会隐藏`
            }
          >
            <Checkbox
              checked={!hideDisabled}
              onCheckedChange={(checked) => {
                setHideDisabled(checked !== true);
                setPage(0);
              }}
            />
            <span>显示已禁用</span>
          </label>
        )}
        <Button size="sm" variant="outline" onClick={exportCsv}>
          导出 CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-3 py-2 text-left font-medium ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map((r, i) => (
                <tr key={i} className="border-t border-border hover:bg-secondary/40">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 align-top ${c.className ?? ""}`}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
            ← 上一页
          </Button>
          <span className="text-muted-foreground">
            {cur + 1} / {pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={cur >= pages - 1}
            onClick={() => setPage(cur + 1)}
          >
            下一页 →
          </Button>
        </div>
      )}
    </div>
  );
}

function reactNodeToText(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(reactNodeToText).join(" ");
  if (typeof n === "object" && "props" in (n as object)) {
    return reactNodeToText((n as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}
