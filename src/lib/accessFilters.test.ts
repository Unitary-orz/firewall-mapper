import test from "node:test";
import assert from "node:assert/strict";
import type { FocusLine } from "./access";
import {
  DEFAULT_ACCESS_LINE_FILTER,
  countActiveAccessFilters,
  filterAccessLines,
} from "./accessFilters";

function line(key: string, action: string, natCount: number, policyCount: number): FocusLine {
  return {
    key,
    src: "source",
    dst: "destination",
    proto: "tcp",
    port: "443",
    service: "tcp/443",
    action,
    policies: Array.from({ length: policyCount }, () => ({ id: key })) as FocusLine["policies"],
    nat: Array.from({ length: natCount }, () => ({})) as FocusLine["nat"],
    coverageKind: "ok",
  };
}

const lines = [
  line("direct-permit", "permit", 0, 1),
  line("direct-deny", "deny", 0, 1),
  line("nat-associated", "associated", 1, 1),
  line("nat-unassociated", "unassociated", 1, 0),
];

test("默认筛选保留全部访问路径", () => {
  assert.equal(filterAccessLines(lines, DEFAULT_ACCESS_LINE_FILTER), lines);
  assert.equal(countActiveAccessFilters(DEFAULT_ACCESS_LINE_FILTER), 0);
});

test("NAT 与直连筛选互斥", () => {
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, nat: "nat" }).map((l) => l.key),
    ["nat-associated", "nat-unassociated"],
  );
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, nat: "direct" }).map((l) => l.key),
    ["direct-permit", "direct-deny"],
  );
});

test("策略关联筛选按是否存在关联策略判断", () => {
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, association: "associated" }).map(
      (l) => l.key,
    ),
    ["direct-permit", "direct-deny", "nat-associated"],
  );
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, association: "unassociated" }).map(
      (l) => l.key,
    ),
    ["nat-unassociated"],
  );
});

test("permit 包含被放行策略覆盖的 NAT 路径，deny 只保留拒绝路径", () => {
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, action: "permit" }).map((l) => l.key),
    ["direct-permit", "nat-associated"],
  );
  assert.deepEqual(
    filterAccessLines(lines, { ...DEFAULT_ACCESS_LINE_FILTER, action: "deny" }).map((l) => l.key),
    ["direct-deny"],
  );
});

test("多个条件同时生效并准确计算已启用筛选数", () => {
  const filter = { nat: "nat", association: "associated", action: "permit" } as const;
  assert.deepEqual(
    filterAccessLines(lines, filter).map((l) => l.key),
    ["nat-associated"],
  );
  assert.equal(countActiveAccessFilters(filter), 3);
});
