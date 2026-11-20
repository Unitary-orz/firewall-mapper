import assert from "node:assert/strict";
import test from "node:test";
import { policyIdSearchText } from "./policySearch";

test("策略 ID 支持数字、井号、ID 前缀和中文前缀搜索", () => {
  const searchText = policyIdSearchText("274").toLowerCase();
  for (const query of ["274", "#274", "ID:274", "id 274", "策略274", "策略 274", "策略 #274"]) {
    assert.equal(searchText.includes(query.toLowerCase()), true, `应能搜索 ${query}`);
  }
});
