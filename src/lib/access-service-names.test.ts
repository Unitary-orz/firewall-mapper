import test from "node:test";
import assert from "node:assert/strict";
import { getFocusLines, serviceNamesForPort } from "./access";
import { parseConfig } from "./parser/index";

test("访问关系在真实端口旁保留服务对象名称", () => {
  const cfg = parseConfig(
    [
      "address inside",
      " host-address 10.0.0.8",
      "service 影像地图数据库-20202",
      " tcp dest 20202",
      "ip nat destination untrust any 192.0.2.10 影像地图数据库-20202 inside 70",
      "policy 9 untrust trust any inside 影像地图数据库-20202 - - always permit",
      " enable",
    ].join("\n"),
  );

  const lines = getFocusLines(cfg, true);
  assert.equal(lines[0]?.service, "tcp/20202");
  assert.deepEqual(lines[0]?.serviceNames, ["影像地图数据库-20202"]);
});

test("服务组路径显示与当前端口对应的成员服务名称", () => {
  const cfg = parseConfig(
    [
      "address inside",
      " host-address 10.0.0.9",
      "service 172.23.51.9-32081",
      " tcp dest 32081",
      "service 172.23.51.9-32180",
      " tcp dest 32180",
      "service-group 172.23.51.9",
      " service-object 172.23.51.9-32081",
      " service-object 172.23.51.9-32180",
      "ip nat destination untrust any 192.0.2.10 172.23.51.9 inside 70",
    ].join("\n"),
  );

  const lines = getFocusLines(cfg, true);
  assert.deepEqual(
    lines.map((line) => [line.service, line.serviceNames]),
    [
      ["tcp/32081", ["172.23.51.9-32081"]],
      ["tcp/32180", ["172.23.51.9-32180"]],
    ],
  );
  assert.deepEqual(serviceNamesForPort("172.23.51.9", "tcp/32081", cfg), ["172.23.51.9-32081"]);
});

test("无 NAT 的策略路径也直接显示服务名称", () => {
  const cfg = parseConfig(
    [
      "service https-管理口",
      " tcp dest 8443",
      "policy 12 any any office server https-管理口 - - always permit",
      " enable",
    ].join("\n"),
  );

  const line = getFocusLines(cfg, true)[0];
  assert.equal(line?.service, "tcp/8443");
  assert.deepEqual(line?.serviceNames, ["https-管理口"]);
});
