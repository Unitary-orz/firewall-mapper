import test from "node:test";
import assert from "node:assert/strict";
import { getFocusLines } from "./access";
import { parseConfig } from "./parser/index";

test("服务组 DNAT 每个端口一行，策略只关联真正覆盖的端口", () => {
  const cfg = parseConfig(
    [
      "address inside",
      " host-address 10.0.0.9",
      "service web",
      " tcp dest 443",
      "service alt",
      " tcp dest 8080",
      "service-group webs",
      " service-object web",
      " service-object alt",
      "ip nat destination untrust any 192.0.2.10 webs inside 70",
      "policy 1 untrust trust any inside web - - always permit",
      " enable",
    ].join("\n"),
  );
  const lines = getFocusLines(cfg, true).filter((l) => l.nat.length > 0);
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.port === "443")?.action, "associated");
  assert.equal(lines.find((l) => l.port === "8080")?.action, "unassociated");
});
