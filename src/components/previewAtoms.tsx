import type { ReactNode } from "react";

/** Small uppercase muted field label */
export function L({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-0.5 font-sans">
      {children}
    </span>
  );
}

/** Quote-style description block (left border + italic) for user descriptions */
export function DescQuote({
  children,
  as = "div",
  className = "",
}: {
  children: ReactNode;
  as?: "div" | "span";
  className?: string;
}) {
  const cls = `border-l-2 border-border pl-2 italic text-xs text-muted-foreground break-all ${className}`;
  if (as === "span") return <span className={cls}>{children}</span>;
  return <div className={cls}>{children}</div>;
}
