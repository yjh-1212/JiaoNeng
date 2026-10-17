import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok, scheme } from "./helpers.mjs";
import {
  taskWorkspace,
  taskWorkspaceDetail,
} from "../server/task-workspace.mjs";
import { scenarioDefaults } from "../server/scenarios.mjs";
const admin = {
  id: "U-ADMIN",
  role: "admin",
  scopes: ["ORG-N", "ORG-S"],
  operations: ["*"],
};
const count = (db, t) => db.prepare("SELECT count(*) n FROM " + t).get().n;
function southTask(db) {
  const row = {
    ...db.prepare("SELECT * FROM tasks WHERE id='T001'").get(),
    id: "CR17-S",
    code: "CR17-SOUTH",
    owner_id: "ORG-S",
    order_id: "O021",
    vehicle_id: "V010",
    driver_id: "D010",
  };
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO tasks(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
  ).run(...cols.map((k) => row[k]));
  return row.id;
}

test("CR17 relational task search, exact states, interval overlap and complete status facets", async () => {
  const f = await fixture();
  try {
    const initial = taskWorkspace(f.db, admin, {});
    assert.equal(initial.total, 16);
    assert.equal(initial.items.length, 10);
    assert.equal(initial.pageSize, 10);
    assert.equal(initial.counts.all, 16);
    assert.equal(initial.counts.ready, 2);
    assert.equal(initial.counts.verify, 1);
    f.db
      .prepare("UPDATE drivers SET name=? WHERE id='D001'")
      .run("可搜索司机_专用");
    for (const q of [
      "DD-2610-0001",
      "甘M·仿001",
      "可搜索司机_专用",
      "北区装载场",
    ]) {
      const r = taskWorkspace(f.db, admin, { q });
      assert(r.total > 0, q);
      assert(
        r.items.every((t) => t.order_code && t.vehicle_code && t.driver_name),
      );
    }
    assert.equal(
      taskWorkspace(f.db, admin, { q: "%DROP TABLE tasks;--" }).total,
      0,
    );
    const one = f.db.prepare("SELECT * FROM tasks WHERE id='T001'").get();
    const overlap = taskWorkspace(f.db, admin, {
      id: one.id,
      from: new Date(+new Date(one.start_at) + 60000).toISOString(),
      to: one.finish_at,
    });
    assert.equal(overlap.total, 1);
    assert.equal(
      taskWorkspace(f.db, admin, { id: one.id, from: one.finish_at }).total,
      0,
    );
    assert.equal(
      taskWorkspace(f.db, admin, { id: one.id, to: one.start_at }).total,
      0,
    );
    assert.throws(() => taskWorkspace(f.db, admin, { stage: "unknown" }));
    assert.throws(() => taskWorkspace(f.db, admin, { status: "假的状态" }));
    assert.throws(() => taskWorkspace(f.db, admin, { from: "n/a" }));
    assert.throws(() =>
      taskWorkspace(f.db, admin, { from: "2026-10-17", to: "2026-10-16" }),
    );
    const filtered = taskWorkspace(f.db, admin, { status: "待核验" });
    assert.equal(filtered.total, 1);
    assert.equal(filtered.counts.all, 16);
    assert.equal(filtered.statuses.length, 9);
    assert.equal(
      taskWorkspace(f.db, admin, { stage: "running" }).items[0].status,
      "执行中",
    );
  } finally {
    await f.close();
  }
});

