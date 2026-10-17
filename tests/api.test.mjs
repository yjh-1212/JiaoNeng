import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
async function fixture() {
  const db = database(":memory:"),
    { app } = createApp({ db, config: {} });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  return {
    db,
    base,
    close: async () => {
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}
// Keep the session CSRF separate from each request payload.
async function session(f, username) {
  const r = await fetch(f.base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "JiaoNeng2026!" }),
  });
  const data = await r.json();
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return {
    cookie,
    csrf: data.csrf,
    async req(path, options = {}) {
      const response = await fetch(f.base + path, {
        method: options.method || "GET",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-CSRF-Token": data.csrf,
          ...(options.key ? { "Idempotency-Key": options.key } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return { statusCode: response.status, ...(await response.json()) };
    },
    cmd(type, id, payload = {}, key = crypto.randomUUID()) {
      return this.req("/api/commands", {
        method: "POST",
        body: { type, id, payload },
        key,
      });
    },
  };
}
test("数据库外键、幂等种子及金额整数精度", async () => {
  const f = await fixture();
  try {
    assert.equal(f.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.throws(() =>
      f.db.prepare("INSERT INTO user_scopes VALUES('不存在','ORG-N')").run(),
    );
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM organizations").get().n,
      2,
    );
    assert.equal(f.db.prepare("SELECT count(*) n FROM telemetry").get().n, 432);
    assert.equal(
      f.db
        .prepare("SELECT sum(verified_kg) n FROM tasks WHERE status='已完成'")
        .get().n,
      720000,
    );
    assert(
      f.db
        .prepare("SELECT amount_cents FROM costs")
        .all()
        .every((r) => Number.isSafeInteger(r.amount_cents)),
    );
  } finally {
    await f.close();
  }
});
test("HTTP鉴权、只读、CSRF和主体隔离", async () => {
  const f = await fixture();
  try {
    const anonymous = await fetch(f.base + "/api/bootstrap");
    assert.equal(anonymous.status, 401);
    const north = await session(f, "north"),
      driver = await session(f, "driver01");
    const list = await north.req("/api/resources/orders?pageSize=100");
    assert(list.items.every((r) => r.owner_id === "ORG-N"));
    const forbidden = await north.cmd("order.confirm", "O024", {
      expected_version: 1,
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal((await driver.req("/api/resources/costs")).statusCode, 403);
    assert.equal(
      (await driver.req("/api/resources/tasks/T002")).statusCode,
      404,
    );
    assert(
      (await driver.req("/api/resources/tasks")).items.every(
        (t) => t.driver_id === "D001",
      ),
    );
    assert.equal(
      (
        await fetch(f.base + "/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
      ).status,
      401,
    );
  } finally {
    await f.close();
  }
});
test("需求分配守恒、版本冲突和幂等键内容冲突", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      base = {
        name: "API测试订单",
        demand_id: "DM1",
        quantity: 100,
        cargo: "原煤",
        origin: "北区装载场",
        destination: "集运中心",
        distance_km: 14,
        start_at: new Date(Date.now() + 3600000).toISOString(),
        finish_at: new Date(Date.now() + 12 * 3600000).toISOString(),
      },
      key = crypto.randomUUID();
    const x = await a.cmd("order.create", null, base, key);
    assert.equal(x.statusCode, 200);
    const again = await a.cmd("order.create", null, base, key);
    assert.equal(x.id, again.id);
    assert.equal(
      (await a.cmd("order.create", null, { ...base, quantity: 101 }, key))
        .statusCode,
      409,
    );
    const before = f.db
      .prepare("SELECT allocated_kg FROM demands WHERE id='DM1'")
      .get().allocated_kg;
    assert.equal(
      (await a.cmd("order.confirm", x.id, { expected_version: 99 })).statusCode,
      409,
    );
    assert.equal(
      (await a.cmd("order.confirm", x.id, { expected_version: 1 })).statusCode,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT allocated_kg FROM demands WHERE id='DM1'").get()
        .allocated_kg,
      before + 100000,
    );
    const over = await a.cmd("order.create", null, { ...base, quantity: 4000 });
    assert.equal(
      (await a.cmd("order.confirm", over.id, { expected_version: 1 }))
        .statusCode,
      422,
    );
    assert.equal(
      f.db.prepare("SELECT allocated_kg FROM demands WHERE id='DM1'").get()
        .allocated_kg,
      before + 100000,
    );
  } finally {
    await f.close();
  }
});
test("真实SQLite联动：推演→整批派单→本人车次→退回→核验→汇总", async () => {
  const f = await fixture();
  try {
    const admin = await session(f, "admin"),
      driver = await session(f, "driver01");
    const run = await admin.cmd("simulation.run", null, {
      order_id: "O013",
      vehicle_ids: ["V001", "V002"],
      station_id: "S001",
      soc: 74,
      reserve_soc: 20,
      use_reference: true,
    });
    assert.equal(run.statusCode, 200, run.message);
    assert(run.simulation.candidates.some((c) => c.feasible));
    assert.equal(
      (
        await admin.cmd("simulation.confirm", run.id, {
          expected_version: 1,
          candidate_id: "A",
        })
      ).statusCode,
      200,
    );
    const tasks = f.db
      .prepare("SELECT * FROM tasks WHERE simulation_id=? ORDER BY driver_id")
      .all(run.id);
    assert.equal(tasks.length, 2);
    const items = tasks.map((t) => ({
      id: t.id,
      expected_version: t.version,
      vehicle_id: t.vehicle_id,
      driver_id: t.driver_id,
    }));
    const conflict = await admin.cmd("dispatch.batch", null, {
      items: [
        items[0],
        {
          ...items[1],
          vehicle_id: items[0].vehicle_id,
          driver_id: items[0].driver_id,
        },
      ],
    });
    assert.equal(conflict.statusCode, 409, conflict.message);
    assert(
      f.db
        .prepare("SELECT status FROM tasks WHERE simulation_id=?")
        .all(run.id)
        .every((t) => t.status === "待派发"),
    );
    const dispatched = await admin.cmd("dispatch.batch", null, { items });
    assert.equal(dispatched.statusCode, 200, dispatched.message);
    assert.equal(
      (await driver.req("/api/resources/tasks/" + tasks[1].id)).statusCode,
      404,
    );
    let t = await driver.req("/api/resources/tasks/" + tasks[0].id);
    assert.equal(
      (await driver.cmd("task.accept", t.id, { expected_version: t.version }))
        .statusCode,
      200,
    );
    t = await driver.req("/api/resources/tasks/" + t.id);
    await driver.cmd("task.start", t.id, { expected_version: t.version });
    t = await driver.req("/api/resources/tasks/" + t.id);
    const tr = await driver.cmd("trip.create", t.id, {
      expected_version: t.version,
    });
    t = await driver.req("/api/resources/tasks/" + t.id);
    const noEvidence = await driver.cmd("trip.load", t.id, {
      expected_version: t.version,
      trip_id: tr.trip_id,
      quantity: 30,
      evidence: "",
      event_id: "LOAD-1",
    });
    assert.equal(noEvidence.statusCode, 422);
    assert.equal(
      (
        await driver.cmd("trip.load", t.id, {
          expected_version: t.version,
          trip_id: tr.trip_id,
          quantity: 30,
          evidence: "SIM装货凭证",
          event_id: "LOAD-1",
        })
      ).statusCode,
      200,
    );
    t = await driver.req("/api/resources/tasks/" + t.id);
    await driver.cmd("trip.depart", t.id, {
      expected_version: t.version,
      trip_id: tr.trip_id,
      event_id: "MOVE-1",
    });
    t = await driver.req("/api/resources/tasks/" + t.id);
    const deliveryKey = crypto.randomUUID(),
      payload = {
        expected_version: t.version,
        trip_id: tr.trip_id,
        quantity: 30,
        evidence: "SIM交付凭证",
        event_id: "DELIVERY-1",
      };
    await driver.cmd("trip.deliver", t.id, payload, deliveryKey);
    await driver.cmd("trip.deliver", t.id, payload, deliveryKey);
    t = await driver.req("/api/resources/tasks/" + t.id);
    assert.equal(t.reported_kg, 30000);
    assert.equal(t.verified_kg, 0);
    assert.equal(
      (
        await driver.cmd("task.submit", t.id, {
          expected_version: t.version,
          evidence: "SIM完工",
          remaining_reason: "剩余量另行组织",
        })
      ).statusCode,
      200,
    );
    t = await admin.req("/api/resources/tasks/" + t.id);
    await admin.cmd("task.return", t.id, {
      expected_version: t.version,
      reason: "补充签收凭证",
    });
    t = await driver.req("/api/resources/tasks/" + t.id);
    await driver.cmd("task.submit", t.id, {
      expected_version: t.version,
      evidence: "SIM补充签收",
      remaining_reason: "剩余量另行组织",
    });
    t = await admin.req("/api/resources/tasks/" + t.id);
    assert.equal(t.submission, 2);
    assert.equal(
      (
        await admin.cmd("task.verify", t.id, {
          expected_version: t.version,
          verified_quantity: 30,
          evidence: "SIM逐车次核验",
        })
      ).statusCode,
      200,
    );
    const summary = await admin.req("/api/summary");
    assert.equal(summary.verified_tonnes, 750);
    assert.equal(
      f.db.prepare("SELECT verified_kg FROM trips WHERE id=?").get(tr.trip_id)
        .verified_kg,
      30000,
    );
    assert(f.db.prepare("SELECT count(*) n FROM audit").get().n > 10);
  } finally {
    await f.close();
  }
});
test("费用更正版仅在核验后替代原版，参数参考禁止启用", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      original = await a.req("/api/resources/costs/F1");
    const correction = await a.cmd("cost.create", null, {
      name: "费用更正",
      nature: "实际",
      category: "电费及服务费",
      amount: 130,
      included: "已含服务费",
      evidence: "SIM更正依据",
      replacement_id: original.id,
      expected_version: original.version,
    });
    assert.equal(correction.statusCode, 200, correction.message);
    assert.equal(
      f.db.prepare("SELECT status FROM costs WHERE id=?").get(original.id)
        .status,
      "已核验",
    );
    await a.cmd("cost.verify", correction.id, {
      expected_version: 1,
      evidence: "SIM核验",
    });
    assert.equal(
      f.db.prepare("SELECT status FROM costs WHERE id=?").get(original.id)
        .status,
      "已替代",
    );
    assert.equal(
      f.db
        .prepare("SELECT amount_cents FROM costs WHERE id=?")
        .get(correction.id).amount_cents,
      13000,
    );
    assert.equal(
      (
        await a.cmd("resource.edit", "P-001", {
          resource: "parameters",
          expected_version: 1,
          enabled: true,
        })
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});
test("队列/规划/能源结果持久化且不冒充实际投运", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    assert.equal(
      (
        await a.cmd("planning.run", null, {
          candidate_id: "PL2",
          daily_quantity: 1200,
          distance_km: 20,
        })
      ).statusCode,
      422,
    );
    const plan = await a.cmd("planning.run", null, {
      candidate_id: "PL1",
      daily_quantity: 1200,
      distance_km: 20,
    });
    assert.equal(plan.statusCode, 200);
    assert(plan.vehicles > 0);
    assert.equal(plan.engineering_approved, false);
    const forecast = await a.cmd("forecast.load");
    assert.equal(forecast.statusCode, 200);
    assert.equal(forecast.accuracy_validated, false);
    const energy = await a.cmd("energy.compare");
    assert.equal(energy.storage_control, false);
    const before = f.db.prepare("SELECT count(*) n FROM tasks").get().n;
    await a.cmd("alert.accept", "A1", {
      expected_version: 1,
      evidence: "SIM核实",
    });
    await a.cmd("alert.resolve", "A1", {
      expected_version: 2,
      evidence: "SIM复测",
    });
    await a.cmd("alert.close", "A1", {
      expected_version: 3,
      evidence: "SIM关闭",
    });
    assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, before);
  } finally {
    await f.close();
  }
});

test("已登录请求的CSRF、跨源与SQL字段白名单", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    for (const headers of [
      { Cookie: a.cookie },
      {
        Cookie: a.cookie,
        "X-CSRF-Token": a.csrf,
        Origin: "https://untrusted.example",
      },
    ]) {
      const r = await fetch(f.base + "/api/commands", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          type: "order.confirm",
          id: "O024",
          payload: { expected_version: 1 },
        }),
      });
      assert.equal(r.status, 403);
    }
    assert.equal(
      (
        await a.req(
          "/api/resources/orders?sort=amount_cents%3BDROP%20TABLE%20orders&pageSize=10000",
        )
      ).statusCode,
      200,
    );
    assert.equal((await a.req("/api/resources/unknown")).statusCode, 404);
    assert(
      f.db
        .prepare(
          "SELECT count(*) n FROM audit WHERE json_extract(data,'$.result')='REJECTED'",
        )
        .get().n >= 2,
    );
  } finally {
    await f.close();
  }
});

