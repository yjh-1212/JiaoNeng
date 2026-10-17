import test from "node:test";
import assert from "node:assert/strict";
import { database, transaction } from "../server/db.mjs";
import { seed } from "../server/seed.mjs";
import { get } from "../server/repository.mjs";
import {
  scenarioDefaults,
  scenarioCommand,
  prepareScenario,
  availableScenarioFleet,
} from "../server/scenarios.mjs";
import { solveTransportGoal, validateGoal } from "../server/scenario-goals.mjs";
import {
  parseScenarioAdjustment,
  scenarioGuide,
  conversationHistory,
} from "../server/scenario-adjustments.mjs";
import { createApp } from "../server/app.mjs";
import { transportCommand } from "../server/transport.mjs";
const user = {
  id: "U-ADMIN",
  role: "admin",
  scopes: ["ORG-N", "ORG-S"],
  operations: ["*"],
};
const roads = async ([a, z]) => ({
  coordinates: [a, [(a[0] + z[0]) / 2 + 0.001, (a[1] + z[1]) / 2 + 0.001], z],
  distance_m: 1000,
  source: "TEST_ROAD",
});
function fixture() {
  const db = database(":memory:");
  seed(db);
  const defaults = scenarioDefaults(db, user, "orders", "O013");
  const inputs = {
    ...defaults.inputs,
    goal: "deadline",
    resource_mode: "reference",
    vehicle_limit: 6,
    vehicle_count: 2,
    initial_soc: 80,
    station_ids: [],
    include_external: false,
  };
  const save = (patch = {}, resource = "orders", id = "O013") =>
    transaction(db, () =>
      scenarioCommand(db, user, "scenario.save", null, {
        source_resource: resource,
        source_id: id,
        inputs: { ...inputs, ...patch },
      }),
    );
  const cmd = (scene, type, body = {}) =>
    transaction(db, () =>
      scenarioCommand(db, user, type, scene.id, {
        expected_version: scene.version,
        ...body,
      }),
    );
  const run = async (saved) => {
    const p = await prepareScenario(
      db,
      user,
      saved.id,
      { expected_version: saved.scenario.version },
      roads,
    );
    return transaction(db, () =>
      scenarioCommand(
        db,
        user,
        "scenario.run",
        saved.id,
        { expected_version: saved.scenario.version },
        p,
      ),
    ).scenario;
  };
  return { db, inputs, save, cmd, run };
}

test("goal search exhausts declared counts, tighter deadlines need more vehicles, cost option meets constraints", (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const i = f.inputs,
    start = +new Date(i.start_at),
    network = {
      direct: {
        distance_m: 1000,
        coordinates: [
          [107, 35],
          [107.1, 35.1],
          [107.2, 35.2],
        ],
      },
      back: {
        distance_m: 1000,
        coordinates: [
          [107.2, 35.2],
          [107.1, 35.1],
          [107, 35],
        ],
      },
    };
  const solve = (hours) =>
      solveTransportGoal(
        { ...i, deadline: new Date(start + hours * 3600000).toISOString() },
        network,
        [],
        [],
        [],
      ),
    loose = solve(7),
    tight = solve(3);
  assert.equal(loose.search.min_feasible_vehicles, 1);
  assert(
    tight.search.min_feasible_vehicles > loose.search.min_feasible_vehicles,
  );
  assert.equal(tight.search.evaluated, 18);
  assert(tight.candidates.some((c) => c.feasible));
  assert(
    new Set(tight.candidates.map((c) => c.signature)).size ===
      tight.candidates.length,
  );
  for (const c of tight.candidates.filter((c) => c.feasible)) {
    assert.equal(c.metrics.delivered_kg, 300000);
    assert(new Date(c.metrics.finish_at) <= new Date(start + 3 * 3600000));
    assert(c.metrics.unit_cost_cents > 0);
  }
  const current = validateGoal({ ...i, goal: "existing", deadline: undefined });
  assert.equal(+new Date(current.deadline) - start, 7 * 86400000);
  assert.throws(() => validateGoal({ ...i, goal: "bad" }));
  assert.throws(() =>
    validateGoal({ ...i, vehicle_limit: 1, vehicle_count: 2 }),
  );
});