test("CR17 counts and pagination query the entire scoped database, not bootstrap first page", async () => {
  const f = await fixture();
  try {
    const original = f.db.prepare("SELECT * FROM tasks WHERE id='T001'").get();
    const cols = Object.keys(original);
    const insert = f.db.prepare(
      `INSERT INTO tasks(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
    );
    for (let i = 0; i < 125; i++) {
      const row = { ...original, id: "CR17-" + i, code: "CR17-CODE-" + i };
      insert.run(...cols.map((k) => row[k]));
    }
    const r = taskWorkspace(f.db, admin, { page: 14, pageSize: 10 });
    assert.equal(r.total, 141);
    assert.equal(r.counts.all, 141);
    assert.equal(r.items.length, 10);
    assert.equal(
      taskWorkspace(f.db, admin, { page: 15, pageSize: 10 }).items.length,
      1,
    );
    southTask(f.db);
    const north = { ...admin, scopes: ["ORG-N"], operations: ["read"] },
      n = taskWorkspace(f.db, north, {});
    assert(n.items.every((t) => t.owner_id === "ORG-N"));
    assert(n.total < taskWorkspace(f.db, admin, {}).total);
    assert.equal(taskWorkspace(f.db, north, { owner: "ORG-S" }).total, 0);
    assert.throws(
      () =>
        taskWorkspace(
          f.db,
          {
            role: "driver",
            driver_id: "D001",
            scopes: ["ORG-N"],
            operations: ["driver.execute"],
          },
          {},
        ),
      (e) => e.status === 403,
    );
  } finally {
    await f.close();
  }
});

test("CR17 detail joins real trips, alert and evidence without leaking other subjects", async () => {
  const f = await fixture();
  try {
    ok(
      await f.cmd("alert.report", null, {
        task_id: "TA003",
        name: "车辆故障",
        reason: "CR17任务关联异常",
      }),
    );
    const r = taskWorkspaceDetail(f.db, admin, "TA003");
    assert.equal(r.trips.length, 2);
    assert(r.trips.every((t) => t.delivery_evidence));
    assert.equal(r.alerts.length, 1);
    assert.equal(r.open_alerts, 1);
    assert.equal(r.reported_kg, 60000);
    assert.equal(r.verified_kg, 0);
    assert(r.driver_name);
    const south = southTask(f.db);
    assert.throws(
      () => taskWorkspaceDetail(f.db, { ...admin, scopes: ["ORG-N"] }, south),
      (e) => e.status === 404,
    );
    const response = await (
      await f.login("driver01")
    ).req("/api/task-workspace/TA003");
    assert.equal(response.statusCode, 403);
  } finally {
    await f.close();
  }
});

test("CR17 dispatch preview is read only, locates errors, and final commit revalidates atomically", async () => {
  const f = await fixture();
  try {
    const s = await scheme(f),
      items = s.tasks.map((t) => ({
        id: t.id,
        expected_version: t.version,
        vehicle_id: t.vehicle_id,
        driver_id: t.driver_id,
      })),
      snapshot = () =>
        Object.fromEntries(
          ["tasks", "charging", "costs", "audit", "command_results"].map(
            (t) => [t, count(f.db, t)],
          ),
        ),
      before = snapshot();
    const preview = ok(
      await f.admin.req("/api/task-dispatch-preview", { items }),
    );
    assert(preview.validated);
    assert.deepEqual(snapshot(), before);
    const stale = ok(
      await f.admin.req("/api/task-dispatch-preview", {
        items: [{ ...items[0], expected_version: 0 }],
      }),
    );
    assert.equal(stale.validated, false);
    assert.deepEqual(stale.issues[0].task_ids, [items[0].id]);
    assert.equal(stale.issues[0].code, "VERSION_CONFLICT");
    assert.equal(
      (
        await f.admin.req("/api/task-dispatch-preview", {
          items: [items[0], items[0]],
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (await f.cmd("dispatch.batch", null, { items: [items[0], items[0]] }))
        .statusCode,
      422,
    );
    f.db
      .prepare("UPDATE vehicles SET version=version+1 WHERE id=?")
      .run(items[1].vehicle_id);
    const failed = await f.cmd("dispatch.batch", null, { items });
    assert.equal(failed.statusCode, 409);
    assert(
      s.tasks.every(
        (t) =>
          f.db.prepare("SELECT status FROM tasks WHERE id=?").get(t.id)
            .status === "待派发",
      ),
    );
    const errors = ok(
      await f.admin.req("/api/task-dispatch-preview", { items }),
    );
    assert(!errors.validated);
    assert(errors.issues.some((i) => i.task_ids.includes(items[1].id)));
    f.db
      .prepare("UPDATE vehicles SET version=version-1 WHERE id=?")
      .run(items[1].vehicle_id);
    const sent = ok(
      await f.cmd("dispatch.batch", null, { items }, "cr17-once"),
    );
    assert.equal(sent.dispatched, 2);
    const after = count(f.db, "charging");
    ok(await f.cmd("dispatch.batch", null, { items }, "cr17-once"));
    assert.equal(count(f.db, "charging"), after);
  } finally {
    await f.close();
  }
});

test("CR17 workspace HTTP enforces authentication, operations, CSRF and scoped batch errors", async () => {
  const f = await fixture();
  try {
    assert.equal((await fetch(f.base + "/api/task-workspace")).status, 401);
    const north = await f.login("north"),
      driver = await f.login("driver01");
    assert.equal((await north.req("/api/task-workspace")).statusCode, 200);
    assert.equal((await driver.req("/api/task-workspace")).statusCode, 403);
    assert.equal(
      (
        await north.req("/api/task-dispatch-preview", {
          items: [{ id: "TA003", expected_version: 1 }],
        })
      ).statusCode,
      403,
    );
    const noCsrf = await fetch(f.base + "/api/task-dispatch-preview", {
      method: "POST",
      headers: { Cookie: f.admin.cookie, "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(noCsrf.status, 403);
    const s = await scheme(f),
      south = southTask(f.db);
    f.db
      .prepare(
        "UPDATE users SET operations='[\"read\",\"task.dispatch\"]' WHERE username='north'",
      )
      .run();
    const scope = await north.req("/api/task-dispatch-preview", {
      items: [
        { id: s.tasks[0].id, expected_version: 1 },
        { id: south, expected_version: 1 },
      ],
    });
    assert.equal(scope.statusCode, 404);
    assert(!scope.issues);
    assert.equal(
      (await f.admin.req("/api/task-dispatch-preview", { items: [null] }))
        .statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});

test("CR17 changed task cannot dispatch and cancellation releases only the unexecuted arrangement", async () => {
  const f = await fixture();
  try {
    const s = await scheme(f),
      task = s.tasks[0],
      before = scenarioDefaults(f.db, admin, "orders", task.order_id).source
        .available_kg;
    ok(
      await f.cmd("task.schedule", task.id, {
        expected_version: task.version,
        start_at: task.start_at,
        finish_at: task.finish_at,
        reason: "CR17调整计划",
      }),
    );
    const row = ok(await f.get("tasks", task.id));
    assert(row.requires_resimulation);
    const preview = ok(
      await f.admin.req("/api/task-dispatch-preview", {
        items: [{ id: row.id, expected_version: row.version }],
      }),
    );
    assert(!preview.validated);
    assert(preview.issues[0].message.includes("重新推演"));
    ok(
      await f.cmd("task.cancel", row.id, {
        expected_version: row.version,
        reason: "CR17取消后重算",
      }),
    );
    assert.equal(
      scenarioDefaults(f.db, admin, "orders", row.order_id).source.available_kg,
      before + row.quantity_kg,
    );
    assert.equal(count(f.db, "tasks"), 18);
    assert.equal(
      f.db.prepare("SELECT status FROM tasks WHERE id=?").get(row.id).status,
      "已取消",
    );
  } finally {
    await f.close();
  }
});
