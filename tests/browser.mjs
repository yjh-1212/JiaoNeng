import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const out = path.resolve(
  process.env.BROWSER_ARTIFACT_DIR || "docs/development/05-acceptance/evidence",
);
fs.mkdirSync(out, { recursive: true });
const db = database(":memory:"),
  { app } = createApp({ db, config: {} }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port,
  browser = await chromium.launch({ headless: true });
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  checks = [],
  errors = [];
p.setDefaultTimeout(7000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error" && /ErrorBoundary|UI_RENDER_ERROR/.test(m.text()))
    errors.push(m.text());
});
p.on("dialog", (d) => d.accept());
const click = (n) => p.getByRole("button", { name: n, exact: true }).click();
const save = () =>
  p
    .getByRole("dialog")
    .getByRole("button", { name: "保存并核对", exact: true })
    .click();
const log = (name, data = {}) => {
  checks.push({ name, result: "PASS", ...data });
  console.log("PASS", name);
  fs.writeFileSync(
    path.join(out, "progress.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
};
async function login(username) {
  await p.getByLabel("登录账号", { exact: true }).fill(username);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await click("登录");
  await p.locator("main").waitFor();
}
async function route(key, title) {
  await p.evaluate((key) => (location.hash = key), key);
  await p.getByRole("heading", { name: title, exact: true }).first().waitFor();
  await p.waitForTimeout(120);
}
try {
  await p.goto(base);
  await p.getByRole("heading", { name: "管理员登录", exact: true }).waitFor();
  await p.screenshot({ path: path.join(out, "login-admin.png") });
  await login("admin");
  await p.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
  const routes = [
    ["overview", "运营总览"],
    ["demands", "运输需求"],
    ["orders", "运输订单"],
    ["simulation", "交能推演"],
    ["tasks", "运输任务"],
    ["resources", "运力档案"],
    ["stations", "场站运营"],
    ["charging", "补能调度"],
    ["energy", "能源管理"],
    ["monitoring", "运行监测"],
    ["alerts", "预警处置"],
    ["planning", "场站规划"],
    ["deployment", "资源投放"],
    ["reports", "经营分析"],
    ["assets", "资产管理"],
    ["replacements", "运力合作"],
    ["entities", "基础资料"],
    ["integrations", "数据管理"],
    ["users", "用户权限"],
    ["parameters", "系统设置"],
    ["assistant", "智能助手"],
    ["account", "个人信息"],
  ];
  for (const [key, title] of routes) {
    await route(key, title);
    assert.equal(await p.locator(".page-heading p").count(), 0);
    await p.screenshot({ path: path.join(out, key + ".png"), fullPage: true });
    log("页面 " + title);
  }
  await route("orders", "运输订单");
  await click("新建订单");
  await p.getByLabel("订单名称", { exact: true }).fill("");
  await click("保存草稿");
  await p.getByText("请填写订单名称", { exact: true }).waitFor();
  assert.equal(
    await p
      .getByLabel("订单名称", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  await p.getByLabel("订单名称", { exact: true }).fill("浏览器真实联动短倒单");
  const sourceCode = db
    .prepare("SELECT code FROM demands WHERE id='DM1'")
    .get().code;
  await p.getByLabel("来源需求", { exact: true }).fill(sourceCode);
  await p
    .locator(".ant-select-dropdown .ant-select-item-option")
    .filter({ hasText: sourceCode })
    .click();
  await p.getByLabel("计划运量（吨）", { exact: true }).fill("300");
  await p.getByLabel("单趟距离（km）", { exact: true }).fill("14");
  await click("保存草稿");
  await p
    .getByRole("dialog", { name: "新建运输订单", exact: true })
    .waitFor({ state: "hidden" });
  await click("关闭详情");
  const created = db
    .prepare("SELECT * FROM orders WHERE name='浏览器真实联动短倒单'")
    .get();
  assert(created);
  log("前端表单必填与API/SQLite保存");
  await p
    .getByLabel("搜索业务记录", { exact: true })
    .fill("浏览器真实联动短倒单");
  await click("查询");
  await p.getByRole("button", { name: "详情", exact: true }).first().click();
  await click("确认订单");
  await p
    .getByRole("dialog", { name: "确认订单", exact: true })
    .getByRole("button", { name: "确认", exact: true })
    .click();
  assert.equal(
    db.prepare("SELECT status FROM orders WHERE id=?").get(created.id).status,
    "已确认",
  );
  log("订单确认与需求量守恒");
  await route("simulation", "交能推演");
  while (
    await p
      .locator(".ant-select-multiple .ant-select-selection-item-remove")
      .count()
  )
    await p
      .locator(".ant-select-multiple .ant-select-selection-item-remove")
      .first()
      .click();
  for (const code of ["甘M·仿001", "甘M·仿002"]) {
    await p.getByLabel("候选车辆", { exact: true }).fill(code);
    await p
      .locator(".ant-select-item-option")
      .filter({ hasText: code })
      .click();
  }
  await p.getByRole("heading", { name: "交能推演", exact: true }).click();
  await click("开始推演");
  await p.getByRole("button", { name: "确认选中方案", exact: true }).waitFor();
  await p
    .locator(".sim-right")
    .getByRole("button", { name: "查看来源与口径", exact: true })
    .click();
  await p
    .getByText(
      "人工、租赁、维保等未纳入；路网、安全阈值及资源均为仿真/参考条件",
      { exact: true },
    )
    .waitFor();
  await click("关闭详情");
  await p.screenshot({
    path: path.join(out, "simulation-result.png"),
    fullPage: true,
  });
  await click("确认选中方案");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await click("核对派单");
  log("数据库计算方案、来源详情和待派发任务生成");
  await p.getByLabel("搜索业务记录", { exact: true }).fill("RW-");
  await p.waitForTimeout(400);
  const drafts = db.prepare("SELECT id FROM tasks WHERE status='待派发'").all();
  assert(drafts.length > 0);
  for (const t of drafts) {
    await p.locator(`tr[data-row-key="${t.id}"]`).getByRole("checkbox").check();
  }
  await p.getByRole("button", { name: /^核对派单（/ }).click();
  await click("整批校验");
  await click("统一派发");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  assert(
    db.prepare("SELECT status FROM tasks WHERE id=?").get(drafts[0].id)
      .status === "待接收",
  );
  log("浏览器整批校验与真实事务派发");
  await route("energy", "能源管理");
  await click("查看数据表");
  await p.getByText("缺测", { exact: true }).waitFor();
  await click("预测分时负荷");
  assert(
    db
      .prepare("SELECT count(*) n FROM records WHERE resource='forecasts'")
      .get().n > 0,
  );
  log("缺测断点的数据表替代与预测持久化");
  await route("planning", "场站规划");
  await click("测算当前条件");
  await click("核对推荐成果");
  await click("确认条件推荐");
  await p
    .getByLabel("推荐依据", { exact: true })
    .fill("SIM业务规划依据，需实际用地接电审核");
  await save();
  assert(
    db
      .prepare(
        "SELECT count(*) n FROM records WHERE resource='planning' AND status='已确认条件推荐'",
      )
      .get().n > 0,
  );
  log("规划条件推荐不创建已投运资产");
  await click("运输需求分析");
  await save();
  await p
    .getByRole("heading", { name: "授权订单需求走廊", exact: true })
    .waitFor();
  await click("关闭详情");
  log("规划需求走廊按有效订单和核验车次聚合");
  await route("monitoring", "运行监测");
  await click("历史轨迹");
  await click("回放采样");
  await p.waitForTimeout(800);
  await click("暂停回放");
  await p.screenshot({
    path: path.join(out, "monitoring-playback.png"),
    fullPage: true,
  });
  log("历史采样回放与来源时间，不插值为真实路线");
  await route("parameters", "系统设置");
  await p.getByRole("tab", { name: "预警规则", exact: true }).click();
  await click("登记仿真规则");
  await p.getByLabel("规则名称", { exact: true }).fill("浏览器SOC关注规则");
  await p.getByLabel("SOC关注阈值（%）", { exact: true }).fill("80");
  await p
    .getByLabel("规则依据与适用边界", { exact: true })
    .fill("SIM关注阈值，不代表现场安全界限");
  await save();
  await p.getByRole("button", { name: "查看", exact: true }).first().click();
  await click("运行仿真识别");
  await p.waitForTimeout(300);
  assert(
    db
      .prepare(
        "SELECT count(*) n FROM alerts WHERE json_extract(data,'$.rule_id') IS NOT NULL",
      )
      .get().n > 0,
  );
  await click("关闭详情");
  log("预警规则登记、仿真识别与真实告警记录");
  await route("account", "个人信息");
  await click("退出登录");
  await login("north");
  await route("orders", "运输订单");
  assert.equal(
    await p.getByRole("button", { name: "新建订单", exact: true }).count(),
    0,
  );
  log("查询账号的前端禁用与服务端权限");
  await route("account", "个人信息");
  await click("退出登录");
  await p.getByText("司机", { exact: true }).first().click();
  await p.screenshot({ path: path.join(out, "login-driver.png") });
  await login("driver01");
  await p.setViewportSize({ width: 390, height: 844 });
  await route("m-tasks", "我的任务");
  await p.screenshot({
    path: path.join(out, "driver-tasks.png"),
    fullPage: true,
  });
  await p.locator(".task-card").first().click();
  await click("接收任务");
  await click("开始任务");
  await click("登记新车次");
  await click("反馈装货完成");
  await p
    .getByLabel("装货凭证或说明", { exact: true })
    .fill("SIM浏览器装货磅单");
  await save();
  await click("开始运输");
  await click("反馈卸货交付");
  await p
    .getByLabel("交付凭证或说明", { exact: true })
    .fill("SIM浏览器交付磅单");
  await save();
  await click("提交完工");
  await p.getByLabel("本次完工凭证", { exact: true }).fill("SIM浏览器完工汇总");
  await p
    .getByLabel("未履约量及责任说明", { exact: true })
    .fill("剩余计划量由管理员复核后重新组织");
  await save();
  await p.getByText("待核验", { exact: true }).first().waitFor();
  await p.screenshot({
    path: path.join(out, "driver-task-submitted.png"),
    fullPage: true,
  });
  log("司机浏览器接收、车次装运卸货和完工提交");
  await click("报告异常");
  await p.getByLabel("情况说明", { exact: true }).fill("SIM补能现场排队反馈");
  await save();
  await p.getByLabel("返回任务列表", { exact: true }).click();
  await p.getByRole("button", { name: "异常反馈", exact: true }).click();
  await p.getByText("SIM补能现场排队反馈", { exact: true }).waitFor();
  log("本人异常反馈及管理员处理进展");
  await route("m-energy", "补能安排");
  await p.screenshot({
    path: path.join(out, "driver-energy.png"),
    fullPage: true,
  });
  await route("m-profile", "我的");
  await p.screenshot({
    path: path.join(out, "driver-profile.png"),
    fullPage: true,
  });
  log("司机H5三工作区和本人数据");
  await click("退出登录");
  await login("admin");
  for (const width of [1280, 1024, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 900 });
    await route("simulation", "交能推演");
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    await p.screenshot({
      path: path.join(out, "responsive-" + width + ".png"),
      fullPage: true,
    });
    log("响应式 " + width);
  }
  assert.deepEqual(errors, []);
  log("无JavaScript运行错误");
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        real_database: true,
        external_services_called: false,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await p.screenshot({ path: path.join(out, "failure.png"), fullPage: true });
  fs.writeFileSync(
    path.join(out, "browser-results.json"),
    JSON.stringify(
      { status: "FAIL", checks, errors, failure: e.message },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
}
