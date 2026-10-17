import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture } from "./helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const f = await fixture(),
  browser = await chromium.launch({ headless: true }),
  p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  out = process.env.BROWSER_ARTIFACT_DIR
    ? process.env.BROWSER_ARTIFACT_DIR.replace(/\/$/, "") + "/"
    : "docs/development/05-acceptance/evidence/",
  checks = [],
  errors = [];
p.setDefaultTimeout(8000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error" && /UI_RENDER_ERROR/.test(m.text()))
    errors.push(m.text());
});
p.on("dialog", (d) => d.accept());
const click = (name) => p.getByRole("button", { name, exact: true }).click(),
  fill = (name, value) =>
    p.getByLabel(name, { exact: true }).fill(String(value)),
  save = () =>
    p
      .getByRole("dialog")
      .getByRole("button", { name: "保存并核对", exact: true })
      .click();
const select = async (label, text) => {
  await p.getByLabel(label, { exact: true }).click();
  await p
    .locator(".ant-select-item-option")
    .filter({ hasText: text })
    .first()
    .click();
};
const route = async (key, title) => {
  await p.evaluate((key) => (location.hash = key), key);
  await p.getByRole("heading", { name: title, exact: true }).first().waitFor();
  await p.waitForTimeout(120);
};
const log = (label) => {
  checks.push({ name: label, status: "PASS" });
  console.log("PASS", label);
};
try {
  await p.goto(f.base);
  await fill("登录密码", "JiaoNeng2026!");
  await click("登录");
  await p.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
  await route("stations", "场站运营");
  await p.getByRole("tab", { name: "实际作业", exact: true }).click();
  await click("登记实际作业");
  await select("关联场站", "西区集运换电站");
  await select("作业工位", "S002-G1");
  await select("换入电池", "ZC-001");
  await select("换出电池", "ZC-004");
  await fill("计量或换电凭证", "SIM浏览器换电凭证");
  await save();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  const session = f.db
    .prepare(
      "SELECT id FROM sessions WHERE json_extract(data,'$.evidence')='SIM浏览器换电凭证'",
    )
    .get();
  assert(session);
  await p
    .locator(`tr[data-row-key="${session.id}"]`)
    .getByRole("button", { name: "查看", exact: true })
    .click();
  await click("核验作业");
  await fill("核验依据", "SIM核对换入换出及计量");
  await save();
  assert.equal(
    f.db
      .prepare(
        "SELECT json_extract(data,'$.inventory') n FROM stations WHERE id='S002'",
      )
      .get().n,
    2,
  );
  log("换电作业表单与核验后电池库存联动");
  await route("assets", "资产管理");
  await fill("搜索业务记录", "ZC-007");
  await p
    .locator('tr[data-row-key="AS7"]')
    .getByRole("button", { name: "查看", exact: true })
    .click();
  await click("登记租赁");
  await fill("出租主体", "SIM出租主体");
  const local = (v) => {
    const d = new Date(v);
    return new Date(d - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  await fill("租赁开始", local(Date.now() - 3 * 86400000));
  await fill("租赁结束", local(Date.now() - 86400000));
  await fill("租金（元）", 1000);
  await fill("来源与核验依据", "SIM租赁合同");
  await save();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  assert(
    f.db
      .prepare(
        "SELECT json_extract(data,'$.lease.finish_at') value FROM records WHERE id='AS7'",
      )
      .get().value,
  );
  await click("核查租赁到期");
  await p.waitForTimeout(200);
  assert(
    f.db
      .prepare(
        "SELECT 1 FROM alerts WHERE json_extract(data,'$.asset_id')='AS7'",
      )
      .get(),
  );
  log("资产租赁登记、到期核查与预警关联");
  await route("energy", "能源管理");
  await p.getByRole("tab", { name: "策略与计划", exact: true }).click();
  await click("比较能源策略");
  await click("核对协同计划");
  await p
    .getByRole("heading", { name: "同边界策略比较", exact: true })
    .waitFor();
  await p.screenshot({ path: out + "energy-strategies.png", fullPage: true });
  await click("采用原时序");
  await fill("协同计划核对依据", "SIM同负荷同电价与能源边界核对");
  await save();
  assert(
    f.db
      .prepare(
        "SELECT 1 FROM records WHERE resource='energy-plans' AND status='已确认计划'",
      )
      .get(),
  );
  log("同边界能源策略比较与确认持久化");
  await route("planning", "场站规划");
  await click("布局与阶段比选");
  await save();
  await p
    .getByRole("heading", { name: "布局与建设顺序", exact: true })
    .waitFor();
  await p.screenshot({ path: out + "planning-comparison.png", fullPage: true });
  await click("推荐条件可行布局");
  await select("推荐候选点", "北区候选点");
  await fill("来源与核验依据", "SIM条件推荐，不代替工程审批");
  await save();
  assert(
    f.db
      .prepare(
        "SELECT 1 FROM records WHERE resource='planning' AND status='已确认条件推荐' AND json_extract(data,'$.recommended_id')='PL1'",
      )
      .get(),
  );
  log("多布局、建设阶段比选及条件推荐");
  await route("reports", "经营分析");
  await p.getByRole("tab", { name: "任务差异", exact: true }).click();
  await p.getByRole("columnheader", { name: "缺项", exact: true }).waitFor();
  await select("统计主体", "北区运营主体");
  await p.screenshot({ path: out + "reports-comparison.png", fullPage: true });
  log("统一统计范围、任务成本差异和缺项表达");
  await route("account", "个人信息");
  await click("维护个人信息");
  await fill("显示名称", "仿真管理员（资料已维护）");
  assert.equal(
    await p
      .getByLabel("新密码（留空保留）", { exact: true })
      .getAttribute("type"),
    "password",
  );
  await save();
  await p
    .getByText("仿真管理员（资料已维护）", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    f.db.prepare("SELECT name FROM users WHERE username='admin'").get().name,
    "仿真管理员（资料已维护）",
  );
  await p.screenshot({ path: out + "profile-updated.png", fullPage: true });
  await route("assistant", "智能助手");
  await fill("业务问题", "查询当前已核验交付量并引用订单");
  await click("发送");
  await p.locator(".message.assistant").waitFor();
  assert((await p.locator(".message.assistant").innerText()).includes("720"));
  await click("全部依据");
  await p.getByRole("heading", { name: "本次引用资料", exact: true }).waitFor();
  await click("关闭详情");
  await click("整理运输条件");
  await save();
  await p
    .getByRole("heading", { name: "待核对运输条件", exact: true })
    .waitFor();
  await click("核对后调用推演");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await click("打开方案比选");
  await p.getByRole("heading", { name: "交能推演", exact: true }).waitFor();
  await p.getByRole("button", { name: "确认选中方案", exact: true }).waitFor();
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM tasks WHERE order_id='O013'").get().n,
    0,
  );
  log("助手资料引用、条件核对及授权推演，不自动派单（模型测试替身）");
  await p.screenshot({
    path: out + "assistant-prepared-simulation.png",
    fullPage: true,
  });
  await p.getByLabel("账号菜单", { exact: true }).click();
  await p.getByText("切换深色", { exact: true }).click();
  await p.screenshot({ path: out + "simulation-dark.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(350);
  assert(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  await p.screenshot({
    path: out + "simulation-dark-mobile.png",
    fullPage: true,
  });
  log("个人资料维护、新功能深色与手机布局");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "extended-browser.json",
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        real_database: true,
        external_calls: false,
        ai_model: "test-double",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await p.screenshot({ path: out + "extended-failure.png", fullPage: true });
  fs.writeFileSync(
    out + "extended-browser.json",
    JSON.stringify(
      { status: "FAIL", checks, errors, failure: e.message },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await f.close();
}
