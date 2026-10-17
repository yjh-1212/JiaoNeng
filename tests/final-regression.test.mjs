import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ok, delivered } from "./helpers.mjs";

test("个人资料只维护本人、版本冲突和密码校验；修改密码清除旧会话", async () => {
  const f = await fixture();
  try {
    let r = await f.admin.req("/api/auth/me");
    assert.equal(r.statusCode, 200);
    const u = r.user;
    assert(u.version);
    assert.equal(
      (
        await f.cmd("profile.update", "U-OTHER", {
          name: "越权",
          expected_version: u.version,
        })
      ).statusCode,
      403,
    );
    ok(
      await f.cmd("profile.update", u.id, {
        name: "仿真管理员修订",
        expected_version: u.version,
      }),
    );
    assert.equal(
      (
        await f.cmd("profile.update", u.id, {
          name: "旧版本",
          expected_version: u.version,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.cmd("profile.update", u.id, {
          name: "修订",
          expected_version: u.version + 1,
          password: "NewJiaoNeng2026!",
          current_password: "错误密码",
        })
      ).statusCode,
      403,
    );
    ok(
      await f.cmd("profile.update", u.id, {
        name: "修订",
        expected_version: u.version + 1,
        password: "NewJiaoNeng2026!",
        current_password: "JiaoNeng2026!",
      }),
    );
    assert.equal((await f.admin.req("/api/auth/me")).statusCode, 401);
    const login = await fetch(f.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "NewJiaoNeng2026!" }),
    });
    assert.equal(login.status, 200);
  } finally {
    await f.close();
  }
});

test("电池人工出入站不自动认定可用库存，核验后才恢复；未完成运输禁止脱离电池", async () => {
  const f = await fixture();
  try {
    const a = await f.get("assets", "AS1"),
      before = (await f.get("stations", a.station_id)).inventory;
    ok(
      await f.cmd("asset.move", a.id, {
        expected_version: a.version,
        station_id: a.station_id,
        evidence: "SIM在站位置复核",
      }),
    );
    const moved = await f.get("assets", a.id);
    assert.equal(moved.available, false);
    assert.equal((await f.get("stations", a.station_id)).inventory, before - 1);
    ok(
      await f.cmd("asset.ready", a.id, {
        expected_version: moved.version,
        soc: 85,
        evidence: "SIM核验SOC与库存",
      }),
    );
    assert.equal((await f.get("stations", a.station_id)).inventory, before);
    const mounted = await f.get("assets", "AS6");
    assert.equal(
      (
        await f.cmd("asset.move", mounted.id, {
          expected_version: mounted.version,
          station_id: "S002",
          evidence: "禁止脱离在途电池",
        })
      ).statusCode,
      422,
    );
  } finally {
    await f.close();
  }
});

test("提交、退回、再次提交及核验保留历史，审计所属主体跟随实际对象", async () => {
  const f = await fixture();
  try {
    const d = await delivered(f);
    let t = await f.get("tasks", d.id);
    ok(
      await d.driver.cmd("task.submit", d.id, {
        expected_version: t.version,
        evidence: "SIM首次完工提交",
        remaining_reason: "SIM本批只提交首趟30吨，余量待调度处理",
      }),
    );
    t = await f.get("tasks", d.id);
    ok(
      await f.cmd("task.return", d.id, {
        expected_version: t.version,
        reason: "补充凭证",
      }),
    );
    t = await f.get("tasks", d.id);
    ok(
      await d.driver.cmd("task.submit", d.id, {
        expected_version: t.version,
        evidence: "SIM补充完工提交",
        remaining_reason: "SIM补齐首趟凭证，余量待调度处理",
      }),
    );
    t = await f.get("tasks", d.id);
    ok(
      await f.cmd("task.verify", d.id, {
        expected_version: t.version,
        verified_quantity: 30,
        evidence: "SIM逐车次核验",
      }),
    );
    t = await f.get("tasks", d.id);
    assert.equal(t.submission_history.length, 2);
    assert.deepEqual(
      t.verification_history.map((e) => e.action),
      ["退回补充", "核验通过"],
    );
    const audit = f.db
      .prepare("SELECT * FROM audit WHERE entity_id=? AND action='task.verify'")
      .get(t.id);
    assert.equal(audit.owner_id, t.owner_id);
    assert.equal(audit.after_version, t.version);
  } finally {
    await f.close();
  }
});

test("AI解释标注输入变化，资料修改不沿用旧预测作当前建议", async () => {
  const f = await fixture();
  try {
    ok(await f.cmd("forecast.load", null, {}));
    f.db.prepare("UPDATE charging SET version=version+1").run();
    ok(await f.admin.req("/api/assistant", { question: "解释最近负荷预测" }));
    assert(
      f.calls[0].forecasts.some((r) =>
        r.context_validity.includes("输入已变化"),
      ),
    );
  } finally {
    await f.close();
  }
});
