import { Link } from "@tanstack/react-router";

export function EmptyConfig() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">
        尚未加载防火墙配置文件。
      </p>
      <Link
        to="/"
        className="mt-3 inline-block rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        前往上传
      </Link>
    </div>
  );
}
