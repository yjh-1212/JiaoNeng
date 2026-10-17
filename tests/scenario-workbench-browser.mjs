import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";
import { loadConfig } from "../server/config.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const db = database(":memory:"),
  config = loadConfig(),
  live = process.env.SCENARIO_LIVE_AI === "1",
  modelCalls = [],
  errors = [],
  checks = [],
  out = "docs/development/changes/CR-008/";
const modelFetch = live
  ? fetch
  : async (url, o) => {
      const data = JSON.parse(o.body);
      modelCalls.push(data);
      return Response.json({
        model: "TEST_MODEL_DOUBLE",
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary:
                  "本次为测试替身：按模拟装卸、车流和补能约束比选，实际派单需要人工确认。",
                recommended_id: "A",
                reasons: ["指标来自服务端计算"],
                suggestions: [
                  {
                    label: "增加卸载车位后比较",
                    patch: { unloading_slots: 3 },
                  },
                ],
              }),
            },
          },
        ],
      });
    };
const { app } = createApp({
    db,
    config: { ...config, ...(!live ? { deepseekKey: "test-double" } : {}) },
    modelFetch,
  }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({ headless: true }),
  p = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error" && m.text().includes("UI_RENDER_ERROR")) {
    errors.push(m.text());
    console.log(m.text());
  }
});
const button = (name) => p.getByRole("button", { name, exact: true });
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS", name);
};
const waitRun = async () => {
  await p.waitForFunction(
    () =>
      document.querySelectorAll(".scene-plan-options button").length === 3 &&
      !document.querySelector(".scene-running"),
    null,
    { timeout: 90000 },
  );
};
const shot = async (name) => {
  await p.waitForFunction(() => !document.querySelector(".scene-running"));
  await p.screenshot({ path: out + name, fullPage: true });
};
const select = async (label, value) => {
  await p.getByLabel(label, { exact: true }).click();
  await p.locator(".ant-select-item-option").filter({ hasText: value }).click();
};
try {
  const before = Object.fromEntries(
    ["orders", "tasks", "charging"].map((t) => [
      t,
      db.prepare("SELECT count(*) n FROM " + t).get().n,
    ]),
  );
  await p.goto("http://127.0.0.1:" + server.address().port);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await button("登录").click();
  await p.waitForFunction(
    () => document.querySelector(".content h1")?.textContent === "运营总览",
  );
  await p.evaluate(() => (location.hash = "simulation"));
  await button("开始推演").waitFor();
  await p.locator('.scene-map-canvas[data-map-ready="true"]').waitFor();
  assert(!(await button("生成派单任务").isEnabled()));
  assert.equal(await button("历史版本").count(), 0);
  assert.equal(await button("业务示意").count(), 0);
  await button("开始推演").click();
  await waitRun();
  assert.equal(
    db.prepare("SELECT count(*) n FROM tasks").get().n,
    before.tasks,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM orders").get().n,
    before.orders,
  );
  const result = JSON.parse(
    db
      .prepare("SELECT data FROM records WHERE resource='simulation-scenarios'")
      .get().data,
  ).result;
  assert.equal(result.ai.status, "ready");
  assert(Object.keys(result.routes).length >= 6);
  assert((await p.locator(".scene-gantt-row").count()) > 0);
  log("需求/订单只提供来源，地图浮层+底部结果完整，推演调用模型且不生成任务");
  await button("播放推演").click();
  await p.waitForFunction(
    () =>
      document
        .querySelector(".scene-playback .ant-slider-handle")
        ?.getAttribute("aria-valuenow") !== "0",
  );
  await button("暂停推演").click();
  await select("推演倍速", "10×");
  await button("下一关键时刻").click();
  const bar = p.locator(".scene-playback .ant-slider"),
    bounds = await bar.boundingBox();
  await bar.click({
    position: { x: bounds.width * 0.55, y: bounds.height / 2 },
  });
  assert(
    Number(
      await p
        .locator(".scene-playback .ant-slider-handle")
        .getAttribute("aria-valuenow"),
    ) > 400,
  );
  assert((await p.locator(".scene-vehicle").count()) > 0);
  await button("收起条件面板").click();
  await button("条件配置").click();
  await button("收起摘要面板").click();
  await button("推演摘要").click();
  log("播放暂停、10倍速、关键时刻、时间拖动及浮层收展可用");
  await p.getByRole("tab", { name: "补能推演明细", exact: true }).click();
  await p.getByText("按场站", { exact: true }).click();
  await p
    .locator(".scene-results [role=tabpanel]:visible tr[data-row-key]")
    .first()
    .waitFor();
  assert(
    (await p
      .locator(".scene-results [role=tabpanel]:visible tr[data-row-key]")
      .count()) > 0,
  );
  await p.getByRole("tab", { name: "方案对比分析", exact: true }).click();
  assert.equal(
    await p
      .locator(".scene-results [role=tabpanel]:visible tr[data-row-key]")
      .count(),
    3,
  );
  await p.getByRole("tab", { name: "关键事件", exact: true }).click();
  await p
    .locator(".scene-results")
    .getByRole("button", { name: "定位时刻", exact: true })
    .first()
    .click();
  log("补能车辆/场站明细、三方案对比和事件定位均对应同次计算");
  await p.getByRole("tab", { name: "车辆执行时间轴", exact: true }).click();
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await p.setViewportSize({ width, height: 950 });
    await p.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    );
    assert(
      await p
        .locator(".scene-map-canvas")
        .evaluate((el) => el.clientHeight >= 450),
    );
  }
  await shot("workbench-mobile.png");
  await p.setViewportSize({ width: 1600, height: 1050 });
  await shot(live ? "workbench-live.png" : "workbench-browser.png");
  log("桌面与手机无页面横向溢出，地图完整撑满且底部不悬浮");
  if (!live) {
    await p
      .getByRole("button", { name: "增加卸载车位后比较", exact: true })
      .click();
    assert(!(await button("确认方案").isEnabled()));
    await p
      .getByText("条件已变更，请重新推演后确认方案。", { exact: true })
      .waitFor();
    log("模型建议仅填入条件，不自动执行或生成任务");
    await button("中国数联首页").click();
    await p
      .getByRole("dialog", { name: "离开交能推演", exact: true })
      .waitFor();
    await p
      .getByRole("dialog", { name: "离开交能推演", exact: true })
      .getByRole("button", { name: "返回修改", exact: true })
      .click();
    assert((await p.url()).endsWith("#simulation"));
    log("未保存条件离开页面前有保护，取消离开保留输入");
  }
  if (!(await p.getByLabel("运输总量（吨）", { exact: true }).isVisible()))
    await p.getByText("基础任务条件", { exact: true }).click();
  await p.getByLabel("运输总量（吨）", { exact: true }).fill("60");
  if (!(await p.getByLabel("参与车辆数", { exact: true }).isVisible()))
    await p.getByText("车辆与发车", { exact: true }).click();
  await p.getByLabel("初始SOC（%）", { exact: true }).fill("60");
  await button("重新推演").click();
  await waitRun();
  await button("确认方案").click();
  await button("已确认方案").waitFor();
  assert.equal(
    db.prepare("SELECT count(*) n FROM tasks").get().n,
    before.tasks,
  );
  await button("生成派单任务").click();
  await p
    .getByRole("dialog", { name: "核对并生成派单任务", exact: true })
    .waitFor();
  assert.equal(
    db.prepare("SELECT count(*) n FROM tasks").get().n,
    before.tasks,
  );
  assert(await button("确认生成待派发任务").isEnabled());
  await button("确认生成待派发任务").click();
  await button("已生成任务").waitFor();
  assert.equal(
    db.prepare("SELECT count(*) n FROM tasks").get().n,
    before.tasks + 2,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM orders").get().n,
    before.orders,
  );
  await p.reload();
  await button("已生成任务").waitFor();
  assert(!(await button("已生成任务").isEnabled()));
  log("确认方案与生成任务分离，手动核对映射后生成待派发任务，刷新不重复创建");
  await select("推演来源类型", "运输需求");
  await p.waitForFunction(() =>
    document.querySelector(".scene-source")?.textContent.includes("XQ-"),
  );
  if (!(await p.getByLabel("运输总量（吨）", { exact: true }).isVisible()))
    await p.getByText("基础任务条件", { exact: true }).click();
  await p.getByLabel("运输总量（吨）", { exact: true }).fill("30");
  if (!(await p.getByLabel("参与车辆数", { exact: true }).isVisible()))
    await p.getByText("车辆与发车", { exact: true }).click();
  await p.getByLabel("参与车辆数", { exact: true }).fill("1");
  await p.getByLabel("初始SOC（%）", { exact: true }).fill("60");
  await button("开始推演").click();
  await waitRun();
  await button("确认方案").click();
  await button("已确认方案").waitFor();
  await button("生成派单任务").click();
  assert(await button("确认生成待派发任务").isEnabled());
  await button("确认生成待派发任务").click();
  await button("已生成任务").waitFor();
  assert.equal(
    db.prepare("SELECT count(*) n FROM orders").get().n,
    before.orders + 1,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM tasks").get().n,
    before.tasks + 3,
  );
  log("需求来源在最后手动动作才创建订单并生成任务，数量守恒");
  const legacyCount = db.prepare("SELECT count(*) n FROM simulations").get().n;
  await p.evaluate(() => (location.hash = "assistant"));
  await button("整理运输条件").click();
  const originalCode = db.prepare("SELECT code FROM orders WHERE id='O013'").get().code;
  await select("来源订单", originalCode);
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "保存并核对", exact: true })
    .click();
  await button("进入交能推演").click();
  await button("已生成任务").waitFor();
  assert.equal(
    db.prepare("SELECT count(*) n FROM simulations").get().n,
    legacyCount,
  );
  log("智能助手跳转新版工作台并恢复已有方案，不再运行旧推演");
  db.prepare("UPDATE orders SET status='草稿'").run();
  db.prepare("UPDATE demands SET status='草稿'").run();
  await p.reload();
  await p.getByText("暂无可推演的已确认需求或订单", { exact: true }).waitFor();
  log("没有可用来源时提供清晰空状态与运输需求入口");
  assert.deepEqual(errors, []);
  log("无页面运行错误，业务写入仅发生在隔离测试库");
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      {
        checks,
        errors,
        live_ai: live,
        model: result.ai.model,
        real_road_paths: Object.keys(result.routes).length,
        database: "isolated simulated SQLite",
        secrets_logged: false,
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  await p.screenshot({ path: out + "browser-failure.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
}
