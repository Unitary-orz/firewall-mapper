import test from "node:test";
import assert from "node:assert/strict";
import { getFocusLines } from "./access";
import { buildCrossRef, parseConfig } from "./parser/index";

const REAL_SNAT = [
  "interface ge0/0",
  " ip address 172.23.51.138/24",
  "address 数据服务管理子系统",
  " host-address 10.0.0.8",
  "service 59.225.204.3-8160",
  " tcp dest 8160",
  "ip nat source ge0/0 数据服务管理子系统 59.225.204.3 59.225.204.3-8160 interface 274",
  "policy 300 any any 数据服务管理子系统 59.225.204.3 59.225.204.3-8160 any any 2026-12-31 permit",
  " enable",
].join("\n");

test("真实 SNAT #274 正确区分原始服务与出接口源转换，并关联策略 #300", () => {
  const cfg = parseConfig(REAL_SNAT);
  const rule = cfg.natRules.find((item) => item.id === "274");
  assert.equal(rule?.origDstService, "59.225.204.3-8160");
  assert.equal(rule?.translatedSrc, "");
  assert.equal(rule?.translatedPool, "");
  assert.equal(rule?.egressInterface, true);

  const lines = getFocusLines(cfg, false);
  assert.equal(lines.length, 1, "等价策略路径不应再重复生成 Direct");
  assert.equal(lines[0]?.src, "数据服务管理子系统");
  assert.equal(lines[0]?.dst, "59.225.204.3");
  assert.equal(lines[0]?.service, "tcp/8160");
  assert.deepEqual(lines[0]?.serviceNames, ["59.225.204.3-8160"]);
  assert.equal(lines[0]?.action, "associated");
  assert.equal(lines[0]?.policies[0]?.id, "300");
  assert.equal(lines[0]?.snat[0]?.rule.id, "274");
  assert.equal(lines[0]?.nat.length, 0);
});

test("SNAT 地址池写入转换后源而不是服务字段", () => {
  const cfg = parseConfig(
    [
      "address inside",
      " host-address 10.0.0.8",
      "service web",
      " tcp dest 443",
      "ip nat pool public-pool",
      " ip address 192.0.2.10 192.0.2.20",
      "ip nat source ge0/0 inside 198.51.100.8 web public-pool 103",
    ].join("\n"),
  );
  const rule = cfg.natRules[0];
  assert.equal(rule?.origDstService, "web");
  assert.equal(rule?.translatedSrc, "public-pool");
  assert.equal(rule?.translatedPool, "public-pool");
  assert.equal(rule?.egressInterface, false);
  const refs = buildCrossRef(cfg).addressUsedBy.get("public-pool") ?? [];
  assert.equal(refs.filter((ref) => ref.by === "nat" && ref.id === "103").length, 1);
});

test("SNAT 策略关联要求非 any 的原始源真实匹配", () => {
  const cfg = parseConfig(
    `${REAL_SNAT}\npolicy 301 any any 10.9.9.9 59.225.204.3 59.225.204.3-8160 any any always permit\n enable`,
  );
  const line = getFocusLines(cfg, false).find((item) => item.snat.length > 0);
  assert.equal(
    line?.policies.some((policy) => policy.id === "301"),
    false,
  );
  assert.equal(
    line?.policies.some((policy) => policy.id === "300"),
    true,
  );
});

test("SNAT 没有 permit 但有匹配 deny 时显示拒绝而不是未关联", () => {
  const cfg = parseConfig(REAL_SNAT.replace("permit", "deny"));
  const line = getFocusLines(cfg, false).find((item) => item.snat.length > 0);
  assert.equal(line?.action, "deny");
  assert.equal(line?.policies[0]?.action, "deny");
});

test("SNAT 的 any 源和服务可通配，并保留规则自身的 any 服务范围", () => {
  const cfg = parseConfig(
    [
      "service web",
      " tcp dest 443",
      "ip nat source ge0/0 any 198.51.100.8 any interface 90",
      "policy 9 any any branch 198.51.100.8 web - - always permit",
      " enable",
    ].join("\n"),
  );
  const lines = getFocusLines(cfg, false);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.service, "any");
  assert.equal(lines[0]?.action, "associated");
  assert.equal(lines[0]?.snat[0]?.rule.id, "90");
});

test("禁用 SNAT 默认不生成路径，显示禁用项时保留", () => {
  const cfg = parseConfig(`${REAL_SNAT}\nip nat 274 disable`);
  const visible = getFocusLines(cfg, false);
  assert.equal(
    visible.some((line) => line.snat.length > 0),
    false,
  );
  const all = getFocusLines(cfg, true);
  assert.equal(all.find((line) => line.snat.length > 0)?.action, "associated");
});