test("direct trial, confirmation and parsing never create business objects; final creation is explicit and atomic", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const count = () =>
      Object.fromEntries(
        ["demands", "orders", "tasks"].map((n) => [
          n,
          f.db.prepare("SELECT count(*) n FROM " + n).get().n,
        ]),
      ),
    before = count();
  const saved = f.save(
      { quantity: 60, initial_soc: 60, goal: "existing" },
      "manual",
      "ORG-N",
    ),
    scene = await f.run(saved);
  assert.deepEqual(count(), before);
  assert(scene.result.candidates[0].feasible);
  const confirmed = f.cmd(scene, "scenario.confirm", {
    candidate_id: scene.result.recommended_id,
  }).scenario;
  assert.deepEqual(count(), before);
  const mappings = confirmed.result.candidates
    .find((c) => c.id === confirmed.selected)
    .vehicles.map((v, n) => ({
      sim_vehicle_id: v.id,
      vehicle_id: ["V001", "V002"][n],
    }));
  assert.throws(() => f.cmd(confirmed, "scenario.dispatch", { mappings }));
  assert.throws(() =>
    f.cmd(confirmed, "scenario.dispatch", {
      mappings: mappings.map((x) => ({ ...x, vehicle_id: "V013" })),
      create_execution: true,
    }),
  );
  assert.deepEqual(count(), before);
  const generated = f.cmd(confirmed, "scenario.dispatch", {
    mappings,
    create_execution: true,
  }).scenario;
  assert.equal(count().demands, before.demands + 1);
  assert.equal(count().orders, before.orders + 1);
  assert.equal(count().tasks, before.tasks + 2);
  const tasks = generated.generated_task_ids.map((id) =>
    get(f.db, user, "tasks", id),
  );
  const validation = transaction(f.db, () =>
    transportCommand(f.db, user, "dispatch.validate", null, {
      items: tasks.map((v) => ({ id: v.id, expected_version: v.version })),
    }),
  );
  assert.equal(validation.validated, true, JSON.stringify(validation));
  assert.equal(
    f.db
      .prepare("SELECT allocated_kg FROM demands WHERE id=?")
      .get(generated.execution_source_ref.id).allocated_kg,
    60000,
  );
  assert.throws(() =>
    f.cmd(generated, "scenario.dispatch", { mappings, create_execution: true }),
  );
});

test("final delivery does not demand an unnecessary empty return, and replenishment remains reachable over repeated trips", (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const path = {
      coordinates: [
        [107, 35],
        [107.1, 35.1],
        [107.2, 35.2],
      ],
      distance_m: 20000,
    },
    one = solveTransportGoal(
      {
        ...f.inputs,
        goal: "existing",
        quantity: 30,
        vehicle_count: 1,
        initial_soc: 30,
      },
      { direct: path, back: path },
      [],
      [],
      [],
    );
  assert(one.candidates[0].feasible);
  assert(one.candidates[0].vehicles[0].nodes.every((n) => n.soc_end >= 20));
  const network = {
      direct: path,
      back: path,
      origin_S: { ...path, distance_m: 50000 },
      S_destination: { ...path, distance_m: 5000 },
      destination_S: { ...path, distance_m: 5000 },
      S_origin: path,
    },
    station = {
      id: "S",
      name: "模拟补能站",
      slots: 2,
      occupied: 0,
      mode: "充电",
      power_kw: 360,
      window: "00:00-24:00",
    },
    repeated = solveTransportGoal(
      {
        ...f.inputs,
        goal: "existing",
        quantity: 300,
        vehicle_count: 2,
        initial_soc: 65,
        station_ids: ["S"],
      },
      network,
      [station],
      [],
      [],
    );
  assert(repeated.candidates.some((c) => c.feasible));
  for (const c of repeated.candidates.filter((c) => c.feasible))
    for (const v of c.vehicles)
      assert(v.nodes.every((n) => n.soc_end >= 20 - 0.01));
});

