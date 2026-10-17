import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
import {
  defaults,
  sizeFleet,
  queueMinutes,
} from "../server/planning-engine.mjs";
import { insert } from "../server/db.mjs";
export async function projectBody(f, extra = {}) {
  const o = ok(await f.admin.req("/api/planner/options"));
  return {
    name: "北区煤运走廊规划（仿真测试）",
    owner_id: o.owner_id,
    start_date: "2026-11-01",
    finish_date: "2026-11-15",
    conditions: {
      ...o.defaults,
      daily_quantity: 2400,
      phase_one_quantity: 1200,
      distance_km: 20,
    },
    sites: o.candidates.map((p) => ({
      candidate_id: p.id,
      supply_kw: p.id === "PL1" ? 4000 : 800,
      other_load_kw: 160,
      land_verified: true,
      grid_verified: true,
      access_verified: true,
    })),
    ...extra,
  };
}
const create = async (f, b) =>
  ok(await f.cmd("planner.create", null, b || (await projectBody(f)))).project;
const calculate = async (f, p) =>
  ok(await f.cmd("planner.calculate", p.id, { expected_version: p.version }))
    .solution;
const read = async (f, p) =>
  ok(await f.admin.req("/api/planner/projects/" + p.id));
test("CR21 size model includes charging, trips, reserve and bounded Erlang queue", () => {
  const c = { ...defaults, daily_quantity: 2400 },
    r = sizeFleet(c);
  assert.equal(r.trips, 80);
  assert.equal(r.vehicles, r.operating + r.reserve);
  assert(r.cycle_minutes > 70);
  assert(r.chargers > 0);
  assert.equal(queueMinutes(0, 30, 2), 0);
  assert.equal(queueMinutes(4, 30, 2), null);
  assert(Math.abs(queueMinutes(2, 30, 2) - 10) < 1e-8);
  assert.equal(
    sizeFleet({ ...c, hours: 0.5, distance_km: 200 }).vehicles,
    null,
  );
  assert.equal(sizeFleet({ ...c, distance_km: 200 }).transport_feasible, false);
});
test("CR21 project persistence, calculation version sequence, immutable snapshots and idempotency", async () => {
  const f = await fixture();
  try {
    const b = await projectBody(f),
      key = "cr21-create",
      r = ok(await f.cmd("planner.create", null, b, key));
    assert.equal(ok(await f.cmd("planner.create", null, b, key)).id, r.id);
    const p = r.project,
      s = await calculate(f, p);
    assert.equal(s.sequence, 1);
    assert.equal(s.engineering_approved, false);
    assert.equal(s.budget.equipment, null);
    assert.equal(s.inventory.vehicles.length, 11);
    assert(s.inventory.vehicles.every((v) => v.id));
    assert(s.fleet.vehicle_gap >= 0);
    assert.equal((await read(f, p)).solutions.length, 1);
    assert.equal(
      (await f.cmd("planner.update", p.id, { ...b, expected_version: 0 }))
        .statusCode,
      409,
    );
    ok(
      await f.cmd("planner.update", p.id, {
        ...b,
        conditions: { ...b.conditions, daily_quantity: 3000 },
        expected_version: 1,
      }),
    );
    const after = await read(f, p);
    assert.equal(after.project.version, 2);
    assert.equal(after.solutions[0].conditions.daily_quantity, 2400);
    assert(after.solutions[0].stale);
    assert.equal(
      (
        await f.cmd("planner.adopt", s.id, {
          project_id: p.id,
          expected_version: 2,
          solution_version: s.version,
          candidate_id: "PL1",
        })
      ).code,
      "STALE_SOLUTION",
    );
    const s2 = await calculate(f, after.project);
    assert.equal(s2.sequence, 2);
  } finally {
    await f.close();
  }
});
test("CR21 authorization, scoped read, foreign site and station rejected, driver and read-only writes blocked", async () => {
  const f = await fixture();
  try {
    const sample = f.db
      .prepare("SELECT * FROM users WHERE username='north'")
      .get();
    insert(f.db, "users", { ...sample, id: "CR21-SOUTH", username: "south" });
    insert(f.db, "user_scopes", { user_id: "CR21-SOUTH", owner_id: "ORG-S" });
    const p = await create(f),
      south = await f.login("south"),
      driver = await f.login("driver01");
    assert.equal(
      (await south.req("/api/planner/projects/" + p.id)).statusCode,
      404,
    );
    assert.equal((await driver.req("/api/planner/options")).statusCode, 403);
    assert.equal(
      (await driver.cmd("planner.create", null, await projectBody(f)))
        .statusCode,
      403,
    );
    const b = await projectBody(f);
    b.sites[0].station_id = "S003";
    assert.equal((await f.cmd("planner.create", null, b)).statusCode, 422);
    const uid = f.db
      .prepare("SELECT id FROM users WHERE username='north'")
      .get().id;
    f.db
      .prepare("UPDATE users SET operations=? WHERE id=?")
      .run(JSON.stringify(["read"]), uid);
    const north = await f.login("north");
    assert.equal((await north.req("/api/planner/projects")).statusCode, 200);
    assert.equal(
      (await north.cmd("planner.calculate", p.id, { expected_version: 1 }))
        .statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});
test("CR21 business import deduplicates demand allocation, prorates intervals and separates verified facts", async () => {
  const f = await fixture();
  try {
    const sample = f.db.prepare("SELECT * FROM demands WHERE id='DM1'").get();
    insert(f.db, "demands", {
      ...sample,
      id: "CR21-D",
      code: "CR21-D",
      quantity_kg: 1000000,
      allocated_kg: 400000,
      data: {
        start_at: "2026-11-01T00:00:00+08:00",
        finish_at: "2026-11-11T00:00:00+08:00",
        origin: "测试矿",
        destination: "测试仓",
      },
    });
    const order = f.db.prepare("SELECT * FROM orders WHERE id='O013'").get();
    insert(f.db, "orders", {
      ...order,
      id: "CR21-O",
      code: "CR21-O",
      demand_id: "CR21-D",
      quantity_kg: 400000,
      cancelled_kg: 100000,
      start_at: "2026-11-01T00:00:00+08:00",
      finish_at: "2026-11-11T00:00:00+08:00",
    });
    const r = ok(
      await f.admin.req(
        "/api/planner/business?owner_id=ORG-N&start_date=2026-11-01&finish_date=2026-11-05",
      ),
    );
    assert.equal(r.quantity_tonnes, 450);
    assert.equal(r.daily_quantity, 90);
    assert.equal(r.verified_tonnes, 0);
    assert.equal(r.refs.length, 2);
    assert(r.excluded.length > 0);
    assert.equal(r.refs.find((x) => x.id === "CR21-D").quantity_tonnes, 300);
    assert.equal(r.refs.find((x) => x.id === "CR21-O").quantity_tonnes, 150);
    const b = await projectBody(f, {
      start_date: "2026-11-01",
      finish_date: "2026-11-05",
      use_business: true,
    });
    const p = await create(f, b);
    assert.equal(p.business_snapshot.quantity_tonnes, 450);
    assert.equal(
      (
        await f.admin.req(
          "/api/planner/business?owner_id=ORG-N&start_date=2026-02-30&finish_date=2026-03-02",
        )
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});
test("CR21 inventory excludes occupied, unsuitable and unknown-window resources, all owned inventory counted", async () => {
  const f = await fixture();
  try {
    const v = f.db.prepare("SELECT * FROM vehicles WHERE id='V001'").get();
    for (let i = 0; i < 110; i++)
      insert(f.db, "vehicles", {
        ...v,
        id: "CR21-V" + i,
        code: "CR21-V" + i,
        data: {
          compatibility: defaults.compatibility,
          available_window: "06:00—22:00",
        },
      });
    const p = await create(f),
      s = await calculate(f, p);
    assert.equal(s.inventory.vehicles.length, 121);
    assert(s.inventory.available_vehicles >= 110);
    f.db.prepare("UPDATE vehicles SET status='检修' WHERE id='V001'").run();
    const b = await projectBody(f, {
        start_date: new Date(Date.now() + 8 * 3600000)
          .toISOString()
          .slice(0, 10),
        finish_date: new Date(Date.now() + 8 * 3600000)
          .toISOString()
          .slice(0, 10),
      }),
      p2 = await create(f, b),
      s2 = await calculate(f, p2);
    assert(
      s2.inventory.vehicles
        .find((v) => v.id === "V001")
        .reasons.some((r) => r.includes("检修")),
    );
    assert(
      s2.inventory.vehicles.some((v) =>
        v.reasons.some((r) => r.includes("任务占用")),
      ),
    );
    assert.equal(
      s2.fleet.vehicle_gap,
      Math.max(0, s2.fleet.vehicles - s2.inventory.available_vehicles),
    );
  } finally {
    await f.close();
  }
});
test("CR21 station expansion, insufficient power, unknown conditions, charge-only batteries and phase monotonicity", async () => {
  const f = await fixture();
  try {
    const b = await projectBody(f);
    b.sites.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
    b.sites[0].station_id = "S001";
    b.sites[1].supply_kw = null;
    b.sites[1].land_verified = false;
    const p = await create(f, b),
      s = await calculate(f, p),
      a = s.sites.find((x) => x.id === "PL1"),
      other = s.sites.find((x) => x.id === "PL2");
    assert.equal(a.existing, 2);
    assert.equal(a.total, a.existing + a.added);
    assert.equal(
      a.required_power_kw,
      720 + a.added * b.conditions.device_power + 160,
    );
    assert(other.unknown.includes("接电容量"));
    assert.equal(other.status, "待核实");
    assert.equal(other.coverage_percent, null);
    assert.equal(other.detour_km, null);
    assert(s.phase_one.vehicles <= s.fleet.vehicles);
    assert(s.phase_one.chargers <= s.fleet.chargers);
    assert.equal(s.budget.battery_included, true);
    b.sites[0].supply_kw = 0;
    const bad = await calculate(f, await create(f, b));
    assert.equal(bad.sites.find((x) => x.id === "PL1").feasible, false);
    b.sites[0].station_id = "S002";
    const swap = await calculate(f, await create(f, b));
    assert(
      swap.sites
        .find((x) => x.id === "PL1")
        .issues.some((x) => x.includes("换电")),
    );
  } finally {
    await f.close();
  }
});
test("CR21 one adopted reference, version conflicts, archive state and no changes to execution resources", async () => {
  const f = await fixture();
  try {
    const tables = [
        "demands",
        "orders",
        "tasks",
        "charging",
        "vehicles",
        "drivers",
        "devices",
        "stations",
      ],
      before = tables.map((t) =>
        f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all(),
      );
    const p = await create(f),
      s = await calculate(f, p),
      adopt = (s) =>
        f.cmd("planner.adopt", s.id, {
          project_id: p.id,
          expected_version: p.version,
          solution_version: s.version,
          candidate_id: "PL1",
        });
    ok(await adopt(s));
    assert.equal((await read(f, p)).project.reference_id, s.id);
    assert.equal((await adopt(s)).statusCode, 409);
    const s2 = await calculate(f, p);
    ok(await adopt(s2));
    const all = await read(f, p);
    assert.equal(
      all.solutions.filter((s) => s.status === "已采用参考").length,
      1,
    );
    assert.equal(all.project.version, 1);
    assert.equal(
      (
        await f.cmd("planner.archive", s2.id, {
          project_id: p.id,
          expected_version: 1,
          solution_version: 2,
        })
      ).statusCode,
      422,
    );
    ok(
      await f.cmd("planner.archive", s.id, {
        project_id: p.id,
        expected_version: 1,
        solution_version: 3,
      }),
    );
    assert.equal(
      (await f.admin.req("/api/planner/handoff/" + s.id)).statusCode,
      409,
    );
    const h = ok(await f.admin.req("/api/planner/handoff/" + s2.id));
    assert.equal(h.conditions.daily_quantity, 2400);
    assert.equal(h.owner_id, p.owner_id);
    assert.equal(h.corridor, null);
    assert.deepEqual(
      tables.map((t) =>
        f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all(),
      ),
      before,
    );
  } finally {
    await f.close();
  }
});
test("CR21 validation rejects duplicate candidates, bad phase order and non-numeric conditions without writes", async () => {
  const f = await fixture();
  try {
    let b = await projectBody(f);
    b.sites.push(b.sites[0]);
    assert.equal((await f.cmd("planner.create", null, b)).statusCode, 422);
    b = await projectBody(f);
    b.conditions.phase_one_quantity = 3000;
    assert.equal((await f.cmd("planner.create", null, b)).statusCode, 422);
    b = await projectBody(f);
    b.conditions.daily_quantity = "2400";
    assert.equal((await f.cmd("planner.create", null, b)).statusCode, 422);
    assert.equal(ok(await f.admin.req("/api/planner/projects")).total, 0);
  } finally {
    await f.close();
  }
});

test("CR21 changed source resource blocks stale adoption and repeated reading does not create records", async () => {
  const f = await fixture();
  try {
    const p = await create(f),
      s = await calculate(f, p);
    f.db.prepare("UPDATE vehicles SET version=version+1 WHERE id='V001'").run();
    assert.equal(
      (
        await f.cmd("planner.adopt", s.id, {
          project_id: p.id,
          expected_version: p.version,
          solution_version: s.version,
          candidate_id: "PL1",
        })
      ).code,
      "STALE_RESOURCES",
    );
    const before = f.db.prepare("SELECT count(*) n FROM records").get().n;
    ok(await f.admin.req("/api/planner/projects"));
    ok(await f.admin.req("/api/planner/options"));
    await read(f, p);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM records").get().n,
      before,
    );
    const b = await projectBody(f);
    b.sites = [null];
    assert.equal((await f.cmd("planner.create", null, b)).statusCode, 422);
  } finally {
    await f.close();
  }
});
