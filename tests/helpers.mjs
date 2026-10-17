import assert from "node:assert/strict";
import { database } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
export async function fixture({ agentModelFetch } = {}) {
  const db = database(":memory:"),
    calls = [];
  const modelFetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (agentModelFetch && payload.messages?.[0]?.content?.includes("只返回JSON {answer,summary,patch")) {
      const context = JSON.parse(payload.messages[1].content);
      calls.push(context);
      return agentModelFetch(url, options, context);
    }
    if (payload.messages?.[0]?.content?.includes("交能AI中心")) {
      const context = JSON.parse(payload.messages[1].content);
      calls.push(context);
      if (agentModelFetch) return agentModelFetch(url, options, context);
      return Response.json({
        model: "test-agent-double",
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer:
                  "隔离测试替身：已读取当前主体业务资料，请按引用记录核对。",
                draft: {},
              }),
            },
          },
        ],
      });
    }
    const context = JSON.parse(
      payload.messages[0].content.split("\n").slice(1).join("\n"),
    );
    calls.push(context);
    if (payload.messages[1].content.includes("TEST_SERVICE_FAILURE"))
      return new Response("{}", { status: 503 });
    const refs = [
      ...context.orders,
      ...context.forecasts,
      ...context.planning,
      ...context.alerts,
    ];
    return Response.json({
      model: "test-model-double",
      choices: [
        {
          message: {
            content: `本次为仿真测试资料，已核验交付量 ${context.summary.verified_tonnes} 吨。依据 ${refs.map((r) => r.code).join("、")}；缺失信息需要核实，不执行业务或设备操作。`,
          },
        },
      ],
    });
  };
  const { app } = createApp({
      db,
      config: {
        deepseekKey: "test-double-not-a-real-key",
        deepseekModel: "test-model-double",
      },
      modelFetch,
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port,
    sessions = new Map();
  const login = async (username) => {
    if (sessions.has(username)) return sessions.get(username);
    const r = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: "JiaoNeng2026!" }),
      }),
      data = await r.json();
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie").split(";")[0],
      session = {
        cookie,
        csrf: data.csrf,
        async req(path, body, method = body ? "POST" : "GET", key) {
          const response = await fetch(base + path, {
            method,
            headers: {
              Cookie: cookie,
              "Content-Type": "application/json",
              "X-CSRF-Token": data.csrf,
              ...(key ? { "Idempotency-Key": key } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
          });
          return { statusCode: response.status, ...(await response.json()) };
        },
        cmd(type, id, payload = {}, key = crypto.randomUUID()) {
          return this.req("/api/commands", { type, id, payload }, "POST", key);
        },
      };
    sessions.set(username, session);
    return session;
  };
  const admin = await login("admin");
  return {
    db,
    app,
    server,
    base,
    calls,
    admin,
    login,
    get: (resource, id) => admin.req("/api/resources/" + resource + "/" + id),
    cmd: (type, id, payload, key) => admin.cmd(type, id, payload, key),
    async close() {
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}
export const ok = (r) => {
  assert.equal(r.statusCode, 200, r.message);
  return r;
};
export async function scheme(
  f,
  { vehicle_ids = ["V001", "V002"], soc = 74, order_id = "O013" } = {},
) {
  const run = ok(
    await f.cmd("simulation.run", null, {
      order_id,
      vehicle_ids,
      station_id: "S001",
      soc,
      reserve_soc: 20,
      use_reference: true,
    }),
  );
  assert(
    run.simulation.candidates[0].feasible,
    JSON.stringify(run.simulation.candidates[0].constraint_violations),
  );
  ok(
    await f.cmd("simulation.confirm", run.id, {
      expected_version: 1,
      candidate_id: "A",
    }),
  );
  const tasks = f.db
    .prepare("SELECT id FROM tasks WHERE simulation_id=? ORDER BY driver_id")
    .all(run.id);
  return {
    run,
    tasks: await Promise.all(tasks.map((t) => f.get("tasks", t.id))),
  };
}
export async function dispatch(f, schemeResult) {
  const s = schemeResult || (await scheme(f));
  ok(
    await f.cmd("dispatch.batch", null, {
      items: s.tasks.map((t) => ({ id: t.id, expected_version: t.version })),
    }),
  );
  return {
    ...s,
    tasks: await Promise.all(s.tasks.map((t) => f.get("tasks", t.id))),
  };
}
export async function delivered(f) {
  const { tasks } = await dispatch(f),
    id = tasks[0].id,
    d = await f.login("driver01");
  let t = await f.get("tasks", id);
  ok(await d.cmd("task.accept", id, { expected_version: t.version }));
  t = await f.get("tasks", id);
  ok(await d.cmd("task.start", id, { expected_version: t.version }));
  t = await f.get("tasks", id);
  const trip = ok(
    await d.cmd("trip.create", id, { expected_version: t.version }),
  );
  for (const type of ["trip.load", "trip.depart", "trip.deliver"]) {
    t = await f.get("tasks", id);
    ok(
      await d.cmd(type, id, {
        expected_version: t.version,
        trip_id: trip.trip_id,
        quantity: 30,
        evidence: "SIM逐车次凭证",
        event_id: crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
      }),
    );
  }
  return {
    id,
    driver: d,
    trip_id: trip.trip_id,
    task: await f.get("tasks", id),
  };
}
