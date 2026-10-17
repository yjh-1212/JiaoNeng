import test from "node:test";
import assert from "node:assert/strict";
import { database, transaction } from "../server/db.mjs";
import { seed } from "../server/seed.mjs";
import { createApp } from "../server/app.mjs";
import {
  scenarioDefaults,
  scenarioCommand,
  prepareScenario,
  explainScenario,
} from "../server/scenarios.mjs";
import {
  simulateScenario,
  validateInputs,
} from "../server/scenario-engine.mjs";
import { positionAt, stationAt } from "../client/simulation-playback.js";
const user = {
  id: "U-ADMIN",
  role: "admin",
  scopes: ["ORG-N", "ORG-S"],
  operations: ["*"],
};
const roads = async (points) => {
  const [a, z] = [points[0], points.at(-1)];
  return {
    coordinates: [a, [(a[0] + z[0]) / 2 + 0.003, (a[1] + z[1]) / 2 - 0.001], z],
    distance_m: Math.max(500, Math.hypot(z[0] - a[0], z[1] - a[1]) * 120000),
    source: "TEST_ROAD_GEOMETRY",
  };
};
function setup() {
  const db = database(":memory:");
  seed(db);
  const defaults = scenarioDefaults(db, user, "orders", "O013");
  return {
    db,
    defaults,
    save: (patch = {}) =>
      transaction(db, () =>
        scenarioCommand(db, user, "scenario.save", null, {
          source_resource: "orders",
          source_id: "O013",
          inputs: { ...defaults.inputs, ...patch },
        }),
      ),
  };
}
const context = async (f, patch = {}) => {
  const saved = f.save(patch);
  return prepareScenario(
    f.db,
    user,
    saved.id,
    { expected_version: saved.scenario.version },
    roads,
  );
};
test("all candidates conserve delivered mass, SOC and shared station capacity", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const p = await context(f);
  for (const c of p.result.candidates) {
    assert.equal(c.metrics.delivered_kg, p.inputs.quantity * 1000);
    assert.equal(
      c.vehicles.reduce((n, v) => n + v.quantity_kg, 0),
      p.inputs.quantity * 1000,
    );
    assert(c.metrics.charge_count > 0);
    for (const s of c.station_stats)
      for (let slot = 0; slot < s.slots; slot++) {
        const rows = s.timeline
          .filter((b) => b.slot === slot)
          .sort((a, b) => a.start_at.localeCompare(b.start_at));
        for (let n = 1; n < rows.length; n++)
          assert(rows[n].start_at >= rows[n - 1].finish_at);
      }
    for (const v of c.vehicles) {
      const delta = v.nodes.reduce(
        (sum, n) => sum + n.soc_end - n.soc_start,
        0,
      );
      assert(Math.abs(p.inputs.initial_soc + delta - v.soc) < 0.03);
      for (let n = 1; n < v.nodes.length; n++)
        assert(v.nodes[n].start_at >= v.nodes[n - 1].finish_at);
    }
  }
  assert.notDeepEqual(
    p.result.candidates[0].vehicles[1].nodes,
    p.result.candidates[2].vehicles[1].nodes,
  );
});
test("loading/unloading throughput and social traffic alter computed waits, not fixed cards", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const p = await context(f, {
    vehicle_count: 8,
    quantity: 300,
    include_external: false,
    loading_slots: 1,
    unloading_slots: 1,
  });
  const improved = simulateScenario(
    { ...p.inputs, loading_slots: 4, unloading_slots: 4 },
    p.result.routes,
    p.stations,
    p.background,
  );
  assert(
    improved.candidates[0].metrics.queue_minutes <
      p.result.candidates[0].metrics.queue_minutes,
  );
  const flow = await context(f, {
    vehicle_count: 2,
    include_external: false,
    initial_soc: 45,
  });
  const congested = simulateScenario(
    {
      ...flow.inputs,
      include_external: true,
      external_arrivals: 15,
      external_weight: 1,
    },
    flow.result.routes,
    flow.stations,
    flow.background,
  );
  assert(
    congested.candidates[0].metrics.charging_wait >
      flow.result.candidates[0].metrics.charging_wait,
  );
  assert(
    congested.candidates[0].station_stats.some((s) => s.external_arrivals > 0),
  );
});
test("low-SOC paths, impossible time windows and invalid configuration remain non-executable", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const p = await context(f, { initial_soc: 20 });
  assert(p.result.candidates.every((c) => !c.feasible));
  assert(
    p.result.candidates[0].violations.some((v) => v.kind === "ENERGY_ROUTE"),
  );
  const q = await context(f, {
    deadline: new Date(
      +new Date(f.defaults.inputs.start_at) + 20 * 60000,
    ).toISOString(),
  });
  assert(q.result.candidates.every((c) => !c.feasible));
  assert.throws(() =>
    validateInputs({ ...f.defaults.inputs, loading_slots: 1.5 }),
  );
  assert.throws(() => validateInputs({ ...f.defaults.inputs, target_soc: 10 }));
});
test("draft and scenario confirmation do not reserve source quantities or create execution objects", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const fingerprint = () =>
    ["demands", "orders", "tasks", "charging"].map((table) =>
      f.db.prepare("SELECT * FROM " + table + " ORDER BY id").all(),
    );
  const before = fingerprint(),
    p = await context(f, { quantity: 60, initial_soc: 60 });
  let run = transaction(f.db, () =>
    scenarioCommand(
      f.db,
      user,
      "scenario.run",
      p.scene.id,
      { expected_version: p.scene.version },
      p,
    ),
  );
  assert.deepEqual(fingerprint(), before);
  const confirmed = transaction(f.db, () =>
    scenarioCommand(f.db, user, "scenario.confirm", run.id, {
      expected_version: run.scenario.version,
      candidate_id: "A",
    }),
  );
  assert(confirmed.scenario.confirmed);
  assert.deepEqual(fingerprint(), before);
  const ids = ["V008", "V009"];
  const mappings = confirmed.scenario.result.candidates[0].vehicles.map(
    (v, n) => ({ sim_vehicle_id: v.id, vehicle_id: ids[n] }),
  );
  const created = transaction(f.db, () =>
    scenarioCommand(f.db, user, "scenario.dispatch", run.id, {
      expected_version: confirmed.scenario.version,
      mappings,
    }),
  );
  assert.equal(created.ids.length, 2);
  assert(
    f.db.prepare("SELECT status FROM tasks WHERE id=?").get(created.ids[0])
      .status === "待派发",
  );
  assert.equal(
    f.db
      .prepare("SELECT sum(quantity_kg) n FROM tasks WHERE simulation_id=?")
      .get(created.scenario.simulation_id).n,
    60000,
  );
  assert.throws(() =>
    transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.dispatch", run.id, {
        expected_version: created.scenario.version,
        mappings,
      }),
    ),
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM tasks WHERE simulation_id=?")
      .get(created.scenario.simulation_id).n,
    2,
  );
});
test("demand conversion is an explicit atomic action; mapping conflicts roll back the order too", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const d = scenarioDefaults(f.db, user, "demands", "DM8");
  const initial = f.db
    .prepare("SELECT allocated_kg FROM demands WHERE id=?")
    .get("DM8").allocated_kg;
  const saved = transaction(f.db, () =>
    scenarioCommand(f.db, user, "scenario.save", null, {
      source_resource: "demands",
      source_id: "DM8",
      inputs: { ...d.inputs, quantity: 60, vehicle_count: 1, initial_soc: 60 },
    }),
  );
  const p = await prepareScenario(
      f.db,
      user,
      saved.id,
      { expected_version: saved.scenario.version },
      roads,
    ),
    run = transaction(f.db, () =>
      scenarioCommand(
        f.db,
        user,
        "scenario.run",
        saved.id,
        { expected_version: saved.scenario.version },
        p,
      ),
    ),
    confirmed = transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.confirm", saved.id, {
        expected_version: run.scenario.version,
        candidate_id: "A",
      }),
    );
  assert.equal(
    f.db.prepare("SELECT allocated_kg FROM demands WHERE id=?").get("DM8")
      .allocated_kg,
    initial,
  );
  const count = f.db.prepare("SELECT count(*) n FROM orders").get().n;
  assert.throws(() =>
    transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.dispatch", saved.id, {
        expected_version: confirmed.scenario.version,
        mappings: [{ sim_vehicle_id: "SIM-01", vehicle_id: "V008" }],
      }),
    ),
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM orders").get().n, count);
  assert.equal(
    f.db.prepare("SELECT allocated_kg FROM demands WHERE id=?").get("DM8")
      .allocated_kg,
    initial,
  );
});
test("source version changes invalidate results before confirmation or execution", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const p = await context(f);
  f.db.prepare("UPDATE orders SET version=version+1 WHERE id=?").run("O013");
  assert.throws(
    () =>
      transaction(f.db, () =>
        scenarioCommand(
          f.db,
          user,
          "scenario.run",
          p.scene.id,
          { expected_version: p.scene.version },
          p,
        ),
      ),
    { code: "STALE_SOURCE" },
  );
});
test("DeepSeek consumes bounded numeric evidence; rejects fabricated feasible IDs and unsafe patches", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const p = await context(f);
  let facts;
  const model = async (url, o) => {
    const payload = JSON.parse(o.body);
    facts = JSON.parse(payload.messages[1].content);
    assert.equal(payload.thinking.type, "disabled");
    return Response.json({
      model: "TEST_DEEPSEEK_DOUBLE",
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "模拟分析",
              recommended_id: "A",
              reasons: ["约束通过"],
              suggestions: [
                {
                  label: "调整",
                  patch: { vehicle_count: 3, foo: "execute", target_soc: 500 },
                },
              ],
            }),
          },
        },
      ],
    });
  };
  const ai = await explainScenario(
    { deepseekKey: "test-key", deepseekModel: "test-double" },
    p.result,
    p.inputs,
    model,
  );
  assert.equal(ai.status, "ready");
  assert.deepEqual(ai.suggestions[0].patch, { vehicle_count: 3 });
  assert(!JSON.stringify(facts).includes("origin"));
  assert(!JSON.stringify(facts).includes("driver_id"));
  const invalid = await explainScenario(
    { deepseekKey: "test-key" },
    p.result,
    p.inputs,
    async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "虚构",
                recommended_id: "FAKE",
              }),
            },
          },
        ],
      }),
  );
  assert.equal(invalid.status, "unavailable");
});
test("playback interpolates along road geometry, with SOC and station queues on the same clock", () => {
  const car = {
      start_at: "2026-10-16T00:00:00Z",
      nodes: [
        {
          kind: "drive",
          start_at: "2026-10-16T00:00:00Z",
          finish_at: "2026-10-16T01:00:00Z",
          path_key: "direct",
          soc_start: 80,
          soc_end: 60,
        },
      ],
    },
    inputs = {
      origin: { lng: 107, lat: 35 },
      destination: { lng: 108, lat: 36 },
      initial_soc: 80,
    },
    roads = {
      direct: {
        coordinates: [
          [107, 35],
          [107, 36],
          [108, 36],
        ],
      },
    };
  const state = positionAt(
    car,
    +new Date("2026-10-16T00:30:00Z"),
    roads,
    inputs,
    [],
  );
  assert.equal(state.soc, 70);
  assert(state.position[1] > 35.9);
  assert(state.position[0] < 107.5);
  const returned = {
    ...car,
    finish_at: car.nodes[0].finish_at,
    nodes: [{ ...car.nodes[0], kind: "return", path_key: "back" }],
  };
  const back = {
    ...roads,
    back: {
      coordinates: [
        [108, 36],
        [107, 35],
      ],
    },
  };
  const ended = +new Date("2026-10-16T02:00:00Z");
  assert.deepEqual(
    positionAt(returned, ended, back, inputs, []).position,
    [107, 35],
  );
  const blocked = positionAt(
    { ...returned, blocked: true },
    ended,
    back,
    inputs,
    [],
  );
  assert.equal(blocked.kind, "blocked");
  assert.deepEqual(blocked.position, [107, 35]);
  assert.equal(
    stationAt(
      {
        timeline: [
          {
            start_at: "2026-10-16T00:00:00Z",
            finish_at: "2026-10-16T01:00:00Z",
            arrival_at: "2026-10-16T00:00:00Z",
            kind: "external",
          },
        ],
      },
      +new Date("2026-10-16T00:30:00Z"),
    ).external,
    1,
  );
});

