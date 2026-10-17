import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
import { energyDay } from "../server/energy-workspace.mjs";
import { insert, unpack } from "../server/db.mjs";
const past = (m) => new Date(Date.now() - m * 60000).toISOString();
const future = (m) => new Date(Date.now() + m * 60000).toISOString();
const visit = (f, id) =>
  ok(
    f.db
      ? {
          statusCode: 200,
          ...unpack(f.db.prepare("SELECT * FROM records WHERE id=?").get(id)),
        }
      : null,
  );
async function arrive(f, plan = "C-ACT1", actor = f.admin) {
  return ok(
    await actor.cmd(
      actor === f.admin ? "station.arrive" : "driver.arrive",
      null,
      {
        plan_id: plan,
        expected_version: 1,
        arrived_at: past(20),
        evidence: "隔离仿真到站凭证",
      },
    ),
  );
}
async function start(f, id, device = "S001-G1") {
  const v = visit(f, id),
    d = ok(await f.get("devices", device));
  return f.cmd("station.start", id, {
    expected_version: v.version,
    device_id: device,
    device_version: d.version,
    start_at: past(15),
    release_at: future(25),
  });
}
async function finish(f, id, extra = {}) {
  const v = visit(f, id);
  return f.cmd("station.finish", id, {
    expected_version: v.version,
    finish_at: past(1),
    quantity_kwh: 132,
    amount: 168.96,
    included: "电费及服务费",
    evidence: "仿真计量凭证",
    ...extra,
  });
}