test("方案确认识别资源版本变化，待派发量可重算但不超额", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    const input = {
      order_id: "O013",
      vehicle_ids: ["V001", "V002"],
      station_id: "S001",
      soc: 74,
      reserve_soc: 20,
      use_reference: true,
    };
    const run = await a.cmd("simulation.run", null, input);
    await a.cmd("resource.edit", "V001", {
      resource: "vehicles",
      expected_version: 1,
      name: "仿真车型资料更新",
      status: "可用",
      evidence: "SIM新资料",
    });
    assert.equal(
      (
        await a.cmd("simulation.confirm", run.id, {
          expected_version: 1,
          candidate_id: "A",
        })
      ).statusCode,
      409,
    );
    const fresh = await a.cmd("simulation.run", null, input);
    assert.equal(
      (
        await a.cmd("simulation.confirm", fresh.id, {
          expected_version: 1,
          candidate_id: "A",
        })
      ).statusCode,
      200,
    );
    const next = await a.cmd("simulation.run", null, input);
    await a.cmd("simulation.confirm", next.id, {
      expected_version: 1,
      candidate_id: "A",
    });
    assert(
      f.db
        .prepare("SELECT status FROM tasks WHERE simulation_id=?")
        .all(fresh.id)
        .every((t) => t.status === "已取消"),
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT sum(quantity_kg) n FROM tasks WHERE order_id='O013' AND status='待派发'",
        )
        .get().n,
      300000,
    );
  } finally {
    await f.close();
  }
});