test("manual trial links an existing matching order, protects its version and rejects mismatched freight", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const order = get(f.db, user, "orders", "O013"),
    saved = f.save(
      { quantity: 60, initial_soc: 60, goal: "existing" },
      "manual",
      "ORG-N",
    ),
    scene = await f.run(saved),
    confirmed = f.cmd(scene, "scenario.confirm", {
      candidate_id: scene.result.recommended_id,
    }).scenario,
    mappings = confirmed.result.candidates
      .find((c) => c.id === confirmed.selected)
      .vehicles.map((v, n) => ({
        sim_vehicle_id: v.id,
        vehicle_id: ["V001", "V002"][n],
      })),
    before = f.db.prepare("SELECT count(*) n FROM orders").get().n;
  assert.throws(() =>
    f.cmd(confirmed, "scenario.dispatch", {
      mappings,
      execution_source: {
        resource: "orders",
        id: order.id,
        expected_version: 0,
      },
    }),
  );
  assert.throws(() =>
    f.cmd(confirmed, "scenario.dispatch", {
      mappings,
      execution_source: { resource: "orders", id: "O014", expected_version: 1 },
    }),
  );
  f.cmd(confirmed, "scenario.dispatch", {
    mappings,
    execution_source: {
      resource: "orders",
      id: order.id,
      expected_version: order.version,
    },
  });
  assert.equal(f.db.prepare("SELECT count(*) n FROM orders").get().n, before);
  assert.equal(
    f.db
      .prepare("SELECT sum(quantity_kg) n FROM tasks WHERE order_id=?")
      .get(order.id).n,
    60000,
  );
});

test("actual fleet is scoped and filtered; resource changes invalidate committed results and mappings", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const inputs = {
      ...f.inputs,
      initial_soc: 60,
      quantity: 60,
      goal: "existing",
      resource_mode: "actual",
    },
    fleet = availableScenarioFleet(f.db, user, inputs, "ORG-N", []);
  assert(fleet.length >= 2);
  assert(fleet.every((v) => v.owner_id === "ORG-N"));
  assert.throws(() =>
    scenarioDefaults(f.db, { ...user, scopes: ["ORG-N"] }, "manual", "ORG-S"),
  );
  const saved = f.save(inputs),
    p = await prepareScenario(
      f.db,
      user,
      saved.id,
      { expected_version: 1 },
      roads,
    );
  f.db
    .prepare("UPDATE vehicles SET version=version+1 WHERE id=?")
    .run(p.fleet[0].id);
  assert.throws(
    () =>
      transaction(f.db, () =>
        scenarioCommand(
          f.db,
          user,
          "scenario.run",
          saved.id,
          { expected_version: 1 },
          p,
        ),
      ),
    /运力/,
  );
  const scene = await f.run(saved),
    confirmed = f.cmd(scene, "scenario.confirm", {
      candidate_id: scene.result.recommended_id,
    }).scenario,
    ref = confirmed.resource_versions[0];
  f.db.prepare("UPDATE vehicles SET version=version+1 WHERE id=?").run(ref.id);
  const mappings = confirmed.result.candidates
    .find((c) => c.id === confirmed.selected)
    .vehicles.map((v, n) => ({
      sim_vehicle_id: v.id,
      vehicle_id: confirmed.resource_versions[n].id,
    }));
  assert.throws(
    () => f.cmd(confirmed, "scenario.dispatch", { mappings }),
    /运力/,
  );
});

test("no available fleet or impossible deadlines explain a genuine lack of feasible plans", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const start = +new Date(f.inputs.start_at),
    saved = f.save({
      deadline: new Date(start + 5 * 60000).toISOString(),
      vehicle_limit: 6,
    }),
    scene = await f.run(saved);
  assert.equal(scene.result.recommended_id, null);
  assert.equal(scene.result.no_solution.delivered_kg, 0);
  assert(scene.result.no_solution.remaining_kg > 0);
  assert.throws(() =>
    f.cmd(scene, "scenario.confirm", {
      candidate_id: scene.result.candidates[0].id,
    }),
  );
  f.db
    .prepare("UPDATE vehicles SET status='停用' WHERE owner_id='ORG-N'")
    .run();
  const empty = await f.run(f.save({ resource_mode: "actual" }));
  assert.equal(empty.result.candidates.length, 0);
  assert.match(empty.result.no_solution.reasons[0], /没有/);
});

