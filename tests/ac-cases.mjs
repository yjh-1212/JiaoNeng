import assert from "node:assert/strict";
import { ok, scheme, dispatch, delivered } from "./helpers.mjs";
import { insert, now } from "../server/db.mjs";
const day = (h = 6) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const orderBody = {
  name: "AC短倒单",
  demand_id: "DM1",
  quantity: 100,
  cargo: "原煤",
  origin: "北区装载场",
  destination: "煤炭集运中心",
  distance_km: 14,
  start_at: day(6),
  finish_at: day(22),
};
const command = (type, id, payload = {}, resource) => ({
  type,
  id,
  payload,
  resource,
});
const bad = (r, status = 422) => assert.equal(r.statusCode, status, r.message);
const primitives = {};
export const normal = {
  1: async (f) => {
    const d = ok(
      await f.cmd("demand.create", null, {
        name: "AC需求",
        quantity: 600,
        cargo: "原煤",
        origin: "装载场",
        destination: "集运中心",
      }),
    );
    ok(
      await f.cmd("demand.edit", d.id, {
        expected_version: 1,
        name: "AC需求修订",
        quantity: 700,
        cargo: "精煤",
        origin: "装载场",
        destination: "集运中心",
      }),
    );
    ok(await f.cmd("demand.confirm", d.id, { expected_version: 2 }));
    const o = ok(
      await f.cmd("order.create", null, { ...orderBody, demand_id: d.id }),
    );
    ok(await f.cmd("order.confirm", o.id, { expected_version: 1 }));
    const r = await f.get("demands", d.id);
    assert.equal(r.allocated_kg, 100000);
    assert.equal(r.history.length, 1);
    f.state = { d: d.id, o: o.id };
    return command(
      "demand.edit",
      d.id,
      {
        name: r.name,
        quantity: 700,
        cargo: "精煤",
        origin: "装载场",
        destination: "集运中心",
      },
      "demands",
    );
  },
  2: async (f) => {
    const r = ok(await f.cmd("order.create", null, orderBody));
    ok(
      await f.cmd("order.edit", r.id, {
        ...orderBody,
        name: "AC修订草稿",
        quantity: 90,
        expected_version: 1,
      }),
    );
    const copy = ok(await f.cmd("order.copy", r.id, {}));
    assert.equal((await f.get("orders", copy.id)).status, "草稿");
    ok(await f.cmd("order.confirm", r.id, { expected_version: 2 }));
    ok(
      await f.cmd("order.cancel", r.id, {
        expected_version: 3,
        reason: "AC未履约取消",
      }),
    );
    assert.equal((await f.get("orders", r.id)).cancelled_kg, 90000);
    assert(
      f.db.prepare("SELECT count(*) n FROM audit WHERE entity_id=?").get(r.id)
        .n >= 3,
    );
    return command("order.copy", copy.id, {}, "orders");
  },
  3: async (f) => {
    const s = await scheme(f);
    const c = s.run.simulation.candidates[0];
    assert(c.feasible);
    assert(
      c.assignments.every(
        (a) =>
          a.nodes.length &&
          a.nodes.every((n) => new Date(n.finish_at) >= new Date(n.start_at)),
      ),
    );
    assert(
      c.assignments.every((a) =>
        a.nodes
          .filter((n) => n.soc_after != null)
          .every((n) => n.soc_after >= 20 - 0.001),
      ),
    );
    f.state = s;
    return command("simulation.run", null, {
      order_id: "O013",
      vehicle_ids: ["V001"],
      station_id: "S001",
      soc: 74,
      reserve_soc: 20,
      use_reference: true,
    });
  },
  4: async (f) => {
    const s = await scheme(f);
    assert.equal(s.run.simulation.candidates.length, 2);
    for (const c of s.run.simulation.candidates)
      for (const k of [
        "trips",
        "energy_kwh",
        "distance_km",
        "known_cost_cents",
        "wait_minutes",
      ])
        assert(Number.isFinite(c[k]));
    const fresh = ok(
      await f.cmd("simulation.run", null, {
        order_id: "O013",
        vehicle_ids: ["V001"],
        station_id: "S001",
        soc: 79,
        reserve_soc: 20,
        use_reference: true,
      }),
    );
    assert.notEqual(s.run.id, fresh.id);
    assert.equal((await f.get("simulations", s.run.id)).inputs.soc, 74);
    f.state = { fresh };
    return command(
      "simulation.confirm",
      fresh.id,
      { candidate_id: "A" },
      "simulations",
    );
  },
  5: async (f) => {
    const s = await dispatch(f);
    assert(
      s.tasks.every(
        (t) => t.status === "待接收" && t.notification === "已投递",
      ),
    );
    assert(
      f.db
        .prepare("SELECT count(*) n FROM charging WHERE task_id=?")
        .get(s.tasks[0].id).n > 0,
    );
    f.state = s;
    return command("dispatch.batch", null, {
      items: s.tasks.map((t) => ({ id: t.id, expected_version: t.version })),
    });
  },
  6: async (f) => {
    ok(
      await f.cmd("resource.edit", "V001", {
        resource: "vehicles",
        expected_version: 1,
        name: "AC350度车辆",
        status: "可用",
        capacity_kwh: 350,
        payload_tonnes: 30,
        energy_per_km: 1.58,
        compatibility: "QY-SWAP-A（仿真适配）",
        available_window: "06:00—22:00",
        evidence: "AC资料",
      }),
    );
    ok(
      await f.cmd("resource.edit", "D001", {
        resource: "drivers",
        expected_version: 1,
        name: "AC司机",
        status: "可用",
        license: "A2",
        available_window: "06:00—20:00",
        evidence: "AC排班",
      }),
    );
    assert.equal((await f.get("vehicles", "V001")).payload_kg, 30000);
    assert.equal(
      (await f.get("drivers", "D001")).available_window,
      "06:00—20:00",
    );
    return command(
      "resource.edit",
      "V001",
      { resource: "vehicles", name: "AC车辆", status: "可用", evidence: "AC" },
      "vehicles",
    );
  },
  7: async (f) => {
    const s = await scheme(f),
      t = s.tasks[0];
    ok(
      await f.cmd("task.schedule", t.id, {
        expected_version: t.version,
        start_at: day(7),
        finish_at: day(20),
        reason: "AC发车调整",
      }),
    );
    const r = await f.get("tasks", t.id);
    assert(r.requires_resimulation);
    assert(r.plan.nodes.some((n) => n.kind === "空载返程"));
    f.state = { t: r };
    return command(
      "task.schedule",
      t.id,
      { start_at: day(8), finish_at: day(20), reason: "AC调整" },
      "tasks",
    );
  },
  8: async (f) => {
    const s = await dispatch(f),
      d = await f.login("driver01");
    ok(
      await d.cmd("task.accept", s.tasks[0].id, {
        expected_version: s.tasks[0].version,
      }),
    );
    const other = await f.login("driver02");
    ok(
      await other.cmd("task.reject", s.tasks[1].id, {
        expected_version: s.tasks[1].version,
        reason: "AC拒单留痕",
      }),
    );
    assert.equal((await f.get("tasks", s.tasks[1].id)).status, "待派发");
    assert(
      (await d.req("/api/resources/tasks")).items.every(
        (t) => t.driver_id === "D001",
      ),
    );
    f.state = { t: await f.get("tasks", s.tasks[0].id) };
    return command("task.accept", s.tasks[0].id, {}, "tasks");
  },
  9: async (f) => {
    const d = await delivered(f),
      t = await f.get("tasks", d.id);
    assert.equal(t.reported_kg, 30000);
    assert.equal(t.verified_kg, 0);
    const events = f.db
      .prepare("SELECT * FROM events WHERE task_id=?")
      .all(d.id);
    assert.equal(events.length, 3);
    assert(events.every((e) => e.occurred_at && e.received_at));
    f.state = d;
    return command("trip.create", d.id, {}, "tasks");
  },
  10: async (f) => {
    const d = await delivered(f);
    let t = await f.get("tasks", d.id);
    ok(
      await d.driver.cmd("task.submit", t.id, {
        expected_version: t.version,
        evidence: "AC完工",
        remaining_reason: "余量重新组织",
      }),
    );
    t = await f.get("tasks", t.id);
    ok(
      await f.cmd("task.return", t.id, {
        expected_version: t.version,
        reason: "AC补充签收",
      }),
    );
    t = await f.get("tasks", t.id);
    ok(
      await d.driver.cmd("task.submit", t.id, {
        expected_version: t.version,
        evidence: "AC补充后完工",
        remaining_reason: "余量另行组织",
      }),
    );
    t = await f.get("tasks", t.id);
    ok(
      await f.cmd("task.verify", t.id, {
        expected_version: t.version,
        verified_quantity: 30,
        evidence: "AC核验",
      }),
    );
    t = await f.get("tasks", t.id);
    assert.equal(t.verified_kg, 30000);
    assert.equal(t.submission, 2);
    f.state = d;
    return command(
      "task.verify",
      t.id,
      { verified_quantity: 30, evidence: "AC" },
      "tasks",
    );
  },
  11: async (f) => {
    const r = ok(
      await f.cmd("resource.create", null, {
        resource: "stations",
        name: "AC仿真站",
        code: "AC-ST",
        mode: "充电",
        power_kw: 480,
        longitude: 107.6,
        latitude: 35.75,
        compatibility: "QY-SWAP-A（仿真适配）",
        available_window: "06:00—22:00",
        evidence: "AC场站",
      }),
    );
    const st = await f.get("stations", r.id);
    assert.equal(st.status, "待核实");
    assert.equal(st.longitude, 107.6);
    f.state = { station: r.id };
    return command(
      "resource.edit",
      r.id,
      { resource: "stations", name: st.name, status: "运营中", evidence: "AC" },
      "stations",
    );
  },
  12: async (f) => {
    ok(
      await f.cmd("resource.edit", "S001-G3", {
        resource: "devices",
        expected_version: 1,
        name: "工位3",
        status: "空闲",
        connection: "在线",
        evidence: "AC人工现场核查",
      }),
    );
    const d = await f.get("devices", "S001-G3");
    assert(d.manual_override && d.source_time);
    assert.equal(d.previous_source_values.connection, "离线");
    return command(
      "resource.edit",
      d.id,
      {
        resource: "devices",
        name: d.name,
        status: "空闲",
        connection: "在线",
        evidence: "AC",
      },
      "devices",
    );
  },
  13: async (f) => {
    const r = ok(
      await f.cmd("charging.create", null, {
        vehicle_id: "V001",
        station_id: "S001",
        arrival_at: day(10),
        quantity_kwh: 100,
      }),
    );
    ok(await f.cmd("charging.confirm", r.id, { expected_version: 1 }));
    ok(
      await f.cmd("charging.adjust", r.id, {
        expected_version: 2,
        arrival_at: day(11),
        reason: "AC到站调整",
      }),
    );
    assert.equal((await f.get("charging", r.id)).arrival_at, day(11));
    f.state = { plan: r.id };
    return command(
      "charging.adjust",
      r.id,
      { arrival_at: day(12), reason: "AC" },
      "charging",
    );
  },
  14: async (f) => {
    const r = ok(await f.cmd("forecast.queue", null, { use_reference: true }));
    assert(r.items.length > 0);
    assert(
      r.items.every(
        (p) => p.start_at && p.finish_at && p.wait_minutes >= 0 && p.device_id,
      ),
    );
    f.state = { forecast: r.id };
    return command("forecast.queue", null, { use_reference: true });
  },
  15: async (f) => {
    const r = ok(await f.cmd("charging.optimize"));
    const data = await f.get("charging-optimizations", r.id);
    assert(data.changes.length);
    assert(data.alternatives.length === 2);
    assert(data.alternatives.every((c) => Number.isFinite(c.known_cost_cents)));
    ok(
      await f.cmd("charging.apply", r.id, {
        expected_version: 1,
        evidence: "AC时效及SOC参考复核",
      }),
    );
    assert.equal(
      (await f.get("charging-optimizations", r.id)).status,
      "已确认调整",
    );
    f.state = { optimization: r.id };
    return command("charging.optimize");
  },
  16: async (f) => {
    const body = {
        vehicle_id: "V001",
        station_id: "S002",
        device_id: "S002-G1",
        driver_id: "D001",
        quantity_kwh: 90,
        amount: 115.2,
        included: "电费及服务费",
        start_at: day(10),
        finish_at: day(11),
        incoming_battery: "AS1",
        outgoing_battery: "AS4",
        source_event_id: "AC-SWAP-1",
        evidence: "AC换电凭证",
      },
      r = ok(await f.cmd("session.create", null, body));
    ok(
      await f.cmd("session.verify", r.id, {
        expected_version: 1,
        evidence: "AC换电核验",
      }),
    );
    assert.equal((await f.get("assets", "AS1")).vehicle_id, "V001");
    assert.equal((await f.get("assets", "AS4")).station_id, "S002");
    assert.equal((await f.get("stations", "S002")).inventory, 2);
    f.state = { session: r.id, body };
    return command("session.create", null, body);
  },
  17: async (f) => {
    const r = ok(
      await f.cmd("resource.create", null, {
        resource: "energy-resources",
        name: "AC能源边界",
        station_id: "S001",
        kind: "电网",
        note: "AC有效边界",
        evidence: "AC来源",
      }),
    );
    ok(
      await f.cmd("resource.configure", r.id, {
        resource: "energy-resources",
        expected_version: 1,
        station_id: "S001",
        kind: "电网",
        grid_capacity_kw: 720,
        transformer_limit_kw: 600,
        effective_start: day(0),
        effective_end: new Date(Date.now() + 86400000).toISOString(),
        evidence: "AC核验",
      }),
    );
    const er = await f.get("energy-resources", r.id);
    assert.equal(er.transformer_limit_kw, 600);
    assert.equal(er.status, "仿真已核验");
    f.state = { energy: r.id };
    return command(
      "resource.configure",
      r.id,
      { resource: "energy-resources", evidence: "AC" },
      "energy-resources",
    );
  },
  18: async (f) => {
    const loads = ok(await f.admin.req("/api/resources/loads?pageSize=100")),
      devices = ok(
        await f.admin.req(
          "/api/resources/device-loads?pageSize=100&device=S001-G3",
        ),
      );
    assert(loads.items.some((x) => x.actual_kw == null));
    assert(devices.items.every((x) => x.actual_kw == null));
    assert(
      loads.items
        .filter((x) => x.actual_kw != null)
        .every((x) => Number.isFinite(x.actual_kw)),
    );
    return { read: "/api/resources/loads" };
  },
  19: async (f) => {
    const r = ok(await f.cmd("forecast.load"));
    assert.equal(r.kind, "load");
    assert(r.plan_versions.length);
    assert(r.series.some((p) => p.predicted_kw === null));
    assert(r.assumptions.length);
    const ev = ok(
      await f.cmd("forecast.evaluate", r.id, { expected_version: 1 }),
    );
    const data = await f.get("forecast-evaluations", ev.id);
    assert(data.valid_samples > 0);
    assert.equal(data.accuracy_validated, false);
    return command("forecast.load");
  },
  20: async (f) => {
    const r = ok(await f.cmd("energy.compare"));
    assert.equal(r.strategies.length, 3);
    assert(r.strategies.every((s) => s.storage_control === false));
    assert(r.strategies[0].coverage < 1);
    assert(r.resource_versions.length === 3);
    f.state = { energy: r.id };
    return command("energy.compare");
  },
  21: async (f) => {
    const r = ok(await f.cmd("energy.compare"));
    ok(
      await f.cmd("energy.confirm", r.id, {
        expected_version: 1,
        evidence: "AC确认",
        strategy_id: "base",
      }),
    );
    ok(
      await f.cmd("energy.feedback", r.id, {
        expected_version: 2,
        session_ids: ["BN1"],
        evidence: "AC执行作业依据",
      }),
    );
    const next = ok(
      await f.cmd("energy.adjust", r.id, {
        expected_version: 3,
        reason: "AC变更条件",
      }),
    );
    assert.notEqual(next.id, r.id);
    assert.equal((await f.get("energy-plans", next.id)).replacement_id, r.id);
    f.state = { energy: next.id };
    return command(
      "energy.confirm",
      next.id,
      { evidence: "AC确认" },
      "energy-plans",
    );
  },
  22: async (f) => {
    for (let i = 0; i < 110; i++)
      insert(f.db, "orders", {
        id: "OD-AC-" + i,
        code: "OD-AC-" + i,
        name: "AC仿真草稿",
        owner_id: "ORG-N",
        demand_id: "DM1",
        status: "草稿",
        quantity_kg: 30000,
        start_at: day(6),
        finish_at: day(22),
        created_at: now(),
        source: "SIMULATED",
        data: {
          cargo: "原煤",
          origin: "北区装载场",
          destination: "煤炭集运中心",
          distance_km: 14,
          origin_coords: [107.57, 35.72],
          destination_coords: [107.72, 35.78],
        },
      });
    const r = ok(
      await f.cmd("planning.analyze", null, {
        start_at: new Date(Date.now() - 40 * 86400000).toISOString(),
        finish_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    assert(r.order_count > 100);
    assert.equal(
      r.corridors.reduce((n, c) => n + c.verified_trips, 0),
      24,
    );
    assert.equal(
      r.corridors.reduce((n, c) => n + c.verified_kg, 0),
      720000,
    );
    return command("planning.analyze", null, {
      start_at: day(0),
      finish_at: day(24),
    });
  },
  23: async (f) => {
    const r = ok(
      await f.cmd("planning.compare", null, {
        candidate_ids: ["PL1", "PL2"],
        daily_quantity: 1200,
        distance_km: 20,
      }),
    );
    assert.equal(r.comparison.length, 2);
    assert(r.comparison[0].coverage_ratio != null);
    assert(r.comparison[0].detour_km >= 0);
    assert.equal(r.comparison[1].feasible, false);
    assert.equal(r.engineering_approved, false);
    f.state = { comparison: r.id };
    return command("planning.compare", null, {
      candidate_ids: ["PL1", "PL2"],
      daily_quantity: 1200,
      distance_km: 20,
    });
  },
  24: async (f) => {
    const r = ok(
      await f.cmd("planning.run", null, {
        candidate_id: "PL1",
        daily_quantity: 1200,
        distance_km: 20,
      }),
    );
    assert(r.devices > 0 && r.required_power_kw > 0 && r.assumptions.length);
    assert(r.inputs.availability < 1);
    f.state = { plan: r.id };
    return command("planning.run", null, {
      candidate_id: "PL1",
      daily_quantity: 1200,
      distance_km: 20,
    });
  },
  25: async (f) => {
    const r = ok(
      await f.cmd("deployment.compare", null, {
        candidate_ids: ["PL1", "PL2"],
        daily_quantity: 1200,
        distance_km: 20,
        phases: [
          { name: "一期", ratio: 0.4 },
          { name: "二期", ratio: 1 },
        ],
      }),
    );
    assert(
      r.comparison[0].phases[1].vehicles >= r.comparison[0].phases[0].vehicles,
    );
    const single = ok(
      await f.cmd("deployment.run", null, {
        candidate_id: "PL1",
        daily_quantity: 1200,
        distance_km: 20,
        mode: "充电",
      }),
    );
    assert.equal(single.spare_batteries, 0);
    assert.equal(single.batteries, single.vehicles);
    return command("deployment.compare", null, {
      candidate_ids: ["PL1", "PL2"],
      daily_quantity: 1200,
      distance_km: 20,
    });
  },
  26: async (f) => {
    const r = ok(
      await f.cmd("planning.compare", null, {
        candidate_ids: ["PL1", "PL2"],
        daily_quantity: 600,
        distance_km: 14,
      }),
    );
    const feasible = r.comparison.find((c) => c.feasible);
    assert(feasible);
    ok(
      await f.cmd("planning.recommend", r.id, {
        expected_version: 1,
        candidate_id: feasible.candidate_id,
        evidence: "AC条件推荐",
      }),
    );
    ok(
      await f.cmd("planning.archive", r.id, {
        resource: "planning",
        expected_version: 2,
        evidence: "AC成果归档",
      }),
    );
    assert.equal((await f.get("planning", r.id)).status, "已归档");
    assert.equal(f.db.prepare("SELECT count(*) n FROM vehicles").get().n, 18);
    f.state = { plan: r.id };
    return command("planning.compare", null, {
      candidate_ids: ["PL1", "PL2"],
      daily_quantity: 600,
      distance_km: 14,
    });
  },
  27: async (f) => {
    const s = ok(await f.admin.req("/api/summary")),
      r = ok(await f.admin.req("/api/reports"));
    assert.equal(s.verified_tonnes, r.summary.verified_tonnes);
    assert.equal(r.summary.verified_tonnes, 720);
    assert(r.source_records.tasks.includes("T001"));
    assert.equal(r.source, "SIMULATED");
    return { read: "/api/summary" };
  },
  28: async (f) => {
    const v = ok(await f.get("vehicles", "V001")),
      trace = ok(await f.admin.req("/api/telemetry/V001"));
    assert(v.source_time && v.source_label);
    assert(trace.items.every((p) => p.occurred_at && p.source === "SIMULATED"));
    assert.equal(trace.real_trajectory, false);
    return { read: "/api/telemetry/V001" };
  },
  29: async (f) => {
    const d = await delivered(f),
      trace = ok(await f.admin.req("/api/telemetry/V001"));
    assert(trace.events.length === 3);
    assert(trace.events.every((e) => e.received_at && e.occurred_at));
    assert(trace.tasks.some((t) => t.id === d.id));
    return { read: "/api/telemetry/V001" };
  },
  30: async (f) => {
    const ds = ok(
        await f.admin.req("/api/resources/devices?station=S001&pageSize=100"),
      ),
      plans = ok(
        await f.admin.req("/api/resources/charging?station=S001&pageSize=100"),
      );
    assert.equal(ds.items.length, 3);
    assert(ds.items.some((d) => d.connection === "离线"));
    assert(plans.items.length);
    assert(ds.items.every((d) => d.station_id === "S001"));
    return { read: "/api/resources/devices" };
  },
  31: async (f) => {
    for (const kind of [
      "SOC关注",
      "设备断流",
      "时效延误",
      "排队风险",
      "设备故障",
      "负荷越限",
    ]) {
      const r = ok(
        await f.cmd("rule.create", null, {
          name: "AC" + kind,
          kind,
          threshold: kind === "SOC关注" ? 80 : kind === "负荷越限" ? 200 : 1,
          max_age_minutes: 15,
          evidence: "AC仿真阈值",
        }),
      );
      ok(await f.cmd("rule.run", r.id, { expected_version: 1 }));
    }
    const rows = f.db
      .prepare(
        "SELECT data FROM alerts WHERE json_extract(data,'$.rule_id') IS NOT NULL",
      )
      .all()
      .map((r) => JSON.parse(r.data));
    assert(rows.length);
    assert(
      rows.every(
        (r) =>
          r.rule_version === 1 &&
          r.observed_at &&
          r.production_fault_confirmed === false,
      ),
    );
    return command("rule.create", null, {
      name: "AC",
      kind: "SOC关注",
      threshold: 20,
      max_age_minutes: 15,
      evidence: "AC",
    });
  },
  32: async (f) => {
    const driver = await f.login("driver04");
    const r = ok(
      await driver.cmd("alert.report", null, {
        task_id: "TA001",
        name: "车辆故障",
        reason: "AC救援反馈",
        evidence: "AC位置凭证",
      }),
    );
    ok(
      await f.cmd("alert.accept", r.id, {
        expected_version: 1,
        evidence: "AC指派救援",
        assignee: "调度员",
      }),
    );
    ok(
      await f.cmd("alert.resolve", r.id, {
        expected_version: 2,
        evidence: "AC处置结果",
      }),
    );
    ok(
      await f.cmd("alert.close", r.id, {
        expected_version: 3,
        evidence: "AC确认已交接责任",
      }),
    );
    assert.equal(
      (await driver.req("/api/resources/alerts/" + r.id)).status,
      "已关闭",
    );
    f.state = { alert: r.id };
    return command("alert.accept", r.id, { evidence: "AC" }, "alerts");
  },
  33: async (f) => {
    const s = await dispatch(f),
      r = ok(await f.admin.req("/api/reports"));
    const d = r.details.find((d) => d.id === s.tasks[0].id);
    assert(d.expected_cents > 0);
    assert(d.missing_categories.includes("运输费用"));
    assert.equal(d.unit_cost_cents_per_tonne, null);
    return { read: "/api/reports" };
  },
  34: async (f) => {
    const c = await f.get("costs", "F1");
    assert.equal(c.included, "已含服务费，不重复加收");
    const r = ok(
      await f.cmd("cost.create", null, {
        name: "AC更正",
        nature: "实际",
        amount: 130,
        included: "已含服务费",
        category: "电费及服务费",
        replacement_id: c.id,
        expected_version: c.version,
        evidence: "AC原始依据",
      }),
    );
    ok(
      await f.cmd("cost.verify", r.id, {
        expected_version: 1,
        evidence: "AC核验",
      }),
    );
    assert.equal((await f.get("costs", "F1")).status, "已替代");
    assert.equal((await f.get("costs", r.id)).session_id, c.session_id);
    return command("cost.create", null, {
      name: "AC费用",
      nature: "实际",
      amount: 10,
      included: "服务费",
      category: "服务费",
      evidence: "AC",
    });
  },
  35: async (f) => {
    ok(
      await f.cmd("asset.lease", "AS7", {
        expected_version: 1,
        lessor: "AC出租主体",
        start_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        finish_at: new Date(Date.now() - 86400000).toISOString(),
        amount: 1000,
        evidence: "AC租赁",
      }),
    );
    ok(
      await f.cmd("asset.maintenance", "AS7", {
        expected_version: 2,
        note: "AC维保",
        maintenance_state: "已完成",
        evidence: "AC工单",
      }),
    );
    const r = ok(await f.cmd("asset.review-expiry"));
    assert.equal(r.count, 1);
    const a = await f.get("assets", "AS7");
    assert(a.history.length >= 2 && a.lease.amount_cents === 100000);
    return command(
      "asset.record",
      "AS7",
      { kind: "维保", note: "AC", evidence: "AC" },
      "assets",
    );
  },
  36: async (f) => {
    ok(
      await f.cmd("replacement.confirm", "RP1", {
        expected_version: 1,
        evidence: "AC合作依据",
      }),
    );
    ok(
      await f.cmd("replacement.implement", "RP1", {
        expected_version: 2,
        asset_ids: ["AS7", "AS8"],
        evidence: "AC投运证明",
      }),
    );
    const r = await f.get("replacements", "RP1");
    assert.equal(r.quantity, 6);
    assert.equal(r.implemented_count, 2);
    assert.equal(r.implemented_assets.length, 2);
    return command(
      "replacement.implement",
      "RP1",
      { asset_ids: ["AS7"], evidence: "AC" },
      "replacements",
    );
  },
  37: async (f) => {
    const r = ok(await f.admin.req("/api/reports?owner=ORG-N"));
    assert.equal(r.summary.verified_tonnes, 720);
    assert(r.by_vehicle.length && r.by_station.length);
    const costs = ok(await f.admin.req("/api/resources/costs?owner=ORG-N"));
    assert(costs.items.every((c) => c.owner_id === "ORG-N"));
    const empty = ok(
      await f.admin.req("/api/reports?from=2035-01-01&to=2035-02-01"),
    );
    assert.equal(empty.summary.verified_tonnes, 0);
    return { read: "/api/reports" };
  },
  38: async (f) => {
    const before = f.db
        .prepare("SELECT count(*) n FROM command_results")
        .get().n,
      r = ok(
        await f.admin.req("/api/assistant", {
          question: "查询已核验交付量与订单编号",
        }),
      );
    assert(r.answer.includes("720") && r.refs.length && r.data_time);
    assert.equal(r.actions_allowed, false);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM command_results").get().n,
      before,
    );
    assert(f.calls[0].orders.every((o) => o.id));
    return { read: "/api/resources/orders" };
  },
  39: async (f) => {
    const r = ok(await f.cmd("assistant.prepare", null, { order_id: "O013" }));
    assert(r.preparation.requires_input_confirmation);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM tasks WHERE order_id='O013'").get()
        .n,
      0,
    );
    const run = ok(await f.cmd("simulation.run", null, r.preparation));
    assert(run.simulation.candidates.some((c) => c.feasible));
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM tasks WHERE order_id='O013'").get()
        .n,
      0,
    );
    return command("assistant.prepare", null, { order_id: "O013" });
  },
  40: async (f) => {
    ok(await f.cmd("forecast.queue", null, { use_reference: true }));
    ok(await f.cmd("forecast.load"));
    const r = ok(
      await f.admin.req("/api/assistant", { question: "解释排队与负荷预测" }),
    );
    assert.equal(r.intent, "forecast");
    assert(r.evidence_refs.some((x) => x.resource === "forecasts"));
    assert(f.calls[0].forecasts.every((r) => r.model));
    return { read: "/api/resources/forecasts" };
  },
  41: async (f) => {
    ok(
      await f.cmd("planning.run", null, {
        candidate_id: "PL1",
        daily_quantity: 1200,
        distance_km: 20,
      }),
    );
    const r = ok(
      await f.admin.req("/api/assistant", {
        question: "解释规划容量和未核查条件",
      }),
    );
    assert.equal(r.intent, "planning");
    assert(r.evidence_refs.some((x) => x.resource === "planning"));
    assert(f.calls[0].planning.every((p) => p.engineering_approved === false));
    return { read: "/api/resources/planning" };
  },
  42: async (f) => {
    const before = f.db.prepare("SELECT count(*) n FROM tasks").get().n,
      r = ok(
        await f.admin.req("/api/assistant", {
          question: "分析预警风险，说明优先建议",
        }),
      );
    assert.equal(r.intent, "risk");
    assert(r.evidence_refs.some((x) => x.resource === "alerts"));
    assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, before);
    return { read: "/api/resources/alerts" };
  },
  43: async (f) => {
    const r = ok(
      await f.cmd("resource.create", null, {
        resource: "entities",
        name: "AC矿区",
        kind: "矿区",
        code: "AC-MINE",
        note: "AC主档",
        evidence: "AC来源",
      }),
    );
    ok(
      await f.cmd("resource.edit", r.id, {
        resource: "entities",
        expected_version: 1,
        name: "AC矿区修订",
        status: "草稿",
        evidence: "AC更名",
      }),
    );
    assert.equal((await f.get("entities", r.id)).external_code, "AC-MINE");
    return command(
      "resource.edit",
      r.id,
      { resource: "entities", name: "AC", status: "草稿", evidence: "AC" },
      "entities",
    );
  },
  44: async (f) => {
    ok(
      await f.cmd("resource.configure", "INT2", {
        resource: "integrations",
        expected_version: 1,
        connector: "仿真接入",
        mapping: {
          external_key: "EXT1",
          vehicle_id: "V001",
          unit: "kWh",
          coordinates: "GCJ-02",
        },
        evidence: "AC映射",
      }),
    );
    const item = {
      vehicle_id: "V001",
      event_id: "AC-EXT",
      occurred_at: now(),
      longitude: 107.6,
      latitude: 35.75,
      soc: 74,
      speed_kmh: 20,
    };
    const r = ok(
      await f.cmd("integration.sync", "INT2", {
        expected_version: 2,
        simulated: true,
        items: [item],
      }),
    );
    assert.equal(r.accepted, 1);
    ok(
      await f.cmd("integration.pause", "INT2", {
        expected_version: 3,
        reason: "AC影响说明",
      }),
    );
    ok(
      await f.cmd("integration.resume", "INT2", {
        expected_version: 4,
        reason: "AC恢复说明",
      }),
    );
    assert.equal((await f.get("integrations", "INT2")).history.length, 3);
    f.state = { item };
    return command(
      "integration.sync",
      "INT2",
      { simulated: true, items: [item] },
      "integrations",
    );
  },
  45: async (f) => {
    const r = ok(
      await f.cmd("session.correct", "BN1", {
        expected_version: 1,
        correction: "AC计量纠正",
        evidence: "AC原值与更正",
      }),
    );
    ok(
      await f.cmd("quality.review", r.id, {
        expected_version: 1,
        quantity_kwh: 140,
        amount: 179.2,
        evidence: "AC核验",
      }),
    );
    const s = await f.get("sessions", "BN1");
    assert.equal(s.previous_values.quantity_kwh, 98);
    assert.equal(s.quantity_kwh, 140);
    assert.equal(s.source, "SIMULATED");
    return command(
      "session.correct",
      "BN1",
      { correction: "AC", evidence: "AC" },
      "sessions",
    );
  },
  46: async (f) => {
    const r = ok(
      await f.cmd("user.create", null, {
        username: "ac-user",
        name: "AC查询",
        role: "admin",
        password: "AC-Local2026!",
        scopes: ["ORG-N"],
        operations: ["read"],
      }),
    );
    const user = await f.get("users", r.id);
    assert(!user.password_hash);
    ok(
      await f.cmd("user.update", r.id, {
        expected_version: 1,
        name: "AC停用",
        scopes: ["ORG-N"],
        operations: ["read"],
        enabled: false,
      }),
    );
    assert.equal((await f.get("users", r.id)).enabled, 0);
    return command("user.update", r.id, { name: "AC", enabled: true }, "users");
  },
  47: async (f) => {
    const r = ok(
      await f.cmd("parameter.draft", "P-001", {
        expected_version: 1,
        candidate: "21%",
        usage_boundary: "仅仿真",
        evidence: "AC新依据",
      }),
    );
    const p = await f.get("parameters", r.id);
    assert.equal(p.replacement_id, "P-001");
    assert.equal(p.enabled, false);
    const logs = ok(await f.admin.req("/api/resources/audit?pageSize=100"));
    assert(logs.items.some((a) => a.action === "parameter.draft"));
    return command(
      "parameter.draft",
      "P-001",
      { candidate: "22%", usage_boundary: "仿真", evidence: "AC" },
      "parameters",
    );
  },
  48: async (f) => {
    const key = crypto.randomUUID(),
      a = ok(await f.cmd("order.create", null, orderBody, key)),
      b = ok(await f.cmd("order.create", null, orderBody, key));
    assert.equal(a.id, b.id);
    const found = ok(await f.admin.req("/api/commands/" + key));
    assert.equal(found.status, "COMPLETED");
    return command("order.create", null, orderBody);
  },
  49: async (f) => {
    const anonymous = await fetch(f.base + "/api/bootstrap");
    assert.equal(anonymous.status, 401);
    const d = await f.login("driver01");
    bad(await d.req("/api/resources/costs"), 403);
    bad(await f.cmd("device.start", "S001-G1", {}), 404);
    return { read: "/api/resources/costs" };
  },
  50: async (f) => {
    const v = await f.get("vehicles", "V001"),
      p = await f.get("parameters", "P-001");
    assert.equal(v.source, "SIMULATED");
    assert.equal(p.source, "REFERENCE_PARAMETER");
    assert(v.source_time);
    assert(p.evidence_type);
    return { read: "/api/resources/parameters" };
  },
  51: async (f) => {
    const times = [];
    for (let i = 0; i < 12; i++) {
      const start = performance.now();
      ok(await f.admin.req("/api/resources/orders?pageSize=100"));
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    assert(times.at(-1) < 500);
    f.state = {
      metrics: {
        scenario: "18车辆/3场站/24订单本地基准",
        request_count: 12,
        p95_ms: times[Math.ceil(times.length * 0.95) - 1],
        target_ms: 500,
        production_sla: false,
      },
    };
    return { read: "/api/reports" };
  },
  52: async (f) => {
    const r = ok(
      await f.cmd("resource.create", null, {
        resource: "drivers",
        code: "AC-DR",
        name: "AC新司机",
        license: "A2",
        available_window: "06:00—22:00",
        evidence: "AC证件",
      }),
    );
    const v = ok(
      await f.cmd("resource.create", null, {
        resource: "vehicles",
        code: "AC-V",
        name: "AC新车辆",
        driver_id: r.id,
        capacity_kwh: 350,
        payload_tonnes: 30,
        soc: 80,
        energy_per_km: 1.58,
        compatibility: "QY-SWAP-A（仿真适配）",
        available_window: "06:00—22:00",
        evidence: "AC资料",
      }),
    );
    assert.equal((await f.get("vehicles", v.id)).driver_id, r.id);
    return command("resource.create", null, {
      resource: "drivers",
      code: "AC-DR-2",
      name: "AC",
      license: "A2",
      available_window: "06:00—22:00",
      evidence: "AC",
    });
  },
  53: async (f) => {
    const s = await dispatch(f),
      d = await f.login("driver01");
    ok(
      await d.cmd("task.accept", s.tasks[0].id, {
        expected_version: s.tasks[0].version,
      }),
    );
    const plans = ok(await d.req("/api/resources/charging"));
    assert(plans.items.every((p) => p.vehicle_id === "V001"));
    const empty = ok(
      await f.admin.req("/api/resources/orders?q=不存在的搜索词"),
    );
    assert.equal(empty.total, 0);
    return { read: "/api/summary" };
  },
  54: async (f) => {
    ok(
      await f.cmd("integration.pause", "INT2", {
        expected_version: 1,
        reason: "AC来源中断，标记受影响数据",
      }),
    );
    assert.equal((await f.get("integrations", "INT2")).status, "已暂停");
    ok(await f.admin.req("/api/resources/orders"));
    ok(
      await f.cmd("integration.resume", "INT2", {
        expected_version: 2,
        reason: "AC恢复",
      }),
    );
    assert.equal((await f.get("integrations", "INT2")).history.length, 2);
    return command(
      "integration.pause",
      "INT2",
      { reason: "AC" },
      "integrations",
    );
  },
  55: async (f) => {
    const s = await scheme(f),
      snapshot = await f.get("simulations", s.run.id);
    assert(
      snapshot.resource_versions.length &&
        snapshot.driver_versions.length &&
        snapshot.device_versions.length,
    );
    assert(snapshot.inputs.reserve_soc === 20);
    ok(
      await f.cmd("parameter.draft", "P-001", {
        expected_version: 1,
        candidate: "21%",
        usage_boundary: "新场景",
        evidence: "AC依据",
      }),
    );
    assert.equal((await f.get("simulations", s.run.id)).inputs.reserve_soc, 20);
    return { read: "/api/resources/simulations" };
  },
  56: async (f) => {
    const r = ok(
      await f.admin.req("/api/assistant", { question: "查询订单和交付量" }),
    );
    assert(r.refs.some((r) => r.resource === "orders"));
    assert.equal(r.actions_allowed, false);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM command_results").get().n,
      0,
    );
    return { read: "/api/resources/orders" };
  },
  57: async (f) => {
    const summary = ok(await f.admin.req("/api/summary")),
      report = ok(await f.admin.req("/api/reports"));
    assert.equal(
      summary.verified_tonnes,
      report.details.reduce((n, d) => n + d.verified_kg, 0) / 1000,
    );
    assert.equal(summary.actual_cost_cents, report.summary.actual_cost_cents);
    assert.equal(summary.actual_energy, report.summary.actual_energy);
    return { read: "/api/reports" };
  },
};
export async function boundary(n, f) {
  switch (n) {
    case 1: {
      const d = await f.get("demands", f.state.d);
      bad(
        await f.cmd("demand.edit", d.id, {
          expected_version: d.version,
          name: d.name,
          quantity: 1,
          cargo: "原煤",
          origin: "装货",
          destination: "卸货",
        }),
      );
      ok(
        await f.cmd("demand.cancel", d.id, {
          expected_version: d.version,
          reason: "AC终止后续拆分",
        }),
      );
      assert.equal((await f.get("demands", d.id)).allocated_kg, 100000);
      assert.equal((await f.get("orders", f.state.o)).status, "已确认");
      break;
    }
    case 2:
      bad(
        await f.cmd("order.cancel", "O014", {
          expected_version: 1,
          reason: "不得取消履约事实",
        }),
      );
      assert.equal((await f.get("tasks", "TA001")).reported_kg, 30000);
      break;
    case 3: {
      const r = ok(
        await f.cmd("simulation.run", null, {
          order_id: "O013",
          vehicle_ids: ["V001"],
          station_id: "S001",
          soc: 5,
          reserve_soc: 20,
          use_reference: true,
        }),
      );
      assert(r.simulation.candidates.every((c) => !c.feasible));
      assert(r.simulation.candidates[0].constraint_violations.length);
      bad(
        await f.cmd("simulation.run", null, {
          order_id: "O013",
          vehicle_ids: ["V001"],
          station_id: "S001",
          soc: 74,
          use_reference: false,
        }),
      );
      break;
    }
    case 4:
      ok(
        await f.cmd("resource.edit", "S001-G1", {
          resource: "devices",
          expected_version: 1,
          name: "AC工位",
          status: "检修",
          connection: "离线",
          evidence: "AC失效",
        }),
      );
      bad(
        await f.cmd("simulation.confirm", f.state.fresh.id, {
          expected_version: 1,
          candidate_id: "A",
        }),
        409,
      );
      break;
    case 5: {
      const t = f.state.tasks[0],
        count = f.db.prepare("SELECT count(*) n FROM tasks").get().n;
      f.db
        .prepare("UPDATE tasks SET notification='投递失败' WHERE id=?")
        .run(t.id);
      ok(await f.cmd("task.notify", t.id, { expected_version: t.version }));
      assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, count);
      bad(
        await f.cmd("dispatch.batch", null, {
          items: [{ id: t.id, expected_version: 999 }],
        }),
        409,
      );
      break;
    }
    case 6:
      bad(
        await f.cmd("resource.edit", "D004", {
          resource: "drivers",
          expected_version: 1,
          name: "AC",
          status: "休息",
          evidence: "不能覆盖占用",
        }),
      );
      break;
    case 7:
      bad(
        await f.cmd("dispatch.batch", null, {
          items: [{ id: f.state.t.id, expected_version: f.state.t.version }],
        }),
      );
      assert.equal((await f.get("tasks", f.state.t.id)).status, "待派发");
      break;
    case 8: {
      const d = await f.login("driver02");
      bad(
        await d.cmd("task.accept", f.state.t.id, {
          expected_version: f.state.t.version,
        }),
        404,
      );
      break;
    }
    case 9: {
      const t = await f.get("tasks", f.state.id);
      bad(
        await f.state.driver.cmd("trip.deliver", t.id, {
          expected_version: t.version,
          trip_id: f.state.trip_id,
          quantity: 30,
          evidence: "重复",
          event_id: "AC-DUP",
        }),
      );
      assert.equal((await f.get("tasks", t.id)).reported_kg, 30000);
      break;
    }
    case 10:
      bad(
        await f.cmd("task.cancel", f.state.id, {
          expected_version: (await f.get("tasks", f.state.id)).version,
          reason: "不能删除完工事实",
        }),
      );
      break;
    case 11:
      bad(
        await f.cmd("resource.create", null, {
          resource: "stations",
          code: "BAD",
          name: "AC",
          mode: "充电",
          power_kw: 1,
          longitude: 200,
          latitude: 35,
          compatibility: "x",
          evidence: "AC",
        }),
      );
      break;
    case 12:
      bad(
        await f.cmd("resource.edit", "S001-G1", {
          resource: "devices",
          expected_version: 1,
          status: "故障任意值",
          connection: "在线",
          evidence: "AC",
        }),
      );
      break;
    case 13:
      ok(
        await f.cmd("charging.cancel", f.state.plan, {
          expected_version: 3,
          reason: "AC未执行取消",
        }),
      );
      bad(
        await f.cmd("charging.confirm", f.state.plan, { expected_version: 4 }),
      );
      break;
    case 14:
      bad(await f.cmd("forecast.queue", null, { use_reference: false }));
      break;
    case 15:
      bad(
        await f.cmd("charging.apply", f.state.optimization, {
          expected_version: 1,
          evidence: "AC重复",
        }),
        409,
      );
      break;
    case 16:
      bad(await f.cmd("session.create", null, f.state.body), 409);
      bad(
        await f.cmd("session.create", null, {
          ...f.state.body,
          source_event_id: "OTHER",
          incoming_battery: "AS2",
          outgoing_battery: "AS2",
        }),
      );
      break;
    case 17:
      bad(
        await f.cmd("resource.configure", f.state.energy, {
          resource: "energy-resources",
          expected_version: 2,
          station_id: "S001",
          kind: "储能",
          storage_soc: 105,
          storage_capacity_kwh: 1000,
          evidence: "AC",
        }),
      );
      break;
    case 18:
      assert.equal(
        (await f.admin.req("/api/resources/device-loads?device=unknown")).total,
        0,
      );
      break;
    case 19:
      f.db
        .prepare(
          "UPDATE records SET data=json_set(data,'$.actual_kw',NULL) WHERE resource='loads'",
        )
        .run();
      bad(await f.cmd("forecast.load"));
      break;
    case 20: {
      f.db
        .prepare(
          "UPDATE records SET status='待核实' WHERE resource='energy-resources' AND json_extract(data,'$.kind')='储能'",
        )
        .run();
      const r = ok(await f.cmd("energy.compare"));
      assert.equal(
        r.strategies.find((s) => s.id === "storage").available,
        false,
      );
      assert.equal(
        r.strategies.find((s) => s.id === "storage").known_cost_cents,
        null,
      );
      break;
    }
    case 21:
      bad(
        await f.cmd("energy.confirm", f.state.energy, {
          expected_version: 999,
          evidence: "AC",
        }),
        409,
      );
      break;
    case 22:
      bad(
        await f.cmd("planning.analyze", null, {
          start_at: day(22),
          finish_at: day(6),
        }),
      );
      break;
    case 23:
      bad(
        await f.cmd("planning.recommend", f.state.comparison, {
          expected_version: 1,
          candidate_id: "PL2",
          evidence: "AC不具备条件",
        }),
      );
      break;
    case 24:
      bad(
        await f.cmd("planning.run", null, {
          candidate_id: "PL2",
          daily_quantity: 1200,
          distance_km: 20,
        }),
      );
      break;
    case 25:
      bad(
        await f.cmd("deployment.compare", null, {
          candidate_ids: ["PL1", "PL2"],
          daily_quantity: 1200,
          distance_km: 20,
          phases: [
            { name: "二期", ratio: 1 },
            { name: "一期", ratio: 0.5 },
          ],
        }),
      );
      break;
    case 26:
      bad(
        await f.cmd("planning.recommend", f.state.plan, {
          expected_version: 3,
          candidate_id: "PL1",
          evidence: "AC归档后不能推荐",
        }),
      );
      break;
    case 27:
    case 37:
    case 57:
      bad(await f.admin.req("/api/reports?owner=OUTSIDE"), 403);
      break;
    case 28:
    case 29:
      bad(await f.admin.req("/api/telemetry/unknown"), 404);
      break;
    case 30:
      assert(
        (await f.admin.req("/api/resources/devices?station=S001")).items.some(
          (d) => d.connection !== "在线",
        ),
      );
      break;
    case 31:
      bad(
        await f.cmd("rule.create", null, {
          name: "AC",
          kind: "SOC关注",
          threshold: 101,
          max_age_minutes: 15,
          evidence: "AC",
        }),
      );
      break;
    case 32:
      bad(
        await f.cmd("alert.close", f.state.alert, {
          expected_version: 4,
          evidence: "",
        }),
      );
      break;
    case 33:
      assert(
        (await f.admin.req("/api/reports")).details.some(
          (d) => d.unit_cost_cents_per_tonne === null,
        ),
      );
      break;
    case 34:
      bad(
        await f.cmd("cost.create", null, {
          name: "AC",
          replacement_id: "F1",
          expected_version: 2,
          amount: 100,
          nature: "实际",
          category: "电费",
          included: "电费",
          evidence: "不可覆盖已替代",
        }),
      );
      break;
    case 35:
      bad(
        await f.cmd("asset.move", "AS7", {
          expected_version: 3,
          station_id: "S001",
          evidence: "车辆不是电池",
        }),
      );
      break;
    case 36:
      bad(
        await f.cmd("replacement.implement", "RP1", {
          expected_version: 3,
          asset_ids: ["AS12"],
          evidence: "未核验资产",
        }),
      );
      break;
    case 38:
    case 56:
      bad(
        await f.admin.req("/api/assistant", {
          question: "TEST_SERVICE_FAILURE",
        }),
        502,
      );
      break;
    case 39:
      bad(
        await f.cmd("assistant.prepare", null, {
          question: "请随便编一个订单",
        }),
      );
      break;
    case 40:
      f.db.prepare("DELETE FROM records WHERE resource='forecasts'").run();
      {
        const count = f.calls.length,
          r = ok(
            await f.admin.req("/api/assistant", { question: "解释负荷预测" }),
          );
        assert.equal(r.source, "DB_MISSING_CONTEXT");
        assert.equal(f.calls.length, count);
      }
      break;
    case 41:
      f.db.prepare("DELETE FROM records WHERE resource='planning'").run();
      {
        const r = ok(
          await f.admin.req("/api/assistant", { question: "解释规划成果" }),
        );
        assert.equal(r.source, "DB_MISSING_CONTEXT");
      }
      break;
    case 42:
      f.db.prepare("DELETE FROM alerts").run();
      {
        const r = ok(
          await f.admin.req("/api/assistant", { question: "解释预警风险" }),
        );
        assert(r.answer.includes("不代表"));
      }
      break;
    case 43:
      bad(
        await f.cmd("resource.edit", "O001", {
          resource: "entities",
          expected_version: 1,
          name: "不能合并",
          status: "草稿",
          evidence: "AC",
        }),
        404,
      );
      break;
    case 44: {
      const r = await f.get("integrations", "INT2"),
        result = ok(
          await f.cmd("integration.sync", "INT2", {
            expected_version: r.version,
            simulated: true,
            items: [f.state.item],
          }),
        );
      assert.equal(result.duplicate, 1);
      break;
    }
    case 45: {
      const before = (await f.get("vehicles", "V001")).soc,
        r = ok(
          await f.cmd("integration.sync", "INT2", {
            expected_version: 1,
            simulated: true,
            items: [
              {
                vehicle_id: "V001",
                event_id: "BAD-SOC",
                occurred_at: now(),
                longitude: 200,
                latitude: 35,
                soc: 200,
                speed_kmh: 20,
              },
            ],
          }),
        );
      assert.equal(r.rejected, 1);
      assert.equal((await f.get("vehicles", "V001")).soc, before);
      break;
    }
    case 46:
      bad(
        await f.cmd("user.update", "U-ADMIN", {
          expected_version: 1,
          enabled: false,
        }),
      );
      break;
    case 47:
      bad(
        await f.cmd("resource.edit", "P-001", {
          resource: "parameters",
          expected_version: 1,
          enabled: true,
        }),
      );
      break;
    case 48:
      bad(await f.cmd("order.create", null, { ...orderBody, name: "" }));
      break;
    case 49:
      bad(await f.cmd("device.stop", "S001-G1", {}), 404);
      break;
    case 50:
      bad(
        await f.cmd("simulation.run", null, {
          order_id: "O013",
          vehicle_ids: ["V001"],
          station_id: "S001",
          soc: 74,
          reserve_soc: 20,
          use_reference: false,
        }),
      );
      break;
    case 51:
      bad(await f.admin.req("/api/resources/orders?from=not-a-time"));
      break;
    case 52:
      bad(
        await f.cmd("resource.create", null, {
          resource: "vehicles",
          code: "BAD",
          name: "AC",
          capacity_kwh: 0,
          payload_tonnes: 30,
          soc: 75,
          compatibility: "x",
          energy_per_km: 1,
          evidence: "AC",
        }),
      );
      break;
    case 53:
      assert.equal(
        (await f.admin.req("/api/resources/orders?q=无记录")).items.length,
        0,
      );
      break;
    case 54:
      bad(
        await f.cmd("integration.resume", "INT2", {
          expected_version: 999,
          reason: "旧版本",
        }),
        409,
      );
      break;
    case 55:
      bad(
        await f.cmd("parameter.draft", "P-001", {
          expected_version: 999,
          candidate: "0",
          usage_boundary: "x",
          evidence: "AC",
        }),
        409,
      );
      break;
    default:
      throw new Error("缺少明确边界用例 " + n);
  }
}
export async function permission(n, f, probe) {
  const driver = await f.login("driver02");
  if ((n >= 38 && n <= 42) || n === 56) {
    bad(await driver.req("/api/assistant", { question: "越权业务查询" }), 403);
    return;
  }
  if (probe.read) {
    {
      const r = await driver.req(probe.read);
      assert([403, 404].includes(r.statusCode), r.message);
    }
    return;
  }
  const north = await f.login("north");
  let payload = { ...probe.payload };
  if (probe.resource && probe.id) {
    const row = await f.get(probe.resource, probe.id);
    payload.expected_version = row.version;
  }
  const before = f.db.prepare("SELECT count(*) n FROM command_results").get().n;
  const result = await north.cmd(probe.type, probe.id, payload);
  assert(
    [403, 404].includes(result.statusCode),
    result.message + " " + result.statusCode,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM command_results").get().n,
    before,
  );
}
