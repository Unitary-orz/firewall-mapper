import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, runAudit, buildCrossRef } from "./parser/index";
import { getFocusLines } from "./access";
import { getPolicyExpiry, isPolicyExpired, policyStatusText } from "./policyStatus";

const NOW = new Date(2026, 10, 20, 15, 14, 0);

function configWithSchedules() {
  return parseConfig(
    [
      "schedule onetime expired",
      " absolute 26-01-06 16:48:04 26-06-30 10:20:59",
      "schedule recurring active",
      " absolute 26-01-22 16:38:30 26-12-31 16:39:10",
      " periodic 00:00:00 23:59:59 monday tuesday wednesday thursday friday saturday sunday",
      "schedule onetime undated",
      " periodic 00:00:00 23:59:59 monday",
      "policy 1 any any source destination web - - expired permit",
      " enable",
      "policy 2 any any source destination web - - active permit",
      " enable",
      "policy 3 any any source destination web - - undated permit",
      " enable",
      "policy 4 any any source destination web - - expired permit",
      " disable",
    ].join("\n"),
  );
}

test("按 schedule absolute 的结束时间识别已过期策略", () => {
  const cfg = configWithSchedules();
  const expired = cfg.policies.find((policy) => policy.id === "1")!;
  const active = cfg.policies.find((policy) => policy.id === "2")!;

  assert.equal(isPolicyExpired(expired, cfg, NOW), true);
  assert.equal(getPolicyExpiry(expired, cfg, NOW).expiresAtText, "2026-06-30 10:20:59");
  assert.equal(isPolicyExpired(active, cfg, NOW), false);
});

test("结束秒仍有效，下一秒才过期", () => {
  const cfg = configWithSchedules();
  const policy = cfg.policies[0];
  assert.equal(isPolicyExpired(policy, cfg, new Date(2026, 5, 30, 10, 20, 59)), false);
  assert.equal(isPolicyExpired(policy, cfg, new Date(2026, 5, 30, 10, 21, 0)), true);
});

test("无绝对结束时间的周期计划不标记为过期", () => {
  const cfg = configWithSchedules();
  assert.equal(isPolicyExpired(cfg.policies[2], cfg, NOW), false);
});

test("已禁用和已过期是两个同时保留的状态", () => {
  const cfg = configWithSchedules();
  const policy = cfg.policies[3];
  assert.equal(policy.disabled, true);
  assert.equal(isPolicyExpired(policy, cfg, NOW), true);
  assert.equal(policyStatusText(policy, cfg, NOW), "disabled 已禁用 expired 已过期");
});

test("过期 permit 策略不能形成 DNAT 有效关联", () => {
  const raw = (scheduleName: string) =>
    [
      `schedule onetime ${scheduleName}`,
      scheduleName === "old"
        ? " absolute 00-01-01 00:00:00 00-01-02 00:00:00"
        : " absolute 99-01-01 00:00:00 99-01-02 00:00:00",
      "address inside",
      " host-address 10.0.0.8",
      "service web",
      " tcp dest 443",
      "ip nat destination untrust any 192.0.2.10 web inside 70",
      `policy 9 untrust trust any inside web - - ${scheduleName} permit`,
      " enable",
    ].join("\n");

  const expiredLines = getFocusLines(parseConfig(raw("old")), true);
  assert.equal(expiredLines[0]?.action, "unassociated");
  assert.equal(expiredLines[0]?.policies.length, 0);

  const activeLines = getFocusLines(parseConfig(raw("future")), true);
  assert.equal(activeLines[0]?.action, "associated");
  assert.equal(activeLines[0]?.policies[0]?.id, "9");
});

test("过期策略不再触发有效宽松策略审计", () => {
  const cfg = parseConfig(
    [
      "schedule onetime old",
      " absolute 00-01-01 00:00:00 00-01-02 00:00:00",
      "policy 9 any any any any any - - old permit",
      " enable",
    ].join("\n"),
  );
  const findings = runAudit(cfg, buildCrossRef(cfg));
  assert.equal(
    findings.some((finding) => finding.category === "宽松策略"),
    false,
  );
});
