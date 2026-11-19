import test from "node:test";
import assert from "node:assert/strict";
import type { FocusLine } from "./access";
import { parseConfig } from "./parser/index";
import { filterAccessLinesByObject } from "./accessFilters";

function line(key: string, src: string, dst: string): FocusLine {
  return {
    key,
    src,
    dst,
    proto: "tcp",
    port: "443",
    service: "tcp/443",
    action: "associated",
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
