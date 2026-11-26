import test from "node:test";
import assert from "node:assert/strict";
import { presentChainPorts } from "./portPresentation";

const port = (id: number, associated: boolean) => ({ id, policies: associated ? [1] : [] });

test("每个有关联策略的端口独立保留，其余多个端口汇总", () => {
  const result = presentChainPorts([
    port(443, true),
    port(80, true),
    port(8080, false),
    port(8443, false),
  ]);
  assert.deepEqual(
    result.visible.map((p) => p.id),
    [443, 80],
  );
  assert.deepEqual(
    result.hidden.map((p) => p.id),
    [8080, 8443],
  );
});
test("只有一个未关联端口时不汇总", () => {
  const result = presentChainPorts([port(443, true), port(80, false)]);
  assert.deepEqual(
    result.visible.map((p) => p.id),
    [443, 80],
  );
  assert.equal(result.hidden.length, 0);
});
test("全未关联时保留第一个端口并汇总其余端口", () => {
  const result = presentChainPorts([port(80, false), port(8080, false), port(8443, false)]);
  assert.deepEqual(
    result.visible.map((p) => p.id),
    [80],
  );
  assert.deepEqual(
    result.hidden.map((p) => p.id),
    [8080, 8443],
  );
});
test("单端口链路保留原行", () => {
  const result = presentChainPorts([port(80, false)]);
  assert.equal(result.visible.length, 1);
  assert.equal(result.hidden.length, 0);
});
