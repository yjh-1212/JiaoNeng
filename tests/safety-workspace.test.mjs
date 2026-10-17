import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok } from "./helpers.mjs";
import { insert, unpack } from "../server/db.mjs";
const due = () => new Date(Date.now() + 3600000).toISOString();
const adminId = (f) =>
  f.db.prepare("SELECT id FROM users WHERE username='admin'").get().id;
const detail = (f, id) => f.admin.req("/api/safety/incidents/" + id);
const report = (f, extra = {}, key) =>
  f.cmd(
    "incident.report",
    null,
    {
      incident_type: "充电位故障",
      task_ids: ["TA001"],
      plan_ids: ["C-ACT1"],
      station_id: "S001",
      report: "隔离测试：工位无法启动，现场待核实",
      ...extra,
    },
    key,
  );
const transition = async (f, id, type, extra = {}) =>
  f.cmd(type, id, {
    expected_version: ok(await detail(f, id)).version,
    note: "隔离测试处置依据",
    ...extra,
  });
const accept = (f, id) =>
  transition(f, id, "incident.accept", {
    assignee_id: adminId(f),
    due_at: due(),
    instruction: "请等待管理员确认替代补能安排",
  });

test("CR19 monitor joins scoped task/order/plan, timestamps, pagination and station objects", async () => {
  const f = await fixture();
  try {
    const data = ok(await f.admin.req("/api/safety/monitoring"));
    assert.equal(data.pageSize, 10);
    assert.equal(data.total, 18);
    const v = data.items.find((v) => v.id === "V004");
    assert(v);
    assert.equal(v.tasks[0].id, "TA001");
    assert(v.tasks[0].order.code);
    assert(v.plans.some((p) => p.id === "C-ACT1"));
    assert(v.source_time);
    assert.equal(v.position_label, "最近有效位置");
    assert.equal(
      ok(
        await f.admin.req(
          "/api/safety/monitoring?q=RW-" + encodeURIComponent("当前") + "-001",
        ),
      ).total,
      1,
    );
    const north = await f.login("north"),
      n = ok(await north.req("/api/safety/monitoring"));
    assert(n.items.every((v) => v.owner_id === "ORG-N"));
    const stations = ok(
      await f.admin.req("/api/safety/monitoring?kind=station"),
    );
    assert.equal(stations.total, 3);
    assert(stations.items.every((s) => s.devices));
    const raw = f.db.prepare("SELECT * FROM vehicles WHERE id='V001'").get();
    for (let i = 0; i < 110; i++)
      insert(f.db, "vehicles", {
        ...raw,
        id: "CR19-V" + i,
        code: "CR19-V" + i,
      });
    const page = ok(
      await f.admin.req("/api/safety/monitoring?page=12&pageSize=10"),
    );
    assert.equal(page.total, 128);
    assert.equal(page.items.length, 10);
    assert.equal(page.counts.all, 128);
  } finally {
    await f.close();
  }
});
test("CR19 stale telemetry is not current position or confirmed fault; unknown data stays unknown", async () => {
  const f = await fixture();
  try {
    f.db.prepare("DELETE FROM telemetry WHERE vehicle_id='V004'").run();
    const v = unpack(
      f.db.prepare("SELECT * FROM vehicles WHERE id='V004'").get(),
    );
    f.db
      .prepare("UPDATE vehicles SET data=? WHERE id='V004'")
      .run(JSON.stringify({ ...v, source_time: "2000-01-01T00:00:00Z" }));
    const data = ok(
      await f.admin.req(
        "/api/safety/monitoring?q=" + encodeURIComponent("甘M·仿004"),
      ),
    );
    assert.equal(data.items[0].fresh, false);
    assert.equal(data.items[0].position_label, "最后有效位置");
    assert(data.items[0].risks.some((s) => s.includes("数据延迟")));
    assert(!data.items[0].risks.some((s) => s === "车辆故障"));
    const count = f.db.prepare("SELECT count(*) n FROM alerts").get().n;
    await f.admin.req("/api/safety/monitoring?stage=attention");
    assert.equal(f.db.prepare("SELECT count(*) n FROM alerts").get().n, count);
  } finally {
    await f.close();
  }
});
test("CR19 structured report joins all references, preserves original report, deduplicates and replays idempotency", async () => {
  const f = await fixture();
  try {
    const key = "CR19-REPORT-REPLAY",
      created = ok(await report(f, {}, key)),
      r = ok(await detail(f, created.id));
    assert.equal(r.tasks[0].id, "TA001");
    assert.equal(r.orders.length, 1);
    assert.equal(r.plans[0].id, "C-ACT1");
    assert.equal(r.station_id, "S001");
    assert.equal(r.stage, "pending");
    ok(await report(f, {}, key));
    assert.equal(ok(await detail(f, created.id)).version, r.version);
    const merged = ok(await report(f, { report: "第二次上报同一设备事件" }));
    assert.equal(merged.id, created.id);
    assert(merged.merged);
    const latest = ok(await detail(f, created.id));
    assert.equal(latest.report, r.report);
    assert.equal(latest.history.length, 2);
    assert.equal(
      (await report(f, { report: "不同内容" }, key)).statusCode,
      409,
    );
    assert.equal(
      ok(await f.admin.req("/api/safety/incidents?order=" + r.orders[0].id))
        .total,
      1,
    );
  } finally {
    await f.close();
  }
});
test("CR19 owner, relationship, readonly permissions and invalid assignees are enforced", async () => {
  const f = await fixture();
  try {
    const other = f.db
      .prepare("SELECT id FROM stations WHERE owner_id<>'ORG-N' LIMIT 1")
      .get().id;
    assert.equal((await report(f, { station_id: other })).statusCode, 422);
    assert.equal((await report(f, { vehicle_id: "V001" })).statusCode, 422);
    const north = await f.login("north");
    assert.equal(
      (
        await north.cmd("incident.report", null, {
          owner_id: "ORG-N",
          incident_type: "其他异常",
          report: "只读越权",
        })
      ).statusCode,
      403,
    );
    const c = ok(await report(f));
    assert.equal(
      (
        await transition(f, c.id, "incident.accept", {
          assignee_id: "not-found",
          due_at: due(),
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await transition(f, c.id, "incident.accept", {
          assignee_id: adminId(f),
          due_at: "bad",
        })
      ).statusCode,
      422,
    );
    const d = await f.login("driver04");
    assert.equal((await d.req("/api/safety/monitoring")).statusCode, 403);
    assert.equal((await d.req("/api/safety/options")).statusCode, 403);
  } finally {
    await f.close();
  }
});
test("CR19 lifecycle keeps separate measures, result and verification, no automatic transport completion", async () => {
  const f = await fixture();
  try {
    const c = ok(await report(f)),
      taskBefore = ok(await f.get("tasks", "TA001")),
      planBefore = ok(await f.get("charging", "C-ACT1"));
    ok(await accept(f, c.id));
    ok(
      await transition(f, c.id, "incident.update", {
        note: "已联系场站核实",
        instruction: "请先确认新安排再前往",
      }),
    );
    assert.equal(
      (
        await transition(f, c.id, "incident.resolve", {
          recovery: "未恢复",
          proof: "现场凭证",
        })
      ).statusCode,
      422,
    );
    ok(
      await transition(f, c.id, "incident.resolve", {
        note: "已核对并恢复服务",
        recovery: "已恢复",
        proof: "隔离现场确认凭证",
      }),
    );
    assert.equal(ok(await detail(f, c.id)).status_label, "待核验");
    assert.equal((await transition(f, c.id, "incident.close")).statusCode, 422);
    ok(
      await transition(f, c.id, "incident.return", {
        note: "需要补充工位恢复证明",
      }),
    );
    assert.equal(ok(await detail(f, c.id)).stage, "working");
    ok(
      await transition(f, c.id, "incident.resolve", {
        note: "补充恢复证明",
        recovery: "已恢复",
        proof: "工位恢复确认",
      }),
    );
    ok(
      await transition(f, c.id, "incident.close", {
        note: "核实现场及运输责任已处理",
        responsibility_resolved: true,
      }),
    );
    const r = ok(await detail(f, c.id));
    assert.equal(r.stage, "closed");
    assert.equal(r.result.summary, "补充恢复证明");
    assert.equal(r.verification.evidence, "核实现场及运输责任已处理");
    assert(r.history.length >= 7);
    assert.equal(r.report, "隔离测试：工位无法启动，现场待核实");
    assert.equal(ok(await f.get("tasks", "TA001")).version, taskBefore.version);
    assert.equal(
      ok(await f.get("charging", "C-ACT1")).version,
      planBefore.version,
    );
    ok(await transition(f, c.id, "incident.reopen"));
    assert.equal(ok(await detail(f, c.id)).previous_results.length, 1);
  } finally {
    await f.close();
  }
});
test("CR19 optimistic conflicts, legacy bypass and assignment transfer", async () => {
  const f = await fixture();
  try {
    const c = ok(await report(f));
    ok(await accept(f, c.id));
    assert.equal(
      (
        await f.cmd("incident.update", c.id, {
          expected_version: 1,
          note: "过期操作",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.cmd("alert.resolve", c.id, {
          expected_version: 2,
          evidence: "绕过核验",
        })
      ).statusCode,
      422,
    );
    const before = ok(await detail(f, c.id));
    ok(
      await transition(f, c.id, "incident.transfer", {
        assignee_id: adminId(f),
        due_at: due(),
        note: "值班交接",
      }),
    );
    const after = ok(await detail(f, c.id));
    assert.equal(after.version, before.version + 1);
    assert.equal(after.history.at(-1).label, "转交处理");
  } finally {
    await f.close();
  }
});
test("CR19 driver sees only own current tasks, public progress, receipt revision and feedback", async () => {
  const f = await fixture();
  try {
    const c = ok(await report(f)),
      d = await f.login("driver04"),
      other = await f.login("driver05");
    ok(await accept(f, c.id));
    const view = ok(await d.req("/api/safety/incidents/" + c.id));
    assert(view.instruction);
    assert.equal(view.tasks[0].id, "TA001");
    assert(!("assignee_id" in view));
    assert(!JSON.stringify(view).includes("measures"));
    assert.equal(
      (await other.req("/api/safety/incidents/" + c.id)).statusCode,
      404,
    );
    ok(
      await d.cmd("incident.driver-ack", c.id, {
        expected_version: view.version,
        instruction_revision: view.instruction_revision,
      }),
    );
    assert(ok(await d.req("/api/safety/incidents/" + c.id)).acknowledged);
    ok(
      await transition(f, c.id, "incident.update", {
        instruction: "等待新的补能确认",
        note: "管理员内部资料：不得下发给司机",
      }),
    );
    const current = ok(await d.req("/api/safety/incidents/" + c.id));
    assert(!current.acknowledged);
    assert(!JSON.stringify(current).includes("管理员内部资料"));
    assert(
      !JSON.stringify(
        ok(await d.req("/api/resources/alerts/" + c.id)),
      ).includes("管理员内部资料"),
    );
    assert.equal(
      (
        await d.cmd("incident.driver-ack", c.id, {
          expected_version: current.version,
          instruction_revision: view.instruction_revision,
        })
      ).statusCode,
      409,
    );
    ok(
      await d.cmd("incident.driver-feedback", c.id, {
        expected_version: current.version,
        report: "司机已收到变更，等待现场确认",
      }),
    );
    assert.equal(ok(await detail(f, c.id)).driver_feedback.length, 1);
    assert.equal(
      (
        await d.cmd("incident.close", c.id, {
          expected_version: ok(await detail(f, c.id)).version,
          note: "越权关闭",
        })
      ).statusCode,
      403,
    );
    f.db.prepare("UPDATE tasks SET driver_id='D005' WHERE id='TA001'").run();
    assert.equal(
      (await d.req("/api/safety/incidents/" + c.id)).statusCode,
      404,
    );
  } finally {
    await f.close();
  }
});
test("CR19 shared multi-task incident is visible without leaking other driver's task, updates task badges", async () => {
  const f = await fixture();
  try {
    const c = ok(
      await report(f, {
        task_ids: ["TA001", "TA002"],
        plan_ids: [],
        station_id: undefined,
      }),
    );
    const d = await f.login("driver05"),
      view = ok(await d.req("/api/safety/incidents/" + c.id));
    assert.equal(view.tasks.length, 1);
    assert.equal(view.tasks[0].id, "TA002");
    assert(!JSON.stringify(view).includes("TA001"));
    const task = ok(await f.admin.req("/api/task-workspace/TA002"));
    assert.equal(task.open_alerts, 1);
    assert(task.alerts.some((a) => a.id === c.id));
  } finally {
    await f.close();
  }
});
test("CR19 history filters, legacy status compatibility, scope and >100 incidents are accurate", async () => {
  const f = await fixture();
  try {
    const c = ok(await report(f)),
      row = f.db.prepare("SELECT * FROM alerts WHERE id=?").get(c.id);
    for (let i = 0; i < 105; i++)
      insert(f.db, "alerts", { ...row, id: "CR19-A" + i, code: "CR19-A" + i });
    const page = ok(
      await f.admin.req("/api/safety/incidents?page=11&pageSize=10"),
    );
    assert.equal(page.total, 111);
    assert.equal(page.items.length, 10);
    assert.equal(page.counts.all, 111);
    const n = await f.login("north");
    assert(
      ok(await n.req("/api/safety/incidents")).items.every(
        (a) => a.owner_id === "ORG-N",
      ),
    );
    assert.equal(
      (await f.admin.req("/api/safety/incidents?date=2026-02-30")).statusCode,
      422,
    );
    assert.equal(
      ok(await f.admin.req("/api/safety/incidents?date=2001-01-01")).total,
      0,
    );
    assert(
      ok(await f.admin.req("/api/safety/incidents?stage=pending")).items.some(
        (a) => a.status === "待核实",
      ),
    );
  } finally {
    await f.close();
  }
});
test("CR19 explicit trace range, gaps/events, no fabricated points and strict driver restriction", async () => {
  const f = await fixture();
  try {
    const data = ok(await f.admin.req("/api/safety/trace/V004"));
    assert.equal(data.items.length, 24);
    assert.equal(data.real_trajectory, false);
    assert(
      data.items.every(
        (p, i) => !i || p.occurred_at >= data.items[i - 1].occurred_at,
      ),
    );
    assert.equal(
      ok(
        await f.admin.req(
          "/api/safety/trace/V004?from=2001-01-01&to=2001-01-02",
        ),
      ).items.length,
      0,
    );
    assert.equal(
      (
        await f.admin.req(
          "/api/safety/trace/V004?from=2001-01-01&to=2001-03-01",
        )
      ).statusCode,
      422,
    );
    const d = await f.login("driver04");
    assert.equal((await d.req("/api/safety/trace/V004")).statusCode, 403);
  } finally {
    await f.close();
  }
});
test("CR19 legacy station fault can confirm potential plan/task links without manufacturing impact", async () => {
  const f = await fixture();
  try {
    const c = ok(
      await f.cmd("station.alert", null, {
        device_id: "S001-G1",
        reason: "工位需现场核实",
        evidence: "仿真现场反馈",
      }),
    );
    const before = ok(await detail(f, c.id));
    assert.equal(before.tasks.length, 0);
    assert(before.potential_plans.some((p) => p.id === "C-ACT1"));
    ok(
      await transition(f, c.id, "incident.link", {
        task_ids: [],
        plan_ids: ["C-ACT1"],
        station_id: "S001",
        note: "人工核对本任务补能安排受影响",
      }),
    );
    const after = ok(await detail(f, c.id));
    assert.equal(after.tasks[0].id, "TA001");
    assert.equal(after.plans[0].id, "C-ACT1");
    assert.equal(after.history.at(-1).label, "核对关联业务");
    const driver = await f.login("driver04");
    ok(await driver.req("/api/safety/incidents/" + c.id));
    assert.equal((await report(f, { task_ids: "TA001" })).statusCode, 422);
  } finally {
    await f.close();
  }
});
