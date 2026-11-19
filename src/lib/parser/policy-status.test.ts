import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./index";
import { getFocusLines } from "../access";

const policyLine = (id: number) => `policy ${id} trust untrust branch server web - - always permit`;

test("识别定义前或定义后的 enable/disable 状态行", () => {
  const cfg = parseConfig(
    [
      "policy 8 disable",
      policyLine(7),
      "policy 7 disable",
      policyLine(8),
      policyLine(9),
      "policy 9 enable",
    ].join("\n"),
  );

  assert.equal(cfg.policies.length, 3);
  assert.equal(cfg.policies.find((p) => p.id === "7")?.disabled, true);
  assert.equal(cfg.policies.find((p) => p.id === "8")?.disabled, true);
  assert.equal(cfg.policies.find((p) => p.id === "9")?.disabled, false);
});

test("策略定义后的缩进 disable 子行也会关闭策略", () => {
  const cfg = parseConfig([policyLine(12), "  disable"].join("\n"));
  assert.equal(cfg.policies[0]?.disabled, true);
});

test("真实策略 #74 没有 enable 子行，应识别为关闭", () => {
  const cfg = parseConfig(
    [
      "policy 74 any any 36楼与39楼运维室地址 API网关-172.23.51.28 影像地图数据库-20202 any any 12-31 permit",
      " description CHJ-20250630-03-01",
      " ips test",
      " av test",
    ].join("\n"),
  );

  assert.equal(cfg.policies.length, 1);
  assert.equal(cfg.policies[0]?.id, "74");
  assert.equal(cfg.policies[0]?.disabled, true);
});

test("真实策略 #229 带 enable 子行，应识别为开启", () => {
  const cfg = parseConfig(
    [
      "policy 229 any any 财富大厦统一出口 API网关-172.23.51.28 影像地图数据库-20202 any any 2026-12-31 permit",
      " description CHJ-20250630-03-01",
      " ips test",
      " av test",
      " enable",
    ].join("\n"),
  );

  assert.equal(cfg.policies.length, 1);
  assert.equal(cfg.policies[0]?.id, "229");
  assert.equal(cfg.policies[0]?.disabled, false);
});

test("禁用的 permit 策略不能把 DNAT 标记为已关联", () => {
  const raw = [
    "address inside",
    "  host-address 10.0.0.8",
    "service web",
    "  tcp dest 443",
    "ip nat destination untrust any 192.0.2.10 web inside 70",
    "policy 9 untrust trust any inside web - - always permit",
    "policy 9 disable",
  ].join("\n");

  const disabledLines = getFocusLines(parseConfig(raw), true);
  assert.equal(disabledLines.length, 1);
  assert.equal(disabledLines[0]?.action, "unassociated");
  assert.equal(disabledLines[0]?.policies.length, 0);

  const enabledLines = getFocusLines(
    parseConfig(raw.replace("policy 9 disable", "policy 9 enable")),
    true,
  );
  assert.equal(enabledLines[0]?.action, "associated");
  assert.equal(enabledLines[0]?.policies[0]?.id, "9");
});