test("CR18 complete scoped query joins task/order/vehicle, >100 pagination and explicit dates", async () => {
  const f = await fixture();
  try {
    const first = ok(await f.admin.req("/api/energy-workspace/charging"));
    assert.equal(first.total, 4);
    assert(
      first.items.every(
        (r) => r.task_code && r.order_code && r.driver_name && r.station_name,
      ),
    );
    for (const q of ["RW-当前-001", "BN-当前-1", "甘M·仿004", "DD-2610-0014"])
      assert.equal(
        ok(
          await f.admin.req(
            "/api/energy-workspace/charging?q=" + encodeURIComponent(q),
          ),
        ).total,
        1,
      );
    const row = f.db.prepare("SELECT * FROM charging WHERE id='C-ACT1'").get();
    for (let i = 0; i < 105; i++)
      insert(f.db, "charging", {
        ...row,
        id: "CR18-" + i,
        code: "CR18-P-" + i,
      });
    const page = ok(
      await f.admin.req("/api/energy-workspace/charging?page=11&pageSize=10"),
    );
    assert.equal(page.total, 109);
    assert.equal(page.items.length, 9);
    assert.equal(page.counts.all, 109);
    assert.equal(
      ok(await f.admin.req("/api/energy-workspace/charging?date=2001-01-01"))
        .total,
      0,
    );
    assert.equal(
      (await f.admin.req("/api/energy-workspace/charging?date=2026-02-30"))
        .statusCode,
      422,
    );
    assert.equal(
      (await f.admin.req("/api/energy-workspace/charging?stage=bad"))
        .statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});
test("CR18 driver arrival, station start/finish and verification form one factual chain with no task completion", async () => {
  const f = await fixture();
  try {
    const d = await f.login("driver04"),
      r = await arrive(f, "C-ACT1", d),
      key = "CR18-arrival-idempotent";
    assert.equal((await arriveDuplicate()).statusCode, 409);
    function arriveDuplicate() {
      return d.cmd(
        "driver.arrive",
        null,
        {
          plan_id: "C-ACT1",
          expected_version: 1,
          arrived_at: past(20),
          evidence: "重复到站",
        },
        key,
      );
    }
    let rows = ok(
      await f.admin.req("/api/energy-workspace/station?station=S001"),
    );
    assert.equal(rows.counts["待服务"], 1);
    assert.equal(rows.items.find((x) => x.visit?.id === r.id).start_at, null);
    assert.equal(rows.items.find((x) => x.visit?.id === r.id).device_id, null);
    ok(await start(f, r.id));
    assert.equal(ok(await f.get("devices", "S001-G1")).status, "占用");
    const plan = ok(await f.get("charging", "C-ACT1"));
    assert.equal(
      (
        await f.cmd("charging.cancel", plan.id, {
          expected_version: plan.version,
          reason: "有现场责任不能取消",
        })
      ).statusCode,
      409,
    );
    const ended = ok(await finish(f, r.id));
    assert.equal(ok(await f.get("devices", "S001-G1")).status, "空闲");
    assert.equal(visit(f, r.id).status, "待核验");
    assert.equal((await finish(f, r.id)).statusCode, 422);
    const session = ok(await f.get("sessions", ended.session_id));
    assert.equal(session.task_id, "TA001");
    assert.equal(session.plan_id, "C-ACT1");
    assert.equal(session.visit_id, r.id);
    assert.equal(session.quantity_kwh, 132);
    assert.equal(session.status, "待核验");
    const beforeTask = ok(await f.get("tasks", "TA001"));
    ok(
      await f.cmd("session.verify", session.id, {
        expected_version: session.version,
        evidence: "核验凭证",
      }),
    );
    assert.equal(visit(f, r.id).status, "已完成");
    assert.equal(ok(await f.get("tasks", "TA001")).status, beforeTask.status);
    const driverView = ok(
      await d.req(
        "/api/energy-workspace/charging?task=TA001&driver_stage=ended",
      ),
    );
    assert.equal(driverView.total, 1);
    assert.equal(driverView.items[0].sessions[0].amount_cents, undefined);
    assert.equal(driverView.items[0].visit.amount_cents, undefined);
  } finally {
    await f.close();
  }
});
test("CR18 future/time/device/vehicle conflicts reject atomically; one idempotent arrival", async () => {
  const f = await fixture();
  try {
    const body = {
      plan_id: "C-ACT1",
      expected_version: 1,
      arrived_at: past(20),
      evidence: "仿真到站",
    };
    const r = ok(await f.cmd("station.arrive", null, body, "arrival-once"));
    assert.equal(
      ok(await f.cmd("station.arrive", null, body, "arrival-once")).id,
      r.id,
    );
    assert.equal(
      (await f.cmd("station.arrive", null, { ...body, arrived_at: future(20) }))
        .statusCode,
      409,
    );
    const v = visit(f, r.id);
    assert.equal(
      (
        await f.cmd("station.start", r.id, {
          expected_version: v.version,
          device_id: "S001-G2",
          device_version: 1,
          start_at: past(15),
          release_at: future(30),
        })
      ).statusCode,
      409,
    );
    assert.equal(visit(f, r.id).status, "待服务");
    assert.equal(ok(await f.get("devices", "S001-G1")).status, "空闲");
    assert.equal(
      (
        await f.cmd("station.start", r.id, {
          expected_version: v.version,
          device_id: "S001-G1",
          device_version: 0,
          start_at: past(15),
          release_at: future(30),
        })
      ).statusCode,
      409,
    );
    ok(await start(f, r.id));
    const task = ok(await f.get("tasks", "TA001"));
    assert.equal(
      (
        await f.cmd("task.schedule", task.id, {
          expected_version: task.version,
          start_at: past(60),
          finish_at: future(60),
          reason: "有在站责任",
        })
      ).statusCode,
      409,
    );
    const failed = await finish(f, r.id, { quantity_kwh: -1 });
    assert.equal(failed.statusCode, 422);
    assert.equal(visit(f, r.id).status, "补能中");
    assert.equal(ok(await f.get("devices", "S001-G1")).status, "占用");
  } finally {
    await f.close();
  }
});
test("CR18 role/scope/CSRF enforcement and no owner leakage in stations, analysis and arrivals", async () => {
  const f = await fixture();
  try {
    const d4 = await f.login("driver04"),
      d5 = await f.login("driver05"),
      north = await f.login("north");
    assert.equal(
      (
        await d5.cmd("driver.arrive", null, {
          plan_id: "C-ACT1",
          expected_version: 1,
          arrived_at: past(5),
          evidence: "越权",
        })
      ).statusCode,
      404,
    );
    for (const url of [
      "/api/energy-workspace/station",
      "/api/energy-workspace/analysis?station=S001&date=2026-10-16",
      "/api/energy-workspace/options",
    ])
      assert.equal((await d4.req(url)).statusCode, 403);
    assert.equal(
      (
        await north.cmd("station.arrive", null, {
          plan_id: "C-ACT1",
          expected_version: 1,
          arrived_at: past(5),
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await north.req(
          "/api/energy-workspace/analysis?station=S003&date=2026-10-16",
        )
      ).statusCode,
      404,
    );
    const options = ok(await north.req("/api/energy-workspace/options"));
    assert(options.stations.every((s) => s.owner_id === "ORG-N"));
    const response = await fetch(f.base + "/api/commands", {
      method: "POST",
      headers: {
        Cookie: f.admin.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": "missing-csrf",
      },
      body: JSON.stringify({ type: "station.arrive", payload: {} }),
    });
    assert.equal(response.status, 403);
  } finally {
    await f.close();
  }
});
test("CR18 scoped optimization excludes unrelated/started/completed plans and commits only selected scope", async () => {
  const f = await fixture();
  try {
    const selected = ok(
      await f.cmd("charging.optimize-scoped", null, {
        station: "S001",
        q: "BN-当前-3",
      }),
    );
    const rec = ok(await f.get("charging-optimizations", selected.id));
    assert(rec.alternatives.length);
    for (const alt of rec.alternatives)
      assert(alt.changes.every((c) => c.id === "C-ACT3"));
    const r = await arrive(f);
    ok(await start(f, r.id));
    const no = await f.cmd("charging.optimize-scoped", null, {
      q: "BN-当前-1",
    });
    assert.equal(no.statusCode, 422);
  } finally {
    await f.close();
  }
});
test("CR18 energy dates, independent meters, missing samples, known costs and real linked risks", async () => {
  const f = await fixture();
  try {
    const sample = unpack(
        f.db
          .prepare("SELECT * FROM records WHERE resource='loads' LIMIT 1")
          .get(),
      ),
      date = energyDay(sample.created_at);
    const analysis = ok(
      await f.admin.req(
        "/api/energy-workspace/analysis?station=S001&date=" + date,
      ),
    );
    assert.equal(analysis.series.length, 24);
    assert.equal(analysis.sample_count, 23);
    assert.equal(analysis.series[15].actual_kw, null);
    assert.equal(
      analysis.energy_kwh,
      analysis.series.reduce((s, r) => s + (r.actual_kw ?? 0), 0),
    );
    const no = ok(
      await f.admin.req(
        "/api/energy-workspace/analysis?station=S001&date=2001-01-01",
      ),
    );
    assert.equal(no.energy_kwh, null);
    assert.equal(no.known_cost_cents, null);
    assert.equal(no.sample_count, 0);
    const device = ok(
      await f.admin.req(
        "/api/energy-workspace/analysis?station=S001&date=" +
          date +
          "&device=S001-G3",
      ),
    );
    assert.equal(device.energy_kwh, null);
    assert.equal(
      (
        await f.admin.req(
          "/api/energy-workspace/analysis?station=S001&date=" +
            date +
            "&device=S002-G1",
        )
      ).statusCode,
      422,
    );
    const r = ok(
      await f.cmd("energy.compare", null, { station_id: "S001", date }),
    );
    const plan = ok(await f.get("energy-plans", r.id));
    assert.equal(plan.owner_id, "ORG-N");
    assert.equal(plan.date, date);
    assert.equal(plan.station_id, "S001");
    assert.equal(
      (
        await f.cmd("energy.compare", null, {
          station_id: "S001",
          date: "2001-01-01",
        })
      ).statusCode,
      422,
    );
    const today = energyDay(new Date());
    f.db.prepare("UPDATE stations SET power_kw=10 WHERE id='S001'").run();
    const peakPlan = f.db
      .prepare("SELECT * FROM charging WHERE id='C-ACT1'")
      .get();
    insert(f.db, "charging", {
      ...peakPlan,
      id: "CR18-PEAK",
      code: "CR18-PEAK",
    });
    const risk = ok(
      await f.admin.req(
        "/api/energy-workspace/analysis?station=S001&date=" + today,
      ),
    );
    assert(risk.risks.length > 0);
    assert(
      risk.affected.every(
        (p) => p.task_id && p.order_id && p.station_id === "S001",
      ),
    );
  } finally {
    await f.close();
  }
});
test("CR18 manual plan supports active transport vehicles, explicit adjustments, and temporary visits cancel safely", async () => {
  const f = await fixture();
  try {
    f.db.prepare("UPDATE vehicles SET status='执行中' WHERE id='V004'").run();
    const p = ok(
      await f.cmd("charging.create", null, {
        vehicle_id: "V004",
        task_id: "TA001",
        station_id: "S001",
        arrival_at: future(30),
        quantity_kwh: 100,
      }),
    );
    const row = ok(await f.get("charging", p.id));
    const changed = ok(
      await f.cmd("charging.review", p.id, {
        expected_version: row.version,
        station_id: "S001",
        arrival_at: future(45),
        quantity_kwh: 110,
        reason: "重新核对运输窗口",
      }),
    );
    assert.equal(ok(await f.get("charging", changed.id)).status, "待确认");
    const a = ok(
      await f.cmd("station.arrive", null, {
        vehicle_id: "V001",
        station_id: "S001",
        arrived_at: past(5),
        evidence: "无任务临时补能",
      }),
    );
    const v = visit(f, a.id);
    assert.equal(v.plan_id, null);
    ok(
      await f.cmd("station.cancel", v.id, {
        expected_version: v.version,
        reason: "司机离站，尚未服务",
      }),
    );
    assert.equal(visit(f, v.id).status, "已取消");
  } finally {
    await f.close();
  }
});
test("CR18 temporary driver feedback and station device alerts retain correct ownership and object links", async () => {
  const f = await fixture();
  try {
    const p = ok(
      await f.cmd("charging.create", null, {
        vehicle_id: "V001",
        station_id: "S001",
        arrival_at: future(30),
        quantity_kwh: 100,
      }),
    );
    ok(await f.cmd("charging.confirm", p.id, { expected_version: 1 }));
    const driver = await f.login("driver01"),
      other = await f.login("driver02");
    const feedback = ok(
      await driver.cmd("driver.energy-alert", null, {
        plan_id: p.id,
        reason: "临时补能排队较长",
        evidence: "现场仿真反馈",
      }),
    );
    const alert = ok(await driver.req("/api/resources/alerts/" + feedback.id));
    assert.equal(alert.plan_id, p.id);
    assert.equal(alert.vehicle_id, "V001");
    assert.equal(alert.task_id, null);
    assert.equal(
      (await other.req("/api/resources/alerts/" + feedback.id)).statusCode,
      404,
    );
    const device = ok(
      await f.cmd("station.alert", null, {
        device_id: "S003-G1",
        reason: "设备状态待核查",
        evidence: "仿真现场依据",
      }),
    );
    const r = ok(await f.get("alerts", device.id));
    assert.equal(r.owner_id, "ORG-S");
    assert.equal(r.device_id, "S003-G1");
    assert.equal(r.station_id, "S003");
  } finally {
    await f.close();
  }
});
test("CR18 swap workflow requires battery proofs and verifies inventory without completing a transport task", async () => {
  const f = await fixture();
  try {
    const arrived = ok(
      await f.cmd("station.arrive", null, {
        vehicle_id: "V001",
        station_id: "S002",
        arrived_at: past(20),
        evidence: "临时换电到站",
      }),
    );
    ok(await start(f, arrived.id, "S002-G1"));
    assert.equal((await finish(f, arrived.id)).statusCode, 422);
    assert.equal(visit(f, arrived.id).status, "补能中");
    const ended = ok(
        await finish(f, arrived.id, {
          incoming_battery: "AS1",
          outgoing_battery: "AS4",
        }),
      ),
      s = ok(await f.get("sessions", ended.session_id));
    ok(
      await f.cmd("session.verify", s.id, {
        expected_version: s.version,
        evidence: "核对换入换出及计量凭证",
      }),
    );
    assert.equal(ok(await f.get("assets", "AS1")).vehicle_id, "V001");
    assert.equal(ok(await f.get("assets", "AS4")).station_id, "S002");
    assert.equal(visit(f, arrived.id).status, "已完成");
  } finally {
    await f.close();
  }
});