test("拒单重派不重复有效补能计划，终止余量保留已交付量", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      d = await session(f, "driver01"),
      run = await a.cmd("simulation.run", null, {
        order_id: "O013",
        vehicle_ids: ["V001"],
        station_id: "S001",
        soc: 50,
        reserve_soc: 20,
        use_reference: true,
      });
    await a.cmd("simulation.confirm", run.id, {
      expected_version: 1,
      candidate_id: "A",
    });
    let t = f.db
      .prepare("SELECT * FROM tasks WHERE simulation_id=?")
      .get(run.id);
    await a.cmd("dispatch.batch", null, {
      items: [{ id: t.id, expected_version: t.version }],
    });
    t = await d.req("/api/resources/tasks/" + t.id);
    await d.cmd("task.reject", t.id, {
      expected_version: t.version,
      reason: "SIM驾驶窗口复核",
    });
    t = await a.req("/api/resources/tasks/" + t.id);
    await a.cmd("dispatch.batch", null, {
      items: [{ id: t.id, expected_version: t.version }],
    });
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) n FROM charging WHERE task_id=? AND status='已确认'",
        )
        .get(t.id).n,
      JSON.parse(
        f.db.prepare("SELECT data FROM tasks WHERE id=?").get(t.id).data,
      ).plan.charging_events.length,
    );
    const current = await a.req("/api/resources/tasks/TA001");
    const ended = await a.cmd("task.terminate", "TA001", {
      expected_version: current.version,
      verified_quantity: 30,
      reason: "SIM余量另行组织",
      evidence: "SIM核验",
    });
    assert.equal(ended.statusCode, 200);
    const remaining = await a.cmd("simulation.run", null, {
      order_id: "O014",
      vehicle_ids: ["V003"],
      station_id: "S001",
      soc: 74,
      reserve_soc: 20,
      use_reference: true,
    });
    assert.equal(remaining.simulation.remaining_quantity_kg, 270000);
    assert.equal((await a.req("/api/summary")).verified_tonnes, 750);
  } finally {
    await f.close();
  }
});

