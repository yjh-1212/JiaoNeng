import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
import { insert } from "../server/db.mjs";
test("CR28 overview requires PC read access and validates owner; scoped accounts see only their data", async () => {
  const f = await fixture();
  try {
    const driver = await f.login("driver01");
    assert.equal((await driver.req("/api/overview")).statusCode, 403);
    assert.equal(
      (await f.admin.req("/api/overview?owner=BAD")).statusCode,
      403,
    );
    const north = await f.login("north"),
      r = ok(await north.req("/api/overview"));
    assert(r.items.every((t) => t.owner_id === "ORG-N"));
    assert(r.organizations.every((o) => o.id === "ORG-N"));
    assert.equal(
      (await north.req("/api/overview?owner=ORG-S")).statusCode,
      403,
    );
    f.db
      .prepare("UPDATE users SET operations='[]' WHERE username='north'")
      .run();
    assert.equal((await north.req("/api/overview")).statusCode, 403);
  } finally {
    await f.close();
  }
});
test("CR28 full-set counters exceed 100 rows, recent list bounded and quantity remains verified-only", async () => {
  const f = await fixture();
  try {
    const base = f.db
      .prepare("SELECT * FROM tasks WHERE owner_id='ORG-N' LIMIT 1")
      .get();
    for (let i = 0; i < 125; i++)
      insert(f.db, "tasks", {
        ...base,
        id: "OW-" + i,
        code: "OW-TEST-" + String(i).padStart(3, "0"),
        status: "待派发",
        quantity_kg: 30000,
        reported_kg: 0,
        verified_kg: 0,
        created_at: "2026-10-17T00:00:00Z",
      });
    const r = ok(await f.admin.req("/api/overview?owner=ORG-N"));
    assert.equal(
      r.statistics.pending,
      f.db
        .prepare(
          "SELECT count(*) n FROM tasks WHERE owner_id='ORG-N' AND status='待派发'",
        )
        .get().n,
    );
    assert(r.statistics.pending >= 125);
    assert.equal(r.items.length, 6);
    assert.equal(
      r.statistics.verified_tonnes,
      f.db
        .prepare(
          "SELECT sum(verified_kg)/1000.0 n FROM tasks WHERE owner_id='ORG-N'",
        )
        .get().n,
    );
    assert(r.items.every((t) => t.owner_id === "ORG-N"));
    assert.equal(
      r.todo_count,
      r.todos.reduce((n, t) => n + t.count, 0),
    );
    assert(!JSON.stringify(r).includes("phone"));
    assert(!JSON.stringify(r).includes("password_hash"));
  } finally {
    await f.close();
  }
});
test("CR28 canonical charging and incident queues preserve overview owner and stage through APIs", async () => {
  const f = await fixture();
  try {
    for (const owner of ["ORG-N", "ORG-S"]) {
      const r = ok(await f.admin.req("/api/overview?owner=" + owner)),
        charge = ok(
          await f.admin.req(
            "/api/energy-workspace/charging?owner=" + owner + "&stage=pending",
          ),
        );
      assert.equal(r.statistics.pending_charging, charge.total);
      assert(charge.items.every((p) => p.owner_id === owner));
      const incidents = ok(
        await f.admin.req(
          "/api/safety/incidents?owner=" + owner + "&stage=open",
        ),
      );
      assert.equal(r.statistics.open_alerts, incidents.total);
      assert(incidents.items.every((p) => p.owner_id === owner));
    }
  } finally {
    await f.close();
  }
});
test("CR28 progress follows recorded task state and separates reported from verified without invented timestamps", async () => {
  const f = await fixture();
  try {
    const base = f.db
      .prepare("SELECT * FROM tasks WHERE owner_id='ORG-N' LIMIT 1")
      .get();
    insert(f.db, "tasks", {
      ...base,
      id: "OW-RUN",
      code: "OW-TEST-RUN",
      status: "执行中",
      quantity_kg: 60000,
      reported_kg: 30000,
      verified_kg: 0,
      created_at: new Date().toISOString(),
    });
    const p = ok(await f.admin.req("/api/overview?owner=ORG-N")).progress;
    assert.equal(p.id, "OW-RUN");
    assert.equal(p.nodes[2].state, "current");
    assert.equal(p.reported_kg, 30000);
    assert.equal(p.verified_kg, 0);
    assert(!p.expected_arrival_at);
    assert(p.nodes.every((n) => !n.actual_at));
  } finally {
    await f.close();
  }
});
test("CR28 empty business data is a true empty state and summary reads never modify original tables", async () => {
  const f = await fixture();
  try {
    const tables = [
      "demands",
      "orders",
      "tasks",
      "trips",
      "charging",
      "sessions",
      "alerts",
      "vehicles",
      "drivers",
      "stations",
      "devices",
      "records",
    ];
    const before = tables.map((t) =>
      f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all(),
    );
    ok(await f.admin.req("/api/overview"));
    assert.deepEqual(
      tables.map((t) =>
        f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all(),
      ),
      before,
    );
    insert(f.db, "organizations", {
      id: "ORG-EMPTY",
      name: "空业务主体（测试）",
      kind: "运营主体",
      source: "SIMULATED",
    });
    f.db
      .prepare(
        "INSERT INTO user_scopes(user_id,owner_id) VALUES('U-ADMIN','ORG-EMPTY')",
      )
      .run();
    const r = ok(await f.admin.req("/api/overview?owner=ORG-EMPTY"));
    assert.equal(r.total_tasks, 0);
    assert.equal(r.items.length, 0);
    assert.equal(r.progress, null);
    assert.equal(r.todo_count, 0);
    assert(Object.values(r.statistics).every((v) => v === 0));
  } finally {
    await f.close();
  }
});
