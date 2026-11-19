import test from "node:test";
import assert from "node:assert/strict";
import type { FocusLine } from "./access";
import { parseConfig } from "./parser/index";
import {
  countUnassociatedLines,
  filterAccessLinesByAssociation,
  filterAccessLinesByObject,
} from "./accessFilters";

function line(key: string, src: string, dst: string, action = "associated"): FocusLine {
  return {
    key,
    src,
    dst,
    proto: "tcp",
    port: "443",
    service: "tcp/443",
    action,
    policies: [],
    nat: [],
    coverageKind: "ok",
  };
}

const lines = [
  line("office-api", "办公网", "API网关"),
  line("branch-web", "Branch-Office", "Web服务器"),
  line("other", "数据中心", "数据库"),
];

test("空对象筛选保留全部访问路径", () => {
  assert.equal(filterAccessLinesByObject(lines, "  "), lines);
});

test("按来源或目的对象名称进行不区分大小写的模糊筛选", () => {
  assert.deepEqual(
    filterAccessLinesByObject(lines, "办公").map((item) => item.key),
    ["office-api"],
  );
  assert.deepEqual(
    filterAccessLinesByObject(lines, "api").map((item) => item.key),
    ["office-api"],
  );
  assert.deepEqual(
    filterAccessLinesByObject(lines, "branch").map((item) => item.key),
    ["branch-web"],
  );
});

test("IP 命中包含它的地址对象以及引用该对象的地址组", () => {
  const cfg = parseConfig(
    [
      "address branch-host",
      "  host-address 10.0.0.8",
      "address-group branch-group",
      "  address-object branch-host",
    ].join("\n"),
  );
  const ipLines = [line("object", "any", "branch-host"), line("group", "branch-group", "other")];
  assert.deepEqual(
    filterAccessLinesByObject(ipLines, "10.0.0.8", cfg).map((item) => item.key),
    ["object", "group"],
  );
});

test("只筛选来源和目的对象，不匹配服务、NAT 或策略字段", () => {
  const item = line("other-fields", "source", "destination");
  item.nat = [{ entryAddr: "needle" } as FocusLine["nat"][number]];
  item.policies = [{ srcAddr: "needle" } as FocusLine["policies"][number]];
  assert.deepEqual(filterAccessLinesByObject([item], "needle"), []);
  assert.deepEqual(filterAccessLinesByObject([item], "443"), []);
});

test("未勾选时保留未关联策略的路径，并只统计这类行", () => {
  const rows = [
    line("permit-one", "办公网", "API网关", "permit"),
    line("orphan-one", "办公网", "API网关", "unassociated"),
    line("deny-one", "分支网", "API网关", "deny"),
  ];
  assert.equal(countUnassociatedLines(rows), 1);
  assert.deepEqual(filterAccessLinesByAssociation(rows, false), rows);
});

test("勾选隐藏未关联策略后，仅移除未关联行，保留 permit 与 deny", () => {
  const rows = [
    line("permit-one", "办公网", "API网关", "permit"),
    line("orphan-one", "办公网", "API网关", "unassociated"),
    line("deny-one", "分支网", "API网关", "deny"),
  ];
  assert.deepEqual(
    filterAccessLinesByAssociation(rows, true).map((item) => item.key),
    ["permit-one", "deny-one"],
  );
});

test("隐藏未关联策略与对象筛选叠加时，条数只统计两者交集", () => {
  const rows = [
    line("office-orphan", "办公网", "API网关", "unassociated"),
    line("branch-orphan", "分支网", "API网关", "unassociated"),
    line("office-permit", "办公网", "API网关", "permit"),
  ];
  const objectFiltered = filterAccessLinesByObject(rows, "办公");
  assert.equal(countUnassociatedLines(objectFiltered), 1);
  assert.deepEqual(
    filterAccessLinesByAssociation(objectFiltered, true).map((item) => item.key),
    ["office-permit"],
  );
});