test("DeepSeek adjustment preview is bounded, rejects unknown fields and preserves selected baseline and data", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const scene = await f.run(f.save({ goal: "existing" })),
    count = f.db.prepare("SELECT count(*) n FROM tasks").get().n;
  let sent;
  const config = { deepseekKey: "test-double", deepseekModel: "test-double" },
    reply = (patch) => async (url, o) => {
      sent = JSON.parse(o.body);
      return Response.json({
        model: "TEST_DOUBLE",
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "调整车数",
                patch,
                unsupported: [],
              }),
            },
          },
        ],
      });
    };
  const preview = await parseScenarioAdjustment(
    config,
    scene,
    "减少1辆车",
    reply({ goal: "existing", vehicle_count: 1 }),
  );
  assert.equal(preview.status, "ready");
  assert.equal(preview.patch.vehicle_count, 1);
  assert(preview.changes.some((c) => c.field === "vehicle_count"));
  assert.equal(sent.response_format.type, "json_object");
  assert(!JSON.stringify(sent).includes("origin_coords"));
  assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, count);
  await assert.rejects(
    () =>
      parseScenarioAdjustment(
        config,
        scene,
        "自动派单",
        reply({ owner_id: "ORG-S" }),
      ),
    /不允许/,
  );
  await assert.rejects(
    () =>
      parseScenarioAdjustment(
        config,
        scene,
        "改成999辆",
        reply({ vehicle_count: 999 }),
      ),
    /车辆/,
  );
  await assert.rejects(
    () =>
      parseScenarioAdjustment(config, scene, "再试", async () =>
        Response.json({}, { status: 503 }),
      ),
    /不可用/,
  );
  const oldVersion = scene.version,
    oldFinish = scene.result.candidates.find((c) => c.id === scene.selected)
      .metrics.finish_at,
    updated = transaction(f.db, () =>
      scenarioCommand(f.db, user, "scenario.save", scene.id, {
        source_resource: "orders",
        source_id: "O013",
        expected_version: oldVersion,
        inputs: { ...scene.inputs, goal: "existing", vehicle_count: 1 },
      }),
    );
  const next = await f.run(updated);
  assert.equal(next.result.previous_summary.finish_at, oldFinish);
  assert.equal(next.result.previous_summary.vehicle_count, 2);
});

