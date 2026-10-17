// CR-009: isolated business database, real AMap roads/POI, optional explicitly-authorized live DeepSeek.
import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";
import { loadConfig } from "../server/config.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const out = "docs/development/changes/CR-015/",
  db = database(":memory:"),
  config = loadConfig(),
  live = process.env.SCENARIO_LIVE_AI === "1",
  checks = [],
  errors = [],
  modelCalls = [];
const modelFetch = live
  ? fetch
  : async (url, o) => {
      const body = JSON.parse(o.body),
        facts = JSON.parse(body.messages[1].content);
      modelCalls.push(body);
      const content = facts.current
        ? { answer: "测试替身：先填写运输总量和起终点，再选择运输目标。" }
        : facts.question
          ? facts.question.includes("卸载")
            ? {
                answer: "测试替身：将增加1个卸载车位，确认后重新测算。",
                summary: "测试替身：增加1个卸载车位",
                patch: { unloading_slots: facts.baseline.unloading_slots + 1 },
                unsupported: [],
              }
            : {
                answer:
                  "测试替身：当前瓶颈来自装卸与车辆周转，请核实现场资源。",
                patch: {},
                unsupported: [],
              }
          : {
              summary: "测试替身：根据计算指标比较运输方案，社会车流为模拟。",
              recommended_id:
                facts.candidates.find((c) => c.feasible)?.id || null,
              reasons: ["指标来自离散事件计算"],
              suggestions: [],
            };
      return Response.json({
        model: "TEST_MODEL_DOUBLE",
        choices: [{ message: { content: JSON.stringify(content) } }],
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
  if (m.type() === "error" && m.text().includes("UI_RENDER_ERROR"))
    errors.push(m.text());
});
const button = (name) => p.getByRole("button", { name, exact: true }),
  log = (name) => {
    checks.push({ name, status: "PASS" });
    console.log("PASS", name);
  },
  counts = () =>
    Object.fromEntries(
      ["demands", "orders", "tasks"].map((t) => [
        t,
        db.prepare("SELECT count(*) n FROM " + t).get().n,
      ]),
    ),
  select = async (label, text) => {
    await p.getByLabel(label, { exact: true }).click();
    await p
      .locator(".ant-select-item-option")
      .filter({ hasText: text })
      .first()
      .click();
  },
  latest = () => {
    const row = db
      .prepare(
        "SELECT data FROM records WHERE resource='simulation-scenarios' ORDER BY created_at DESC LIMIT 1",
      )
      .get();
    return row ? JSON.parse(row.data) : null;
  },
  run = async (name = "生成运输方案") => {
    const r = p.waitForResponse(
      async (r) =>
        new URL(r.url()).pathname === "/api/commands" &&
        r.request().postDataJSON()?.type === "scenario.run",
      { timeout: 110000 },
    );
    await button(name).click();
    const response = await r,
      data = await response.json();
    assert.equal(response.status(), 200, data.message);
    await p.waitForFunction(() => !document.querySelector(".goal-computing"));
    await p.locator(".floating-plans").waitFor();
    return data.scenario;
  },
  shot = async (name) => {
    await p.screenshot({ path: out + name, fullPage: true });
  },
  expanded = async () => {
    if (await button("调整条件").count()) await button("调整条件").click();
  };
try {
  await p.goto("http://127.0.0.1:" + server.address().port);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await button("登录").click();
  await p.locator("main").waitFor();
  await p.evaluate(() => (location.hash = "simulation"));
  await button("生成运输方案").waitFor();
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await p.getByLabel("货物类型", { exact: true }).inputValue(),
    "",
  );
  await p.getByLabel("货物类型", { exact: true }).click();
  for (const cargo of [
    "煤炭",
    "矿石",
    "砂石骨料",
    "钢材",
    "水泥",
    "熟料",
    "粉煤灰",
    "焦炭",
    "粮食",
    "其他",
  ]) {
    await p.getByLabel("货物类型", { exact: true }).fill(cargo);
    await p
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .filter({ hasText: new RegExp("^" + cargo + "$") })
      .waitFor();
  }
  await p.getByLabel("货物类型", { exact: true }).press("Escape");
  assert.equal(await p.getByLabel("推演来源类型", { exact: true }).count(), 0);
  assert.equal(await p.getByLabel("试算业务主体", { exact: true }).count(), 0);
  assert.equal(await button("新建推演").count(), 0);
  assert.equal(await button("保存条件").count(), 0);
  await shot("manual-initial.png");
  await button("测算条件").click();
  await p.getByLabel("试算业务主体", { exact: true }).waitFor();
  await select("试算业务主体", "南区");
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  await button("测算条件").click();
  await select("试算业务主体", "北区");
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  await button("测算条件").click();
  await button("完成设置").click();
  await p.evaluate(() => (location.hash = "orders"));
  await p.getByLabel("搜索业务记录", { exact: true }).fill("DD-2610-0013");
  await button("查询").click();
  await button("进入推演").click();
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    "300",
  );
  assert(p.url().includes("order_id=O013"));
  await p.getByLabel("带入来源", { exact: true }).waitFor();
  assert(
    await p
      .getByLabel("货物类型", { exact: true })
      .evaluate((e) => e.closest(".ant-select").textContent.includes("原煤")),
  );
  await p.reload();
  await p.getByLabel("带入来源", { exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    "300",
  );
  await p.evaluate(() => (location.hash = "simulation"));
  await p.waitForFunction(
    () => document.querySelector('[aria-label="运输总量（吨）"]')?.value === "",
  );
  assert.equal(await p.getByLabel("带入来源", { exact: true }).count(), 0);
  await p.evaluate(() => (location.hash = "simulation?order_id=O013"));
  await p.getByLabel("带入来源", { exact: true }).waitFor();
  log("主入口为同一手填表单；旧整排栏已移除，实际订单入口带入且URL刷新恢复");
  assert.equal(await p.locator(".goal-map").count(), 0);
  assert.equal(await p.locator(".scene-floating").count(), 0);
  await p.locator(".scenario-ai-launcher img").waitFor();
  await p.waitForFunction(
    () => document.querySelector(".scenario-ai-launcher img")?.naturalWidth > 0,
  );
  await button("打开交能AI对话").click();
  await p
    .getByRole("button", { name: "我只有货量和起终点，怎么开始？" })
    .click();
  await p.locator(".scenario-ai-message.assistant").waitFor({ timeout: 50000 });
  await p.getByLabel("交能AI消息输入", { exact: true }).press("Escape");
  await button("打开交能AI对话").waitFor();
  assert(
    await button("打开交能AI对话").evaluate(
      (e) => e === document.activeElement,
    ),
  );
  await button("打开交能AI对话").click();
  assert.equal(await p.locator(".scenario-ai-message.assistant").count(), 1);
  await button("关闭交能AI对话").click();
  log("生成的人物图片正常加载，测算前AI引导、对话保留、Escape关闭并恢复焦点");
  await shot("initial.png");
  assert.equal(await p.getByLabel("最晚完成时间", { exact: true }).count(), 0);
  await p.getByLabel("参与车辆数", { exact: true }).fill("2");
  await select("运力范围", "参考车型试算");
  const before = counts(),
    first = await run();
  assert(first.result.recommended_id);
  assert.deepEqual(counts(), before);
  assert.equal(first.result.ai.status, "ready");
  assert(
    first.result.candidates.length >= 1 && first.result.candidates.length <= 3,
  );
  await p
    .locator('.scene-map-canvas[data-map-ready="true"]')
    .waitFor({ timeout: 30000 });
  assert(
    Number(
      await p.locator(".scene-map-canvas").getAttribute("data-route-points"),
    ) > 10,
  );
  await shot(live ? "workbench-live.png" : "workbench.png");
  const panel = await p.locator(".floating-plans").boundingBox(),
    mapBox = await p.locator(".goal-map").boundingBox(),
    playback = await p.locator(".scene-playback").boundingBox();
  assert.equal(Math.round(panel.width), 430);
  assert(panel.x > mapBox.x + mapBox.width / 2);
  assert(playback.x + playback.width <= panel.x);
  await button("收起推荐方案").click();
  assert.equal(await p.locator(".floating-plans").count(), 0);
  await button("推荐方案").click();
  const cards = p.locator(".floating-plan-card");
  if ((await cards.count()) > 1) {
    await cards.nth(1).click();
    assert.equal(await cards.nth(1).getAttribute("aria-pressed"), "true");
    await cards.first().click();
  }
  log(
    "推荐方案在地图右侧430px悬浮，不遮挡播放条，可收起与切换；真实道路与模型分析成功，未生成任务",
  );
  await button("测算条件").click();
  await p.getByLabel("单车载重（吨）", { exact: true }).waitFor();
  await p.getByText("装卸资源约束", { exact: true }).click();
  await p.getByLabel("同时卸载车辆数", { exact: true }).waitFor();
  await button("完成设置").click();
  await button("播放推演").click();
  await p.waitForFunction(
    () =>
      document
        .querySelector(".scene-playback [role=slider]")
        ?.getAttribute("aria-valuenow") !== "0",
  );
  await button("暂停推演").click();
  await select("推演倍速", "10×");
  await button("下一关键时刻").click();
  await p.getByRole("tab", { name: "补能推演明细", exact: true }).click();
  await p.getByText("按场站", { exact: true }).click();
  await p.getByRole("tab", { name: "成本构成", exact: true }).click();
  await p.getByText("已列项目合计", { exact: true }).waitFor();
  await p.getByRole("tab", { name: "风险与依据", exact: true }).click();
  await p
    .getByText("社会车流为模拟到达；车型、装卸和成本参数需核实", {
      exact: true,
    })
    .waitFor();
  log("设置抽屉、地图播放倍速、补能/成本/依据明细可操作");
  await expanded();
  await p.getByText("指定时间前运完", { exact: true }).click();
  await p.getByLabel("车辆数上限", { exact: true }).fill("6");
  const deadline = new Date(+new Date(first.inputs.start_at) + 6 * 3600000),
    local = new Date(deadline - deadline.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await p.getByLabel("最晚完成时间", { exact: true }).fill(local);
  const timed = await run();
  assert(timed.result.search.min_feasible_vehicles > 1);
  assert.equal(timed.result.search.evaluated, 18);
  assert.deepEqual(counts(), before);
  await shot("deadline-solution.png");
  await expanded();
  await p.getByText("按期完成且更省钱", { exact: true }).click();
  const economy = await run();
  assert(economy.result.recommended_id);
  assert(
    economy.result.candidates.find(
      (c) => c.id === economy.result.recommended_id,
    ).feasible,
  );
  log("按期限逐个车数反算与按期成本比选实际计算，三种目标输入不同");
  await shot("economy-solution.png");
  const version = economy.version,
    unloading = economy.inputs.unloading_slots;
  await button("AI解读").click();
  await p
    .getByLabel("交能AI消息输入", { exact: true })
    .fill("解释当前方案的主要瓶颈");
  await button("发送交能AI消息").click();
  await p
    .locator(".scenario-ai-message.assistant")
    .last()
    .waitFor({ timeout: 50000 });
  await p.waitForFunction(
    () => !document.querySelector(".scenario-ai-thinking"),
  );
  await p
    .getByLabel("交能AI消息输入", { exact: true })
    .fill("增加1个卸载车位，其他条件不变");
  await button("发送交能AI消息").click();
  await button("按此条件重算").waitFor({ timeout: 50000 });
  assert.equal(latest().inputs.unloading_slots, unloading);
  assert.deepEqual(counts(), before);
  await shot("adjustment-preview.png");
  const adjusted = await run("按此条件重算");
  assert.equal(adjusted.inputs.unloading_slots, unloading + 1);
  assert(adjusted.version > version);
  await p.getByLabel("与上次方案比较", { exact: true }).waitFor();
  log("DeepSeek只解析预览，用户确认后重算并展示原方案差值");
  await p.route("**/api/scenarios/chat", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "模型解析测试故障" }),
    }),
  );
  await p.getByLabel("交能AI消息输入", { exact: true }).fill("再增加1个卸载位");
  await button("发送交能AI消息").click();
  await p.getByText("模型解析测试故障", { exact: true }).waitFor();
  assert(await p.locator(".floating-plans").isVisible());
  assert.deepEqual(counts(), before);
  await p.unroute("**/api/scenarios/chat");
  const repliesBeforeRetry = await p
    .locator(".scenario-ai-message.assistant")
    .count();
  await button("重试").click();
  await p.waitForFunction(
    (n) =>
      document.querySelectorAll(".scenario-ai-message.assistant").length > n,
    repliesBeforeRetry,
    { timeout: 50000 },
  );
  assert.equal(
    await p.getByText("模型解析测试故障", { exact: true }).count(),
    0,
  );
  await button("关闭交能AI对话").click();
  log("模型失败保留已计算方案与输入，不冒充成功或自动执行");
  await button("采用此方案").click();
  await p
    .getByRole("dialog", { name: "核对并生成派单任务", exact: true })
    .waitFor();
  assert.deepEqual(counts(), before);
  await p
    .getByRole("dialog", { name: "核对并生成派单任务", exact: true })
    .getByRole("button", { name: "取消", exact: true })
    .click();
  log("采用方案与实际生成分开，打开核对抽屉不创建任务");
  if (!live) {
    await expanded();
    await p.getByText("指定时间前运完", { exact: true }).click();
    const d = new Date(+new Date(first.inputs.start_at) + 5 * 60000),
      value = new Date(d - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    await p.getByLabel("最晚完成时间", { exact: true }).fill(value);
    const impossible = await run();
    assert.equal(impossible.result.recommended_id, null);
    assert(!(await button("采用此方案").isEnabled()));
    await p.getByText("当前范围暂无可行方案", { exact: true }).waitFor();
    await shot("no-solution.png");
    log("无解清晰展示模拟交付缺口与原因，禁止采用");
  }
  await button("重置").click();
  if (
    await p.getByRole("dialog", { name: "重置运输条件", exact: true }).count()
  )
    await p
      .getByRole("dialog", { name: "重置运输条件", exact: true })
      .getByRole("button", { name: "确认", exact: true })
      .click();
  await p.waitForURL((u) => u.hash === "#simulation");
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  assert.equal(await p.getByLabel("带入来源", { exact: true }).count(), 0);
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    "",
  );
  await p.getByLabel("货物类型", { exact: true }).fill("煤");
  await p
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: /^煤炭$/ })
    .click();
  await p.getByLabel("运输总量（吨）", { exact: true }).fill("60");
  await button("地图选择起运地").click();
  await p
    .locator('.scene-map-canvas[data-map-ready="true"]')
    .waitFor({ timeout: 30000 });
  const map = p.locator(".scene-map-canvas"),
    bounds = await map.boundingBox();
  await map.click({
    position: { x: bounds.width * 0.46, y: bounds.height * 0.4 },
  });
  await p.waitForFunction(() => !document.querySelector(".goal-pick-banner"));
  log("直接填写可地图选点，随后也可用真实POI替换");
  for (const [label, q] of [
    ["起运地", "庆阳站"],
    ["目的地", "庆阳机场"],
  ]) {
    const response = p.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/maps/search",
    );
    await p.getByLabel(label, { exact: true }).fill(q);
    const r = await response,
      data = await r.json();
    assert.equal(r.status(), 200, data.message);
    assert(data.items.length);
    await p
      .locator(".ant-select-dropdown:visible .ant-select-item-option")
      .first()
      .click();
  }
  const manual = await run();
  assert(manual.result.recommended_id);
  assert.deepEqual(counts(), before);
  assert.equal(manual.source_ref.resource, "manual");
  await button("采用此方案").click();
  await p
    .getByRole("dialog", { name: "核对并生成派单任务", exact: true })
    .waitFor();
  assert.deepEqual(counts(), before);
  assert(await button("确认新建需求、订单并生成任务").isEnabled());
  await shot("manual-execution.png");
  await button("确认新建需求、订单并生成任务").click();
  await button("查看待派发任务").waitFor();
  const after = counts();
  assert.equal(after.demands, before.demands + 1);
  assert.equal(after.orders, before.orders + 1);
  assert(after.tasks > before.tasks);
  assert.equal(
    db
      .prepare("SELECT json_extract(data,'$.cargo') cargo FROM orders ORDER BY created_at DESC LIMIT 1")
      .get().cargo,
    "煤炭",
  );
  log("常用品类下拉及搜索可用，订单原品名保留，手选煤炭贯穿试算与最终订单");
  await p.reload();
  await button("查看待派发任务").waitFor();
  assert.deepEqual(counts(), after);
  assert.equal(latest().source_ref.resource, "manual");
  log(
    "真实POI直接填写试算，最后手动新建需求/订单和任务；刷新恢复来源且不重复创建",
  );
  for (const width of [1600, 1280, 1024, 768, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    );
    assert(await p.locator(".goal-map").evaluate((e) => e.clientHeight >= 380));
    await button("打开交能AI对话").click();
    const chatBox = await p.locator(".scenario-ai-window").boundingBox();
    assert(chatBox.x >= 0 && chatBox.x + chatBox.width <= width);
    await button("关闭交能AI对话").click();
    if (width <= 800) {
      const a = await p.locator(".floating-plans").boundingBox(),
        b = await p.locator(".scene-map-canvas").boundingBox();
      assert(a.y >= b.y + b.height);
    }
  }
  await shot("mobile.png");
  await p.setViewportSize({ width: 1600, height: 1050 });
  await p.getByRole("tab", { name: "车辆执行时间轴", exact: true }).click();
  assert.deepEqual(errors, []);
  log("390–1600px响应式，无页面横向溢出及运行错误");
  await p.goto(
    "http://127.0.0.1:" +
      server.address().port +
      "/#simulation?order_id=MISSING",
  );
  await button("手动填写").click();
  await p.getByLabel("运输总量（吨）", { exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("运输总量（吨）", { exact: true }).inputValue(),
    "",
  );
  assert.deepEqual(counts(), after);
  log("来源异常可转手填，重置不删除既有业务；多主体在测算条件中选择");
  fs.writeFileSync(
    out + (live ? "browser-live.json" : "browser-regression.json"),
    JSON.stringify(
      {
        checks,
        errors,
        live_ai: live,
        model: first.result.ai.model,
        road_paths: Object.keys(first.result.routes).length,
        database: "isolated simulated SQLite",
        model_calls: live ? "real DeepSeek" : modelCalls.length,
        counts_before: before,
        counts_after: after,
        secrets_logged: false,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await shot("browser-failure.png");
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
}