test("作业更正有独立核验，原费用不被自动覆盖", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      old = await a.req("/api/resources/sessions/BN1"),
      before = (await a.req("/api/summary")).actual_energy;
    const correction = await a.cmd("session.correct", old.id, {
      expected_version: old.version,
      correction: "SIM计量校正",
      evidence: "SIM原始与更正凭证",
    });
    assert.equal(correction.statusCode, 200);
    assert.equal(
      f.db.prepare("SELECT quantity_kwh FROM sessions WHERE id=?").get(old.id)
        .quantity_kwh,
      old.quantity_kwh,
    );
    assert.equal(
      (
        await a.cmd("quality.review", correction.id, {
          expected_version: 1,
          quantity_kwh: 140,
          amount: 179.2,
          evidence: "SIM复核计量",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await a.req("/api/summary")).actual_energy,
      before - old.quantity_kwh + 140,
    );
    assert.equal(
      f.db.prepare("SELECT amount_cents FROM costs WHERE id='F1'").get()
        .amount_cents,
      12544,
    );
    assert.equal(
      (
        await a.cmd("quality.review", correction.id, {
          expected_version: 1,
          quantity_kwh: 140,
          amount: 179.2,
          evidence: "重复",
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});

test("仿真接入识别重复、冲突和无效SOC，越权批次整体回滚", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    const item = {
      vehicle_id: "V001",
      event_id: "EXT-1",
      occurred_at: new Date().toISOString(),
      longitude: 107.61,
      latitude: 35.74,
      soc: 73,
      speed_kmh: 25,
    };
    const first = await a.cmd("integration.sync", "INT2", {
      expected_version: 1,
      simulated: true,
      items: [item, { ...item, event_id: "BAD", soc: 101 }],
    });
    assert.equal(first.accepted, 1);
    assert.equal(first.rejected, 1);
    const again = await a.cmd("integration.sync", "INT2", {
      expected_version: 2,
      simulated: true,
      items: [item, { ...item, soc: 72 }],
    });
    assert.equal(again.duplicate, 1);
    assert.equal(again.rejected, 1);
    assert.equal(
      f.db
        .prepare("SELECT count(*) n FROM telemetry WHERE id='INT2:EXT-1'")
        .get().n,
      1,
    );
    const noAccess = await a.cmd("integration.sync", "INT2", {
      expected_version: 3,
      simulated: true,
      items: [
        { ...item, event_id: "ROLLBACK" },
        { ...item, event_id: "SOUTH", vehicle_id: "V015" },
      ],
    });
    assert.equal(noAccess.statusCode, 403);
    assert.equal(
      f.db
        .prepare("SELECT count(*) n FROM telemetry WHERE id='INT2:ROLLBACK'")
        .get().n,
      0,
    );
    assert.equal(
      f.db
        .prepare("SELECT count(*) n FROM telemetry WHERE id='INT2:SOUTH'")
        .get().n,
      0,
    );
  } finally {
    await f.close();
  }
});

test("账号主体与操作授权上限；秘密不回显", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    const created = await a.cmd("user.create", null, {
      username: "scoped-admin",
      name: "北区授权管理员",
      password: "ScopedLocal2026!",
      role: "admin",
      scopes: ["ORG-N"],
      operations: ["read", "user.manage"],
    });
    assert.equal(created.statusCode, 200);
    const response = await fetch(f.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "scoped-admin",
        password: "ScopedLocal2026!",
      }),
    });
    const login = await response.json(),
      cookie = response.headers.get("set-cookie").split(";")[0];
    const users = await fetch(f.base + "/api/resources/users", {
      headers: { Cookie: cookie },
    }).then((r) => r.json());
    assert(!users.items.some((u) => u.id === "U-ADMIN"));
    assert(users.items.every((u) => !u.password_hash));
    const denied = await fetch(f.base + "/api/commands", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": login.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        type: "user.create",
        payload: {
          username: "outside",
          name: "越权",
          password: "ScopedLocal2026!",
          role: "admin",
          scopes: ["ORG-S"],
          operations: ["read"],
        },
      }),
    });
    assert.equal(denied.status, 422);
    assert.equal(
      (
        await a.cmd("user.update", "U-ADMIN", {
          expected_version: 1,
          enabled: false,
        })
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});

