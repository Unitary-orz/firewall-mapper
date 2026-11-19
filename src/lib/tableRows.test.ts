import test from "node:test";
import assert from "node:assert/strict";
import { splitRowsByDisabled } from "./tableRows";

type Row = { id: number; disabled?: boolean };
const rows: Row[] = [{ id: 1 }, { id: 2, disabled: true }, { id: 3 }, { id: 4, disabled: true }];
const isDisabled = (r: Row) => !!r.disabled;

test("默认隐藏已禁用行，并报告被隐藏的数量", () => {
  const { visible, hiddenCount } = splitRowsByDisabled(rows, isDisabled, true);
  assert.deepEqual(
    visible.map((r) => r.id),
    [1, 3],
  );
  assert.equal(hiddenCount, 2);
});

test("选择显示时保留全部行，但仍统计已禁用数量", () => {
  const { visible, hiddenCount } = splitRowsByDisabled(rows, isDisabled, false);
  assert.equal(visible.length, 4);
  assert.equal(hiddenCount, 2);
});

test("没有禁用行时原样返回", () => {
  const clean = [{ id: 1 }, { id: 2 }];
  const { visible, hiddenCount } = splitRowsByDisabled(clean, isDisabled, true);
  assert.equal(visible, clean);
  assert.equal(hiddenCount, 0);
});

test("未提供禁用判断时不做任何过滤", () => {
  const { visible, hiddenCount } = splitRowsByDisabled(rows, undefined, true);
  assert.equal(visible, rows);
  assert.equal(hiddenCount, 0);
});

test("全部禁用且选择隐藏时表格为空", () => {
  const allOff = [{ id: 1, disabled: true }];
  const { visible, hiddenCount } = splitRowsByDisabled(allOff, isDisabled, true);
  assert.deepEqual(visible, []);
  assert.equal(hiddenCount, 1);
});
