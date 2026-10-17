import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture, scheme, ok } from "./helpers.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = process.env.TASK_BROWSER_OUTPUT || "docs/development/changes/CR-017/",
  f = await fixture(),
  s = await scheme(f),
  checks = [],
  errors = [];
const b = await chromium.launch({ headless: true }),
  p = await b.newPage({ viewport: { width: 1680, height: 1050 } });
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => errors.push(e.message));
const button = (n) => p.getByRole("button", { name: n, exact: true }),
  log = (name) => {
    checks.push({ name, status: "PASS" });
    console.log("PASS", name);
  },
  shot = (name) => p.screenshot({ path: out + name, fullPage: true }),
  confirm = async (title) => {
    const dialog = p.getByRole("dialog", { name: title, exact: true });
    await dialog.getByRole("button", { name: "确认", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  },
  row = (code) =>
    p
      .locator(".task-main-table tbody tr[data-row-key]")
      .filter({ hasText: code }),
  state = async (id) => ok(await f.get("tasks", id)),
  refreshRows = async (trigger) => {
    await p.locator(".task-main-table .ant-spin-spinning").waitFor({state:"hidden"});
    const wait = p.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/task-workspace",
    );
    await trigger();
    const res = await wait;
    assert.equal(res.status(), 200);
    const d = await res.json();
    await p.waitForFunction(
      (ids) =>
        JSON.stringify(
          [
            ...document.querySelectorAll(
              ".task-main-table tbody tr[data-row-key]",
            ),
          ].map((e) => e.getAttribute("data-row-key")),
        ) === JSON.stringify(ids),
      d.items.map((r) => r.id),
    );
    return d;
  },
  search = async (text) => {
    await p.getByLabel("查询运输任务", { exact: true }).fill(text);
    return refreshRows(() => button("查询").click());
  },
  select = async (label, text) => {
    await p.getByLabel(label, { exact: true }).click();
    await p
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .filter({ hasText: text })
      .first()
      .click();
  };
try {
  await p.goto(f.base);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await button("登录").click();
  await p.locator("main").waitFor();
  await refreshRows(() => p.evaluate(() => (location.hash = "tasks")));
  assert.equal(
    await p.locator(".task-main-table tbody tr[data-row-key]").count(),
    10,
  );
  assert.match(
    await p.locator(".task-main-table .ant-pagination-options").textContent(),
    /10\s*条\/页/,
  );
  for (const name of ["线路 / 货物", "计划时间", "执行进度", "状态 / 待办"])
    await p.getByRole("columnheader", { name, exact: true }).waitFor();
  assert.equal(await p.getByRole("tab", { name: /待派发 2/ }).count(), 1);
  await shot("task-list.png");
  log("设计图布局、完整业务信息、真实状态数量与默认10条分页");
  const q = await search("DD-2610-0013");
  assert.equal(q.total, 2);
  assert(q.items.every((t) => t.driver_name));
  await p.locator(".task-main-table thead input[type=checkbox]").check();
  assert(await button("批量派发（2）").isEnabled());
  await refreshRows(() => button("重置").click());
  assert(!(await button("批量派发").isEnabled()));
  const v = await search("甘M·仿001");
  assert(v.total > 0);
  assert(v.items.every((t) => t.vehicle_code === "甘M·仿001"));
  await refreshRows(() => button("重置").click());
  await select("任务状态筛选", "待核验");
  const exact = await refreshRows(() => button("查询").click());
  assert.equal(exact.total, 1);
  await refreshRows(() => button("重置").click());
  log("订单/车牌关联搜索、固定状态选项、查询重置与选择失效");
  await refreshRows(() => p.getByRole("tab", { name: /^待派发 / }).click());
  await row(s.tasks[0].code)
    .getByRole("button", { name: s.tasks[0].code, exact: true })
    .click();
  const detail = p.getByRole("dialog", { name: "运输任务详情", exact: true });
  await detail.getByRole("tab", { name: "车次执行", exact: true }).click();
  await detail.getByRole("tab", { name: "补能安排", exact: true }).click();
  await detail.getByRole("tab", { name: "操作记录", exact: true }).click();
  await shot("task-detail.png");
  await detail
    .getByRole("button", { name: "关闭", exact: true })
    .last()
    .click();
  log("任务专用右侧详情分组、车次凭证、补能与操作记录");
  await p.locator(".task-main-table thead input[type=checkbox]").check();
  await button("批量派发（2）").click();
  const batch = p.getByRole("dialog", { name: "派单核对", exact: true });
  await batch.getByRole("button", { name: "整批校验", exact: true }).click();
  await p.getByText("整批校验通过，可以确认派发。", { exact: true }).waitFor();
  assert(
    s.tasks.every(
      (t) =>
        f.db.prepare("SELECT status FROM tasks WHERE id=?").get(t.id).status ===
        "待派发",
    ),
  );
  await shot("dispatch-preview.png");
  f.db
    .prepare("UPDATE vehicles SET version=version+1 WHERE id=?")
    .run(s.tasks[1].vehicle_id);
  await batch.getByRole("button", { name: "确认派发", exact: true }).click();
  await confirm("确认统一派发");
  await batch
    .getByText("更换运力或资源版本需重新推演，全批未派发", { exact: true })
    .waitFor();
  assert(
    s.tasks.every(
      (t) =>
        f.db.prepare("SELECT status FROM tasks WHERE id=?").get(t.id).status ===
        "待派发",
    ),
  );
  await batch.getByRole("button", { name: "整批校验", exact: true }).click();
  await batch.getByText(new RegExp(s.tasks[1].code)).last().waitFor();
  await shot("dispatch-conflict.png");
  f.db
    .prepare("UPDATE vehicles SET version=version-1 WHERE id=?")
    .run(s.tasks[1].vehicle_id);
  await batch.getByRole("button", { name: "整批校验", exact: true }).click();
  await p.getByText("整批校验通过，可以确认派发。", { exact: true }).waitFor();
  let lostResponse = false;
  await p.route("**/api/commands", async (r) => {
    if (
      !lostResponse &&
      r.request().postDataJSON()?.type === "dispatch.batch"
    ) {
      lostResponse = true;
      await r.fetch();
      await r.abort("failed");
    } else await r.continue();
  });
  await batch.getByRole("button", { name: "确认派发", exact: true }).click();
  await confirm("确认统一派发");
  await batch
    .getByRole("button", { name: "核查派发结果", exact: true })
    .click();
  await batch.waitFor({ state: "hidden" });
  await p.unroute("**/api/commands");
  assert.equal(
    await p.getByText("上次写入结果待核查", { exact: true }).count(),
    0,
  );
  assert((await state(s.tasks[0].id)).status === "待接收");
  log(
    "派单抽屉预检只读、冲突逐项反馈、提交再次校验且全批不生效、修正后统一派发",
  );
  await refreshRows(() => p.getByRole("tab", { name: /^全部 / }).click());
  await search(s.tasks[0].code);
  await row(s.tasks[0].code)
    .getByRole("button", { name: "调整", exact: true })
    .click();
  const edit = p.getByRole("dialog", { name: "调整任务安排", exact: true });
  await p
    .getByLabel("任务调整原因", { exact: true })
    .fill("CR17业务改期，重新测算");
  await edit.getByRole("button", { name: "保存时间调整", exact: true }).click();
  await edit.waitFor({ state: "hidden" });
  assert((await state(s.tasks[0].id)).requires_resimulation);
  await row(s.tasks[0].code)
    .getByRole("button", { name: "重新推演", exact: true })
    .click();
  await p
    .getByLabel("任务调整原因", { exact: true })
    .fill("CR17取消未执行安排，重新推演剩余量");
  await button("取消并重新推演").click();
  await confirm("取消并重新推演");
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  assert(p.url().includes("new=1"));
  assert.equal(await p.locator(".floating-plans").count(), 0);
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    String(s.tasks[0].quantity_kg / 1000),
  );
  assert.equal((await state(s.tasks[0].id)).status, "已取消");
  assert.equal(f.db.prepare("SELECT count(*) n FROM tasks").get().n, 18);
  await shot("replan-handoff.png");
  log(
    "调整后禁止派发，明确取消原未执行安排再携订单剩余量新建推演，不重复生成任务",
  );
  await refreshRows(() => p.evaluate(() => (location.hash = "tasks")));
  await refreshRows(() => button("重置").click());
  await refreshRows(() => p.getByRole("tab", { name: /^待核验 / }).click());
  await row("RW-当前-003")
    .getByRole("button", { name: "核验完工", exact: true })
    .click();
  const verify = p.getByRole("dialog", { name: "核验完工", exact: true });
  await p
    .getByLabel("任务核验依据", { exact: true })
    .fill("CR17逐车次磅单与交付凭证已核对");
  f.db.prepare("UPDATE tasks SET version=version+1 WHERE id='TA003'").run();
  await verify.getByRole("button", { name: "核验通过", exact: true }).click();
  await confirm("核验完工通过");
  await button("读取最新任务").waitFor();
  assert.equal(
    await p.getByLabel("任务核验依据", { exact: true }).inputValue(),
    "CR17逐车次磅单与交付凭证已核对",
  );
  await button("读取最新任务").click();
  await verify.getByRole("button", { name: "核验通过", exact: true }).waitFor();
  await shot("verification.png");
  await verify.getByRole("button", { name: "核验通过", exact: true }).click();
  await confirm("核验完工通过");
  await verify.waitFor({ state: "hidden" });
  assert.equal((await state("TA003")).verified_kg, 60000);
  assert.equal((await state("TA003")).status, "已完成");
  log("核验抽屉逐车次凭证、冲突保留输入，读取最新版本再人工确认通过");
  const original = f.db.prepare("SELECT * FROM tasks WHERE id='TA003'").get(),
    newRow = {
      ...original,
      id: "CR17-RETURN",
      code: "CR17-退回样本",
      status: "待核验",
      version: 1,
      verified_kg: 0,
    },
    cols = Object.keys(newRow);
  f.db
    .prepare(
      `INSERT INTO tasks(${cols.join(",")}) VALUES(${cols.map(() => "?").join(",")})`,
    )
    .run(...cols.map((k) => newRow[k]));
  await refreshRows(() => button("查询").click());
  await row("CR17-退回样本")
    .getByRole("button", { name: "核验完工", exact: true })
    .click();
  await p
    .getByLabel("任务退回说明", { exact: true })
    .fill("请补充第二车次交付凭证");
  await p
    .getByRole("dialog", { name: "核验完工", exact: true })
    .getByRole("button", { name: "退回补充", exact: true })
    .click();
  await p.getByRole("dialog", { name: "核验完工", exact: true }).waitFor({state:"hidden"});
  assert.equal((await state("CR17-RETURN")).status, "退回补充");
  log("有差异退回补充，未用总量编辑绕过车次核验");
  await refreshRows(() => button("重置").click());
  await p.getByText("排程", { exact: true }).click();
  await p.locator(".task-schedule-canvas").waitFor();
  await shot("schedule.png");
  await p.getByText("列表", { exact: true }).click();
  await p.locator(".task-main-table").waitFor();
  for (const width of [1680, 1440, 1280, 1024, 768, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    );
  }
  await shot("mobile.png");
  await p.setViewportSize({ width: 1680, height: 1050 });
  await shot("task-list-final.png");
  log("统一时间轴排程、同页切换及390–1680px无页面横向溢出");
  const ro = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await ro.goto(f.base);
  await ro.getByLabel("登录账号", { exact: true }).fill("north");
  await ro.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await ro.getByRole("button", { name: "登录", exact: true }).click();
  await ro.locator("main").waitFor();
  await ro.evaluate(() => (location.hash = "tasks"));
  await ro.locator(".task-main-table tbody tr[data-row-key]").first().waitFor();
  assert.equal(await ro.getByRole("button", { name: /批量派发/ }).count(), 0);
  assert.equal(
    await ro.getByRole("button", { name: "核验完工", exact: true }).count(),
    0,
  );
  await ro.close();
  log("查询账号可读且无派发/核验入口");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        database: "isolated in-memory SQLite",
        external_model_calls: 0,
        local_business_mutations: false,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await shot("browser-failure.png");
  throw e;
} finally {
  await b.close();
  await f.close();
}