test("能源调整与候选参数形成新记录，历史版本保持可追溯", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin");
    const first = await a.cmd("energy.compare");
    await a.cmd("energy.confirm", first.id, {
      expected_version: 1,
      evidence: "SIM边界复核",
    });
    const adjusted = await a.cmd("energy.adjust", first.id, {
      expected_version: 2,
      reason: "SIM时窗调整",
    });
    assert.notEqual(adjusted.id, first.id);
    assert.equal(
      (await a.req("/api/resources/energy-plans/" + adjusted.id))
        .replacement_id,
      first.id,
    );
    const param = await a.req("/api/resources/parameters/P-001"),
      next = await a.cmd("parameter.draft", param.id, {
        expected_version: param.version,
        candidate: "参考值候选",
        usage_boundary: "仅仿真，不启用生产",
        evidence: "SIM新依据",
      });
    assert.notEqual(next.id, param.id);
    const record = await a.req("/api/resources/parameters/" + next.id);
    assert.equal(record.enabled, false);
    assert.equal(record.production_auto_enabled, false);
    await a.cmd("asset.record", "AS1", {
      expected_version: 1,
      kind: "维保",
      note: "SIM检查容量",
      evidence: "SIM工单",
    });
    assert.equal((await a.req("/api/resources/assets/AS1")).history.length, 1);
  } finally {
    await f.close();
  }
});

