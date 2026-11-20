import { Badge } from "@/components/DataTable";
import { getPolicyExpiry } from "@/lib/policyStatus";
import type { ParsedConfig, PolicyRule } from "@/lib/parser/types";

export function PolicyStatusBadges({ policy, cfg }: { policy: PolicyRule; cfg: ParsedConfig }) {
  const expiry = getPolicyExpiry(policy, cfg);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={policy.disabled ? "muted" : "ok"}>{policy.disabled ? "已禁用" : "已启用"}</Badge>
      {expiry.expired && (
        <Badge tone="warn">
          <span title={expiry.expiresAtText ? `到期时间：${expiry.expiresAtText}` : undefined}>
            已过期
          </span>
        </Badge>
      )}
    </span>
  );
}
