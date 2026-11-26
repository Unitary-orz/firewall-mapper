import test from "node:test";
import assert from "node:assert/strict";
import { getBuiltinService } from "./builtinServices";
import { getFocusLines, serviceToPorts, serviceRefKind, serviceNamesForPort } from "./access";
import { parseConfig } from "./parser/index";

test("https 内置服务解析为 TCP 443 并保留服务名", () => {
  const cfg = parseConfig("");
  assert.deepEqual(serviceToPorts("https", cfg), ["tcp/443"]);
  assert.equal(serviceRefKind("https", cfg), "builtin");
  assert.deepEqual(serviceNamesForPort("https", "tcp/443", cfg), ["https"]);
  assert.equal(getBuiltinService("HTTPS")?.entries[0]?.destPort, "443");
});

test("服务组内置成员展开，配置同名对象优先且未知名称不被猜测", () => {
  const cfg = parseConfig("service-group web\n service-object https\n service-object http");
  assert.deepEqual(serviceToPorts("web", cfg), ["tcp/443", "tcp/80"]);
  const custom = parseConfig("service https\n tcp dest 8443");
  assert.deepEqual(serviceToPorts("https", custom), ["tcp/8443"]);
  assert.equal(serviceRefKind("https", custom), "service");
  assert.equal(getBuiltinService("not-a-service"), undefined);
  assert.deepEqual(serviceToPorts("not-a-service", cfg), ["not-a-service"]);
  assert.equal(cfg.services.length, 0);
});

test("DNAT 转换后 TCP 443 正确命中 https 策略", () => {
  const cfg = parseConfig(
    [
      "address inside",
      " host-address 10.0.0.8",
      "ip nat destination any any 192.0.2.10 tcp/7443 inside service tcp/443 1",
      "policy 1 any any any inside https - - always permit",
      " enable",
    ].join("\n"),
  );
  const line = getFocusLines(cfg).find((row) => row.nat.length > 0);
  assert.equal(line?.action, "associated");
  assert.equal(line?.service, "tcp/443");
  assert.deepEqual(
    line?.policies.map((policy) => policy.id),
    ["1"],
  );
});
