import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
import { insert } from "../server/db.mjs";
import { agentScene } from './agent-center-fixture.mjs';
const path = (id) => "/api/agents/conversations/" + id;
const create = async (f, extra = {}) =>
  ok(
    await f.admin.req("/api/agents/conversations", {
      capability: "DEMAND",
      owner_id: "ORG-N",
      ...extra,
    }),
  );
const send = (f, id, question = "请分析当前业务", key = crypto.randomUUID()) =>
  f.admin.req(path(id) + "/messages", { question, request_key: key });
const answer = (draft = {}, text = "测试替身：仅分析，不执行业务动作。") =>
  Response.json({
    model: "agent-test-double",
    choices: [
      { message: { content: JSON.stringify({ answer: text, draft }) } },
    ],
  });
test('CR23 saved scene uses adjustment whitelist, handoff retains new vehicle count and leaves original solution intact',async()=>{
  const f=await fixture({agentModelFetch:async(u,o,c)=>Response.json({model:'adjustment-test-double',choices:[{message:{content:JSON.stringify({answer:'测试替身：参与车辆改为3辆，请确认后重算。',summary:'参与车辆改为3辆',patch:{vehicle_count:3},unsupported:[]})}}]})});
  try{
    const scene=await agentScene(f),before=f.db.prepare('SELECT * FROM records WHERE id=?').get(scene.id);
    const c=await create(f,{capability:'SIMULATION',context_resource:'simulation-scenarios',context_id:scene.id,draft:{vehicle_count:2}});
    const r=ok(await send(f,c.id,'将参与车辆改为3辆')).turn.response;
    assert.equal(r.adjustment.status,'ready');
    assert.equal(r.adjustment.patch.vehicle_count,3);
    assert(r.plans[0].candidates.length>0);
    const h=ok(await f.admin.req(path(c.id)+'/handoff'));
    assert.equal(h.scene_inputs.vehicle_count,3);
    assert.equal(h.draft.vehicle_count,3);
    assert.equal(h.id,'O013');assert.equal(h.resource,'orders');
    assert.deepEqual(f.db.prepare('SELECT * FROM records WHERE id=?').get(scene.id),before);
    assert.equal(f.calls[0].baseline.vehicle_count,2);
  }finally{await f.close();}
});
test("CR23 PC six-agent catalog, admin ai.use/read and driver boundaries", async () => {
  const f = await fixture();
  try {
    const c = ok(await f.admin.req("/api/agents/context"));
    assert.equal(c.agents.length, 6);
    assert(!c.agents.some((a) => /用能优化|单据/.test(a.name)));
    const driver = await f.login("driver01");
    assert.equal((await driver.req("/api/agents/context")).statusCode, 403);
    f.db
      .prepare("UPDATE users SET operations=? WHERE username='north'")
      .run(JSON.stringify(["read"]));
    const north = await f.login("north");
    assert.equal((await north.req("/api/agents/context")).statusCode, 403);
  } finally {
    await f.close();
  }
});
test("CR23 conversation account privacy, owner scope, context validation, search and paging", async () => {
  const f = await fixture();
  try {
    f.db
      .prepare("UPDATE users SET operations=? WHERE username='north'")
      .run(JSON.stringify(["read", "ai.use"]));
    const c = await create(f, {
      context_resource: "orders",
      context_id: "O013",
    });
    const north = await f.login("north");
    assert.equal((await north.req(path(c.id))).statusCode, 404);
    assert.equal(
      (
        await f.admin.req("/api/agents/conversations", {
          capability: "DEMAND",
          owner_id: "ORG-N",
          context_resource: "orders",
          context_id: "O019",
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await f.admin.req("/api/agents/conversations", {
          capability: "DEMAND",
          owner_id: "BAD",
        })
      ).statusCode,
      403,
    );
    for (let i = 0; i < 11; i++) await create(f);
    assert.equal(
      ok(await f.admin.req("/api/agents/conversations")).items.length,
      10,
    );
    assert.equal(
      ok(await f.admin.req("/api/agents/conversations?page=2")).total,
      12,
    );
    ok(
      await f.admin.req(path(c.id) + "/rename", {
        title: "矿区_需求%",
        expected_version: 1,
      }),
    );
    assert.equal(
      ok(
        await f.admin.req(
          "/api/agents/conversations?q=" + encodeURIComponent("_需求%"),
        ),
      ).total,
      1,
    );
    assert.equal(
      (
        await f.admin.req(path(c.id) + "/archive", {
          archived: true,
          expected_version: 1,
        })
      ).statusCode,
      409,
    );
    ok(
      await f.admin.req(path(c.id) + "/archive", {
        archived: true,
        expected_version: 2,
      }),
    );
    assert.equal(
      ok(await f.admin.req("/api/agents/conversations?archived=1")).total,
      1,
    );
    assert.equal((await send(f, c.id)).statusCode, 422);
    ok(
      await f.admin.req(path(c.id) + "/archive", {
        archived: false,
        expected_version: 3,
      }),
    );
  } finally {
    await f.close();
  }
});
test("CR23 all six capabilities retrieve scoped real facts, complete totals and explicitly bounded samples", async () => {
  const f = await fixture();
  try {
    const r = f.db.prepare("SELECT * FROM orders WHERE id='O013'").get();
    for (let i = 0; i < 105; i++)
      insert(f.db, "orders", { ...r, id: "AG-O" + i, code: "AG-O" + i });
    for (const cap of [
      "DEMAND",
      "SIMULATION",
      "DISPATCH",
      "CHARGING",
      "INCIDENT",
      "PLANNING",
    ]) {
      const c = await create(f, { capability: cap }),
        r = ok(await send(f, c.id));
      assert.equal(r.turn.response.capability, cap);
      assert.equal(r.turn.response.actions_allowed, false);
      assert(r.turn.response.statistics.length);
      assert(r.turn.response.samples.every((s) => s.sample_count <= 8));
    }
    const first = f.calls[0].facts;
    assert.equal(
      first.statistics.find((s) => s.resource === "orders").total,
      123,
    );
    assert(first.samples.find((s) => s.resource === "orders").is_sample);
    assert(
      f.calls.every(
        (c) =>
          c.facts.owner_id === "ORG-N" &&
          c.facts.refs.every((r) => r.owner_id === "ORG-N"),
      ),
    );
    assert(!JSON.stringify(f.calls).includes("password_hash"));
    assert(!JSON.stringify(f.calls).includes("phone"));
  } finally {
    await f.close();
  }
});
test("CR23 DeepSeek draft extraction persists with history and handoff; no business records are created", async () => {
  const f = await fixture({
    agentModelFetch: () =>
      answer({
        quantity: 3000,
        cargo: "煤炭",
        origin: "北区矿场",
        destination: "集运中心",
      }),
  });
  try {
    const tables = [
        "demands",
        "orders",
        "tasks",
        "charging",
        "simulations",
        "records",
      ],
      before = tables.map((t) =>
        f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all(),
      ),
      c = await create(f),
      r = ok(await send(f, c.id, "3000吨煤炭从北区矿场到集运中心"));
    assert.equal(r.turn.response.draft.quantity, 3000);
    assert.equal(r.turn.response.draft.origin.lng, null);
    const d = ok(await f.admin.req(path(c.id)));
    assert.equal(d.turns.length, 1);
    assert.equal(d.draft.cargo, "煤炭");
    assert.equal(d.title, "3000吨煤炭从北区矿场到集运中心");
    assert.equal(
      ok(await f.admin.req(path(c.id) + "/handoff")).draft.quantity,
      3000,
    );
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
test("CR23 send request is idempotent and same key cannot mutate question", async () => {
  const f = await fixture();
  try {
    const c = await create(f),
      key = "agent-send-once";
    const r = ok(await send(f, c.id, "请核查当前需求", key));
    const again = ok(await send(f, c.id, "请核查当前需求", key));
    assert.equal(r.turn.id, again.turn.id);
    assert.equal(f.calls.length, 1);
    assert.equal((await send(f, c.id, "不同问题", key)).statusCode, 409);
    assert.equal(f.db.prepare("SELECT count(*) n FROM agent_turns").get().n, 1);
  } finally {
    await f.close();
  }
});
test("CR23 invalid model output, unauthorized draft fields and failures preserve no false success", async () => {
  let mode = "bad";
  const f = await fixture({
    agentModelFetch: () =>
      mode === "bad"
        ? Response.json({ choices: [{ message: { content: "not json" } }] })
        : mode === "patch"
          ? answer({ owner_id: "ORG-S" })
          : new Response("{}", { status: 503 }),
  });
  try {
    const c = await create(f);
    assert.equal((await send(f, c.id)).code, "AI_INVALID");
    mode = "patch";
    assert.equal((await send(f, c.id)).code, "AI_INVALID");
    mode = "failed";
    assert.equal((await send(f, c.id)).code, "AI_UNAVAILABLE");
    assert.equal(ok(await f.admin.req(path(c.id))).turns.length, 0);
  } finally {
    await f.close();
  }
});
test("CR23 cancel aborts model request, concurrent send rejected and completed result not lost", async () => {
  let started,
    ready = new Promise((r) => (started = r));
  const f = await fixture({
    agentModelFetch: (u, o) =>
      new Promise((resolve, reject) => {
        started();
        o.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  });
  try {
    const c = await create(f),
      pending = send(f, c.id);
    await ready;
    assert.equal((await send(f, c.id, "第二个请求")).code, "AGENT_BUSY");
    assert.equal(
      ok(await f.admin.req(path(c.id) + "/cancel", {})).status,
      "STOPPING",
    );
    assert.equal((await pending).code, "CANCELLED");
    assert.equal(ok(await f.admin.req(path(c.id))).turns.length, 0);
  } finally {
    await f.close();
  }
});
test("CR23 history marks changed sources, blocks stale handoff and rechecks lost scope", async () => {
  const f = await fixture();
  try {
    const c = await create(f, {
      context_resource: "orders",
      context_id: "O013",
    });
    ok(await send(f, c.id));
    f.db.prepare("UPDATE orders SET version=version+1 WHERE id='O013'").run();
    assert(ok(await f.admin.req(path(c.id))).turns[0].response.stale);
    assert.equal(
      (await f.admin.req(path(c.id) + "/handoff")).code,
      "STALE_CONTEXT",
    );
    f.db
      .prepare(
        "DELETE FROM user_scopes WHERE user_id='U-ADMIN' AND owner_id='ORG-N'",
      )
      .run();
    assert.equal((await f.admin.req(path(c.id))).statusCode, 404);
  } finally {
    await f.close();
  }
});
test("CR23 exact object picker searches whole authorized set and malformed context cannot bypass scope", async () => {
  const f = await fixture();
  try {
    const o = ok(
      await f.admin.req(
        "/api/agents/options?owner_id=ORG-N&resource=orders&q=DD-2610-0013",
      ),
    );
    assert.equal(o.total, 1);
    assert.equal(o.items[0].id, "O013");
    assert.equal(
      (await f.admin.req("/api/agents/options?owner_id=ORG-N&resource=users"))
        .statusCode,
      422,
    );
    assert.equal(
      (
        await f.admin.req("/api/agents/conversations", {
          capability: "AUTO",
          owner_id: "ORG-N",
          context_id: "O013",
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await f.admin.req("/api/agents/conversations", {
          capability: "DEMAND",
          owner_id: "ORG-N",
          draft: { quantity: -1 },
        })
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});