test("new HTTP fleet and adjustment endpoints enforce roles, CSRF and source versions", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const { app } = createApp({
      db: f.db,
      config: { deepseekKey: "fake", deepseekModel: "test-double" },
      modelFetch: async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "请先确认货量和运输目标，当前没有执行任何业务。",
                  summary: "原条件",
                  patch: {},
                  unsupported: ["请说明目标"],
                }),
              },
            },
          ],
        }),
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
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
        "Content-Type": "application/json",
      };
    },
    admin = await login("admin"),
    driver = await login("driver01"),
    post = (url, headers, body) =>
      fetch(base + url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
  assert.equal(
    (
      await post("/api/scenarios/fleet", driver, {
        source_resource: "manual",
        source_id: "ORG-N",
        inputs: f.inputs,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        "/api/scenarios/fleet",
        { Cookie: admin.Cookie, "Content-Type": "application/json" },
        { source_resource: "orders", source_id: "O013", inputs: f.inputs },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/api/scenarios/fleet", admin, {
        source_resource: "orders",
        source_id: "O013",
        inputs: f.inputs,
      })
    ).status,
    200,
  );
  const guideBody = {
    source_resource: "manual",
    source_id: "ORG-N",
    question: "怎么开始",
    inputs: { quantity: 100, goal: "existing" },
  };
  assert.equal(
    (await post("/api/scenarios/chat", driver, guideBody)).status,
    403,
  );
  assert.equal(
    (
      await post(
        "/api/scenarios/chat",
        { Cookie: admin.Cookie, "Content-Type": "application/json" },
        guideBody,
      )
    ).status,
    403,
  );
  assert.equal((await post("/api/scenarios/chat", {}, guideBody)).status, 401);
  assert.equal(
    (
      await post("/api/scenarios/chat", admin, {
        ...guideBody,
        source_id: "ORG-NOT-ALLOWED",
      })
    ).status,
    403,
  );
  assert.equal(
    (await post("/api/scenarios/chat", admin, guideBody)).status,
    200,
  );
  const scene = await f.run(f.save());
  const storedBefore = f.db
    .prepare("SELECT data FROM records WHERE id=?")
    .get(scene.id).data;
  const chatBody = {
    scenario_id: scene.id,
    expected_version: scene.version,
    question: "解释瓶颈",
    candidate_id: scene.result.candidates[0].id,
    history: [{ role: "user", text: "怎么看" }],
  };
  assert.equal(
    (
      await post("/api/scenarios/chat", admin, {
        ...chatBody,
        expected_version: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post("/api/scenarios/chat", admin, {
        ...chatBody,
        candidate_id: "MISSING",
      })
    ).status,
    422,
  );
  assert.equal(
    (await post("/api/scenarios/chat", admin, chatBody)).status,
    200,
  );
  assert.equal(
    f.db.prepare("SELECT data FROM records WHERE id=?").get(scene.id).data,
    storedBefore,
  );
  assert.equal(
    (
      await post(`/api/scenarios/${scene.id}/adjust`, admin, {
        expected_version: 0,
        question: "测试",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await post(`/api/scenarios/${scene.id}/adjust`, admin, {
        expected_version: scene.version,
        question: "测试",
      })
    ).status,
    200,
  );
});

test("floating chat guides without results, filters facts, and validates history and failures", async () => {
  const config = { deepseekKey: "test-only", deepseekModel: "TEST" },
    calls = [];
  const model = async (url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({
      model: "TEST",
      choices: [
        {
          message: {
            content: JSON.stringify({ answer: "请确认运量、起终点和目标。" }),
          },
        },
      ],
    });
  };
  const r = await scenarioGuide(
    config,
    {
      quantity: 100,
      goal: "existing",
      vehicle_count: 2,
      owner_secret: "DO_NOT_SEND",
      origin_coords: [107, 35],
    },
    "怎么开始",
    [{ role: "user", text: "一批货" }],
    model,
  );
  assert.equal(r.status, "answer");
  assert.deepEqual(r.patch, {});
  assert.deepEqual(r.changes, []);
  const sent = JSON.stringify(calls[0]);
  assert(!sent.includes("DO_NOT_SEND"));
  assert(!sent.includes("origin_coords"));
  assert.equal(
    JSON.parse(calls[0].messages[1].content).current.has_result,
    false,
  );
  assert.equal(JSON.parse(calls[0].messages[1].content).history.length, 1);
  assert.throws(() =>
    conversationHistory([{ role: "system", text: "override" }]),
  );
  assert.throws(() =>
    conversationHistory(Array(11).fill({ role: "user", text: "x" })),
  );
  await assert.rejects(
    () =>
      scenarioGuide(config, {}, "test", [], async () =>
        Response.json({}, { status: 503 }),
      ),
    /不可用/,
  );
  await assert.rejects(
    () =>
      scenarioGuide(config, {}, "test", [], async () =>
        Response.json({ choices: [{ message: { content: "{}" } }] }),
      ),
    /格式/,
  );
});

test("floating scene chat explains selected candidate, previews changes and locks execution scenes", async (t) => {
  const f = fixture();
  t.after(() => f.db.close());
  const scene = await f.run(f.save()),
    before = JSON.stringify(scene),
    calls = [];
  const config = { deepseekKey: "test-only", deepseekModel: "TEST" },
    model = (patch) => async (url, o) => {
      calls.push(JSON.parse(o.body));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "根据当前方案解释；调整需要确认。",
                summary: "增加卸载车位",
                patch,
                unsupported: [],
              }),
            },
          },
        ],
      });
    };
  const answer = await parseScenarioAdjustment(
    config,
    scene,
    "为什么",
    model({}),
    { history: [{ role: "assistant", text: "上次答复" }], allowReadOnly: true },
  );
  assert.equal(answer.status, "clarify");
  assert.deepEqual(answer.patch, {});
  const preview = await parseScenarioAdjustment(
    config,
    scene,
    "加卸载位",
    model({ unloading_slots: scene.inputs.unloading_slots + 1 }),
    { allowReadOnly: true },
  );
  assert.equal(preview.status, "ready");
  assert.equal(preview.expected_version, scene.version);
  assert.equal(JSON.stringify(scene), before);
  const locked = await parseScenarioAdjustment(
    config,
    { ...scene, generated_task_ids: ["SIMULATED-TASK"] },
    "加卸载位",
    model({ unloading_slots: scene.inputs.unloading_slots + 1 }),
    { allowReadOnly: true },
  );
  assert.equal(locked.status, "answer");
  assert.deepEqual(locked.patch, {});
  assert(locked.unsupported[0].includes("已生成任务"));
  assert.equal(
    JSON.parse(calls[0].messages[1].content).history[0].role,
    "assistant",
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, 16);
});
