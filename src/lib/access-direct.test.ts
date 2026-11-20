import test from "node:test";
import assert from "node:assert/strict";
import { getFocusLines } from "./access";
import { parseConfig } from "./parser/index";

test("同一策略已由等价 NAT 链路表达时不重复生成 Direct", () => {
  const cfg = parseConfig(
    [
      "address API网关-172.23.51.28",
      " host-address 172.23.51.28",
      "address api-172.23.51.28",
      " host-address 172.23.51.28",
      "service api-30000",
      " tcp dest 30000",
      "ip nat destination untrust any 192.0.2.10 api-30000 api-172.23.51.28 70",
      "policy 1 untrust trust 59.225.201.24 API网关-172.23.51.28 api-30000 - - always permit",
      " enable",
    ].join("\n"),
  );

  const lines = getFocusLines(cfg, true);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.nat[0]?.rule.id, "70");
  assert.equal(lines[0]?.policies[0]?.id, "1");
});

test("Direct 来源范围大于 NAT 来源时保留未被覆盖的访问面", () => {
  const cfg = parseConfig(
    [
      "address branch",
      " host-address 10.0.0.8",
      "address inside",
      " host-address 10.0.0.9",
      "service web",
      " tcp dest 443",
      "ip nat destination untrust branch 192.0.2.10 web inside 70",
      "policy 9 untrust trust any inside web - - always permit",
      " enable",
    ].join("\n"),
  );

  const lines = getFocusLines(cfg, true);
  assert.equal(lines.length, 2);
  assert.equal(lines.filter((line) => line.nat.length > 0).length, 1);
  assert.equal(lines.filter((line) => line.nat.length === 0).length, 1);
  assert.equal(lines.find((line) => line.nat.length === 0)?.src, "any");
});

test("Direct 目的地址组大于 NAT 转换目的时保留完整直连路径", () => {
  const cfg = parseConfig(
    [
      "address api",
      " host-address 10.0.0.8",
      "address other",
      " host-address 10.0.0.9",
      "address-group internal",
      " address-object api",
      " address-object other",
      "service web",
      " tcp dest 443",
      "ip nat destination untrust any 192.0.2.10 web api 70",
      "policy 9 untrust trust branch internal web - - always permit",
      " enable",
    ].join("\n"),
  );

  const lines = getFocusLines(cfg, true);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((line) => line.nat.length === 0)?.dst, "internal");
});