test("时序候选确认识别过期计划，全批不改动", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      candidate = await a.cmd("charging.optimize");
    assert.equal(candidate.statusCode, 200, candidate.message);
    const r = await a.req(
      "/api/resources/charging-optimizations/" + candidate.id,
    );
    const plan = await a.req("/api/resources/charging/" + r.changes[0].id);
    await a.cmd("charging.adjust", plan.id, {
      expected_version: plan.version,
      arrival_at: plan.arrival_at,
      reason: "SIM计划复核",
    });
    const before = f.db
      .prepare("SELECT id,arrival_at,version FROM charging ORDER BY id")
      .all();
    assert.equal(
      (
        await a.cmd("charging.apply", candidate.id, {
          expected_version: 1,
          evidence: "SIM时效与电量复核",
        })
      ).statusCode,
      409,
    );
    assert.deepEqual(
      f.db
        .prepare("SELECT id,arrival_at,version FROM charging ORDER BY id")
        .all(),
      before,
    );
  } finally {
    await f.close();
  }
});

test("需求走廊按订单和核验车次聚合；纯充电不套换电备用配比", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      analysis = await a.cmd("planning.analyze", null, {
        start_at: new Date(Date.now() - 40 * 86400000).toISOString(),
        finish_at: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.equal(analysis.statusCode, 200);
    const r = await a.req("/api/resources/od-analysis/" + analysis.id);
    assert.equal(
      r.corridors.reduce((n, x) => n + x.verified_kg, 0),
      720000,
    );
    assert.equal(
      r.corridors.reduce((n, x) => n + x.verified_trips, 0),
      24,
    );
    const plan = await a.cmd("planning.run", null, {
      candidate_id: "PL1",
      daily_quantity: 1200,
      distance_km: 20,
    });
    assert.equal(plan.spare_batteries, 0);
    assert.equal(plan.batteries, plan.vehicles);
    assert(plan.devices > 0);
    assert.equal(plan.engineering_approved, false);
  } finally {
    await f.close();
  }
});

