import { fixture, ok } from "./helpers.mjs";
import { insert, transaction, now } from "../server/db.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const f = await fixture();
try {
  transaction(f.db, () => {
    for (let i = 19; i <= 100; i++)
      insert(f.db, "vehicles", {
        id: "BENCH-V" + i,
        code: "BENCH-V" + i,
        name: "待核实车辆样本" + i,
        owner_id: "ORG-N",
        status: "待核实",
        capacity_kwh: 350,
        payload_kg: 30000,
        soc: null,
        source: "SIMULATED",
        data: { evidence: "性能验证样本，不参与实际调度" },
      });
    for (let i = 4; i <= 10; i++) {
      const id = "BENCH-S" + i;
      insert(f.db, "stations", {
        id,
        code: id,
        name: "待核实场站样本" + i,
        owner_id: "ORG-N",
        status: "待核实",
        mode: "充电",
        power_kw: 720,
        longitude: 107.5 + i * 0.01,
        latitude: 35.7,
        source: "SIMULATED",
        data: { evidence: "性能验证样本" },
      });
      for (let n = 1; n <= 3; n++)
        insert(f.db, "devices", {
          id: id + "-" + n,
          code: id + "-" + n,
          name: "待核实工位" + n,
          owner_id: "ORG-N",
          station_id: id,
          status: "待核实",
          connection: "待核实",
          power_kw: 240,
          source: "SIMULATED",
          data: {},
        });
    }
    for (let i = 25; i <= 1000; i++)
      insert(f.db, "orders", {
        id: "BENCH-O" + i,
        code: "BENCH-O" + i,
        name: "未占量订单草稿" + i,
        owner_id: "ORG-N",
        demand_id: "DM1",
        status: "草稿",
        quantity_kg: 30000,
        start_at: "2026-10-14T00:00:00Z",
        finish_at: "2026-10-14T10:00:00Z",
        created_at: now(),
        source: "SIMULATED",
        data: {
          origin: "北区装载场",
          destination: "煤炭集运中心",
          distance_km: 17,
          cargo: "原煤",
        },
      });
  });
  const percentile = (xs, p) =>
      xs.slice().sort((a, b) => a - b)[
        Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)
      ],
    metrics = [];
  const check = async (name, fn, target, count = 20) => {
    const times = [];
    for (let i = 0; i < count; i++) {
      const at = performance.now();
      await fn();
      times.push(performance.now() - at);
    }
    const p95 = percentile(times, 0.95);
    metrics.push({
      name,
      samples: count,
      p50_ms: percentile(times, 0.5),
      p95_ms: p95,
      max_ms: Math.max(...times),
      target_ms: target,
      result: p95 < target ? "PASS" : "FAIL",
    });
    assert(p95 < target, name + "本地基准超限");
  };
  await check(
    "订单分页查询",
    () => f.admin.req("/api/resources/orders?pageSize=100").then(ok),
    500,
  );
  await check("统计下钻", () => f.admin.req("/api/reports").then(ok), 1000);
  await check(
    "参考推演",
    () =>
      f
        .cmd("simulation.run", null, {
          order_id: "O013",
          vehicle_ids: ["V001", "V002"],
          station_id: "S001",
          soc: 74,
          reserve_soc: 20,
          use_reference: true,
        })
        .then(ok),
    2000,
    10,
  );
  const start = performance.now();
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      f.admin.req("/api/resources/orders?pageSize=50"),
    ),
  );
  concurrent.forEach(ok);
  metrics.push({
    name: "10并发只读请求",
    elapsed_ms: performance.now() - start,
    result: "PASS",
  });
  const report = {
    status: "PASS",
    checked_at: now(),
    scenario: {
      vehicles: 100,
      stations: 10,
      devices: 30,
      orders: 1000,
      users: 6,
    },
    targets_basis: "用户委托按推荐确定的本地开发基准；不代表现场或生产SLA",
    metrics,
  };
  fs.writeFileSync(
    process.env.BENCHMARK_REPORT_PATH ||
      "docs/development/05-acceptance/scale-benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await f.close();
}