test("demand manual generation allocates exactly once and generated tasks pass the existing dispatch validator", async (t) => {
  const f = setup();
  t.after(() => f.db.close());
  const defaults = scenarioDefaults(f.db, user, "demands", "DM1"),
    before = f.db
      .prepare("SELECT allocated_kg FROM demands WHERE id=?")
      .get("DM1").allocated_kg;
  const saved = transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.save", null, {
        source_resource: "demands",
        source_id: "DM1",
        inputs: {
          ...defaults.inputs,
          quantity: 30,
          vehicle_count: 1,
          initial_soc: 60,
          // Use a business morning so the dispatch case is independent of the test runner's clock.
          start_at: defaults.inputs.start_at.slice(0, 10) + "T08:00:00+08:00",
          deadline: defaults.inputs.start_at.slice(0, 10) + "T20:00:00+08:00",
        },
      }),
    ),
    p = await prepareScenario(
      f.db,
      user,
      saved.id,
      { expected_version: saved.scenario.version },
      roads,
    ),
    run = transaction(f.db, () =>
      scenarioCommand(
        f.db,
        user,
        "scenario.run",
        saved.id,
        { expected_version: saved.scenario.version },
        p,
      ),
    ),
    confirmed = transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.confirm", saved.id, {
        expected_version: run.scenario.version,
        candidate_id: "A",
      }),
    );
  const created = transaction(f.db, () =>
    scenarioCommand(f.db, user, "scenario.dispatch", saved.id, {
      expected_version: confirmed.scenario.version,
      mappings: [{ sim_vehicle_id: "SIM-01", vehicle_id: "V008" }],
    }),
  );
  assert.equal(
    f.db.prepare("SELECT allocated_kg FROM demands WHERE id=?").get("DM1")
      .allocated_kg,
    before + 30000,
  );
  assert.equal(created.ids.length, 1);
  const { transportCommand } = await import("../server/transport.mjs");
  const task = f.db
    .prepare("SELECT id,version FROM tasks WHERE id=?")
    .get(created.ids[0]);
  assert(
    transaction(f.db, () =>
      transportCommand(f.db, user, "dispatch.validate", null, {
        items: [{ id: task.id, expected_version: task.version }],
      }),
    ).validated,
  );
});
test("HTTP scenario commands enforce roles/CSRF, stay idempotent, and never create tasks during AI computation", async (t) => {
  const db = database(":memory:");
  let modelCalls = 0,
    roadCalls = 0;
  const { app } = createApp({
      db,
      config: {
        amapService: "test-map-key",
        mapIntervalMs: 0,
        deepseekKey: "test-model-key",
        deepseekModel: "test-model",
      },
      mapFetch: async (u) => {
        roadCalls++;
        const q = new URL(u),
          a = q.searchParams.get("origin").split(",").map(Number),
          z = q.searchParams.get("destination").split(",").map(Number);
        return Response.json({
          status: "1",
          route: {
            paths: [
              {
                distance: "2000",
                cost: { duration: "300" },
                steps: [
                  {
                    polyline: [
                      a,
                      [(a[0] + z[0]) / 2 + 0.0001, (a[1] + z[1]) / 2],
                      z,
                    ]
                      .map((p) => p.join(","))
                      .join(";"),
                  },
                ],
              },
            ],
          },
        });
      },
      modelFetch: async (u, o) => {
        modelCalls++;
        const data = JSON.parse(o.body);
        assert(!data.messages[1].content.includes("联系人"));
        return Response.json({
          model: "TEST_DOUBLE",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "模拟依据分析",
                  recommended_id: "A",
                  reasons: [],
                  suggestions: [],
                }),
              },
            },
          ],
        });
      },
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const login = async (username) => {
    const r = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "JiaoNeng2026!" }),
      }),
      d = await r.json();
    return {
      Cookie: r.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": d.csrf,
    };
  };
  const admin = await login("admin"),
    north = await login("north"),
    driver = await login("driver01");
  const cmd = async (headers, type, id, payload, key = crypto.randomUUID()) => {
    const r = await fetch(base + "/api/commands", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ type, id, payload }),
    });
    return { status: r.status, ...(await r.json()) };
  };
  const defaults = scenarioDefaults(db, user, "orders", "O013"),
    body = {
      source_resource: "orders",
      source_id: "O013",
      inputs: { ...defaults.inputs, quantity: 60, initial_soc: 60 },
    };
  assert.equal((await cmd(north, "scenario.save", null, body)).status, 403);
  assert.equal((await cmd(driver, "scenario.save", null, body)).status, 403);
  const noCsrf = { Cookie: admin.Cookie };
  assert.equal((await cmd(noCsrf, "scenario.save", null, body)).status, 403);
  const saved = await cmd(admin, "scenario.save", null, body);
  assert.equal(saved.status, 200);
  const count = db.prepare("SELECT count(*) n FROM tasks").get().n,
    key = crypto.randomUUID(),
    run = await cmd(
      admin,
      "scenario.run",
      saved.id,
      { expected_version: saved.scenario.version },
      key,
    );
  assert.equal(run.status, 200);
  assert.equal(run.scenario.result.ai.status, "ready");
  assert.equal(modelCalls, 1);
  const replay = await cmd(
    admin,
    "scenario.run",
    saved.id,
    { expected_version: saved.scenario.version },
    key,
  );
  assert.equal(replay.scenario.version, run.scenario.version);
  assert.equal(modelCalls, 1);
  assert.equal(db.prepare("SELECT count(*) n FROM tasks").get().n, count);
  const denied = await fetch(
    base + "/api/resources/simulation-scenarios/" + saved.id,
    { headers: driver },
  );
  assert.equal(denied.status, 403);
  const current = await fetch(
    base + "/api/scenarios/current?source_resource=orders&source_id=O013",
    { headers: admin },
  );
  assert.equal((await current.json()).scenario.id, saved.id);
  assert(roadCalls > 0);
});