test("版本预警区分来源过期与SOC风险，重复运行不重复未关闭事件", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      rule = await a.cmd("rule.create", null, {
        name: "SIM SOC关注",
        kind: "SOC关注",
        threshold: 80,
        max_age_minutes: 15,
        evidence: "SIM关注阈值，不是实际安全边界",
      });
    assert.equal(rule.statusCode, 200);
    const first = await a.cmd("rule.run", rule.id, { expected_version: 1 });
    assert(first.generated > 0);
    assert.equal(
      (await a.cmd("rule.run", rule.id, { expected_version: 1 })).generated,
      0,
    );
    const active = f.db
      .prepare("SELECT data FROM alerts WHERE json_extract(data,'$.rule_id')=?")
      .all(rule.id)
      .map((x) => JSON.parse(x.data));
    assert(
      active.every(
        (x) => x.kind === "参考风险" && x.production_fault_confirmed === false,
      ),
    );
    f.db
      .prepare(
        "UPDATE telemetry SET occurred_at='2026-01-01T00:00:00Z' WHERE vehicle_id='V001'",
      )
      .run();
    const fresh = await a.cmd("rule.create", null, {
      name: "SIM来源核查",
      kind: "SOC关注",
      threshold: 20,
      max_age_minutes: 15,
      evidence: "SIM来源时效规则",
    });
    await a.cmd("rule.run", fresh.id, { expected_version: 1 });
    assert(
      f.db
        .prepare(
          "SELECT 1 FROM alerts WHERE json_extract(data,'$.rule_id')=? AND json_extract(data,'$.kind')='数据质量' AND vehicle_id='V001'",
        )
        .get(fresh.id),
    );
    const trace = await a.req("/api/telemetry/V001");
    assert(trace.items.length > 0);
    assert(Array.isArray(trace.events));
    assert.equal(trace.real_trajectory, false);
  } finally {
    await f.close();
  }
});

test("合作实施只关联已核验资产，计划确认不创建车辆或投运量", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      before = f.db.prepare("SELECT count(*) n FROM vehicles").get().n;
    await a.cmd("replacement.confirm", "RP1", {
      expected_version: 1,
      evidence: "SIM合作依据",
    });
    assert.equal(
      (
        await a.cmd("replacement.implement", "RP1", {
          expected_version: 2,
          asset_ids: ["AS12"],
          evidence: "SIM实施凭证",
        })
      ).statusCode,
      422,
    );
    const done = await a.cmd("replacement.implement", "RP1", {
      expected_version: 2,
      asset_ids: ["AS7", "AS8"],
      evidence: "SIM已核验投运资产",
    });
    assert.equal(done.statusCode, 200);
    assert.equal(
      (await a.req("/api/resources/replacements/RP1")).implemented_count,
      2,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM vehicles").get().n,
      before,
    );
  } finally {
    await f.close();
  }
});

test("未执行改派重新核验电量和时效，旧补能保留取消历史", async () => {
  const f = await fixture();
  try {
    const a = await session(f, "admin"),
      task = await a.req("/api/resources/tasks/TA002");
    const result = await a.cmd("task.reassign", task.id, {
      expected_version: task.version,
      vehicle_id: "V003",
      driver_id: "D003",
      reason: "SIM运力交接",
    });
    assert.equal(result.statusCode, 200, result.message);
    const next = await a.req("/api/resources/tasks/TA002");
    assert.equal(next.vehicle_id, "V003");
    assert.equal(next.previous_assignment.vehicle_id, "V005");
    assert.equal(next.reassignment_snapshot.model, "REFERENCE-REASSIGNMENT-V2");
    assert.equal(next.plan.trips, 2);
    assert.equal(
      f.db.prepare("SELECT status FROM charging WHERE id='C-ACT2'").get()
        .status,
      "已取消",
    );
    assert.equal(next.reported_kg, 0);
  } finally {
    await f.close();
  }
});
