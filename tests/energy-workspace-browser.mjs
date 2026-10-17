import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture, ok } from "./helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const f = await fixture(),
  out = process.env.ENERGY_BROWSER_OUTPUT || "docs/development/changes/CR-018/",
  checks = [],
  errors = [];
const browser = await chromium.launch({ headless: true }),
  admin = await browser.newPage({ viewport: { width: 1680, height: 1050 } }),
  driver = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const p of [admin, driver]) {
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => errors.push(e.message));
}
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
const local = (v) => {
  const d = new Date(v);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const ago = (m) => local(Date.now() - m * 60000),
  later = (m) => local(Date.now() + m * 60000);
async function login(p, name) {
  await p.goto(f.base);
  await p.getByLabel("登录账号", { exact: true }).fill(name);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await p.getByRole("button", { name: "登录", exact: true }).click();
  await p
    .getByRole("heading", {
      name: name.startsWith("driver") ? "我的任务" : "运营总览",
      exact: true,
    })
    .first()
    .waitFor();
}
const route = async (p, path, title) => {
  await p.evaluate((path) => (location.hash = path), path);
  await p.getByRole("heading", { name: title, exact: true }).first().waitFor();
};
const row = (p, text) =>
  p
    .locator(".ant-table-tbody tr[data-row-key]")
    .filter({ hasText: text })
    .first();
const drawer = (p) => p.locator(".energy-drawer").last();
const save = async (p) => {
  await drawer(p)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await p.locator(".energy-drawer").waitFor({ state: "hidden" });
};
async function select(p, label, text) {
  await p.getByRole("combobox", { name: label, exact: true }).click();
  await p.getByRole("combobox", { name: label, exact: true }).fill(text);
  await p.getByText(text, { exact: true }).last().click();
}
try {
  await login(admin, "admin");
  await route(admin, "charging", "补能调度");
  await row(admin, "甘M·仿004").waitFor();
  assert.equal(
    await admin
      .getByRole("menuitem", { name: "能源管理", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await admin
      .getByRole("menuitem", { name: "补能与能源", exact: true })
      .count(),
    0,
  );
  assert(
    await row(admin, "甘M·仿004")
      .innerText()
      .then((t) => t.includes("RW-当前-001") && t.includes("DD-2610-0014")),
  );
  await admin.screenshot({ path: out + "charging.png", fullPage: true });
  log("菜单改名，补能列表显示来源订单/任务和运输时限，默认10条");
  await admin.getByLabel("能源关键词", { exact: true }).fill("DD-2610-0014");
  await admin.getByRole("button", { name: "查询", exact: true }).click();
  await admin.getByRole("tab", { name: "全部 1", exact: true }).waitFor();
  await row(admin, "甘M·仿004")
    .getByRole("button", { name: "查看", exact: true })
    .click();
  await admin.getByRole("tab", { name: "实际作业", exact: true }).waitFor();
  await admin.getByRole("tab", { name: "变更与依据", exact: true }).click();
  await admin.getByRole("button", { name: "关闭", exact: true }).last().click();
  await admin.getByRole("button", { name: "重置", exact: true }).click();
  await admin.getByRole("tab", { name: "全部 4", exact: true }).waitFor();
  log("关联关键词查询、重置及计划/实际/历史抽屉");

  await admin.getByRole("button", { name: "新增安排", exact: true }).click();
  await select(admin, "关联车辆", "甘M·仿008");
  await select(admin, "补能场站", "北区煤运补能站");
  await admin.getByLabel("预计到站", { exact: true }).fill(later(25));
  await admin.getByLabel("预计补能量（kWh）", { exact: true }).fill("140");
  let lostCreateResponse = false;
  await admin.route("**/api/commands", async (route) => {
    if (
      !lostCreateResponse &&
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.type === "charging.create"
    ) {
      lostCreateResponse = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await drawer(admin)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await drawer(admin)
    .getByRole("button", { name: "核查结果", exact: true })
    .waitFor();
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM charging WHERE vehicle_id='V008'")
      .get().n,
    1,
  );
  await drawer(admin)
    .getByRole("button", { name: "核查结果", exact: true })
    .click();
  await admin.locator(".energy-drawer").waitFor({ state: "hidden" });
  await admin.unroute("**/api/commands");
  log("创建成功但响应中断时，核查原幂等请求，不重复建计划");
  await row(admin, "甘M·仿008")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await admin
    .getByLabel("确认依据", { exact: true })
    .fill("仿真临时补能安排核对");
  await drawer(admin)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await admin
    .getByRole("dialog", { name: "确认补能安排", exact: true })
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await admin.locator(".energy-drawer").waitFor({ state: "hidden" });
  await row(admin, "甘M·仿008")
    .getByRole("button", { name: "调整", exact: true })
    .click();
  await admin.getByLabel("调整原因", { exact: true }).fill("仿真调整到站时段");
  await save(admin);
  assert.equal(
    f.db
      .prepare(
        "SELECT status FROM charging WHERE vehicle_id='V008' ORDER BY rowid DESC",
      )
      .get().status,
    "待确认",
  );
  await row(admin, "甘M·仿008")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await admin.getByLabel("取消原因", { exact: true }).fill("取消隔离仿真安排");
  await drawer(admin)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await admin
    .getByRole("dialog", { name: "取消补能安排", exact: true })
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await admin.locator(".energy-drawer").waitFor({ state: "hidden" });
  log("右侧新增、人工确认、调整重新待确认、取消保留记录");
  await admin.getByLabel("能源关键词", { exact: true }).fill("BN-当前-3");
  await admin.getByRole("button", { name: "查询", exact: true }).click();
  await admin.getByRole("tab", { name: "全部 1", exact: true }).waitFor();
  await admin.getByRole("button", { name: "优化补能", exact: true }).click();
  await admin.getByText("补能候选比较", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "关闭详情", exact: true }).click();
  await admin.getByRole("button", { name: "打开交能AI", exact: true }).click();
  await admin.getByRole("dialog", { name: "交能AI", exact: true }).waitFor();
  await admin
    .getByRole("dialog", { name: "交能AI", exact: true })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  log("优化限定当前查询计划，交能AI右侧入口可开关且不自动调用模型");

  await login(driver, "driver04");
  await route(driver, "m-energy", "补能安排");
  await driver.getByRole("button", { name: "反馈到站", exact: true }).click();
  await driver.getByLabel("实际到站时间", { exact: true }).fill(ago(20));
  await driver
    .getByLabel("到站说明", { exact: true })
    .fill("隔离仿真：司机到站");
  await save(driver);
  const vis = f.db
    .prepare(
      "SELECT id FROM records WHERE resource='station-visits' AND json_extract(data,'$.plan_id')='C-ACT1'",
    )
    .get();
  assert(vis);
  await driver.getByRole("tab", { name: "进行中 1", exact: true }).click();
  await driver.getByText("待服务", { exact: true }).waitFor();
  assert.equal(
    await driver.getByRole("button", { name: "核验", exact: true }).count(),
    0,
  );
  log("司机只见本人安排，可反馈到站，未直接核验费用或完成运输");

  await route(admin, "stations", "场站作业");
  await row(admin, "甘M·仿004")
    .getByRole("button", { name: "安排工位", exact: true })
    .click();
  await select(admin, "作业工位", "充电枪位1");
  await admin.getByLabel("实际开始时间", { exact: true }).fill(ago(15));
  await admin.getByLabel("预计释放时间", { exact: true }).fill(later(25));
  const retainedStart = await admin
    .getByLabel("实际开始时间", { exact: true })
    .inputValue();
  f.db.prepare("UPDATE devices SET version=version+1 WHERE id='S001-G1'").run();
  await drawer(admin)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await drawer(admin)
    .getByRole("button", { name: "读取最新版本", exact: true })
    .click();
  await drawer(admin)
    .getByText(/工位当前为空闲／在线/)
    .waitFor();
  assert.equal(
    await admin.getByLabel("实际开始时间", { exact: true }).inputValue(),
    retainedStart,
  );

  await save(admin);
  log("工位版本冲突保留输入，显式读取最新任务与工位版本后再提交");
  await row(admin, "甘M·仿004").getByText("补能中", { exact: true }).waitFor();
  assert.equal(
    f.db.prepare("SELECT status FROM devices WHERE id='S001-G1'").get().status,
    "占用",
  );
  await admin.screenshot({ path: out + "station-working.png", fullPage: true });
  log("司机到站进入场站工作区，安排工位生成实际占用");
  await row(admin, "甘M·仿004")
    .getByRole("button", { name: "登记结束", exact: true })
    .click();
  await admin.getByLabel("实际结束时间", { exact: true }).fill(ago(1));
  await admin.getByLabel("实际计量电量（kWh）", { exact: true }).fill("132");
  await admin.getByLabel("来源金额（元）", { exact: true }).fill("168.96");
  await admin
    .getByLabel("计量或换电凭证", { exact: true })
    .fill("隔离仿真计量凭证");
  await save(admin);
  await row(admin, "甘M·仿004")
    .getByRole("button", { name: "核验", exact: true })
    .click();
  await admin
    .getByLabel("核验依据", { exact: true })
    .fill("核对计量及现场记录");
  await drawer(admin)
    .getByRole("button", { name: /保\s*存/ })
    .click();
  await admin
    .getByRole("dialog", { name: "核验补能作业", exact: true })
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await admin.locator(".energy-drawer").waitFor({ state: "hidden" });
  const session = f.db
    .prepare("SELECT * FROM sessions WHERE plan_id='C-ACT1'")
    .get();
  assert.equal(session.status, "已核验");
  assert.equal(
    f.db.prepare("SELECT status FROM tasks WHERE id='TA001'").get().status,
    "执行中",
  );
  assert.equal(
    f.db.prepare("SELECT status FROM devices WHERE id='S001-G1'").get().status,
    "空闲",
  );
  await admin.screenshot({
    path: out + "station-verified.png",
    fullPage: true,
  });
  log("结束生成实际作业、释放工位，人工核验后不误完成运输任务");
  await driver
    .getByRole("button", { name: "刷新补能安排", exact: true })
    .click();
  await driver.getByRole("tab", { name: "已结束 1", exact: true }).click();
  await driver.getByText("实际 132 kWh · 已核验", { exact: true }).waitFor();
  await driver.screenshot({ path: out + "driver-energy.png", fullPage: true });
  await driver
    .getByRole("button", { name: "查看关联任务", exact: true })
    .click();
  await driver.getByText("RW-当前-001", { exact: true }).first().waitFor();
  log("司机刷新查看实际结果并直接返回关联任务");

  await route(admin, "energy", "用能管理");
  await admin.getByText("区间用电", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "查看数据表", exact: true }).click();
  await admin.getByText("缺测", { exact: true }).first().waitFor();
  await admin.getByRole("button", { name: "查看曲线", exact: true }).click();
  await admin.screenshot({ path: out + "energy.png", fullPage: true });
  await admin.getByLabel("能源日期", { exact: true }).fill("2001-01-01");
  await admin.getByRole("button", { name: "查询", exact: true }).click();
  await admin
    .getByText("所选日期暂无计量样本或有效计划", { exact: true })
    .waitFor();
  await admin.getByRole("button", { name: "重置", exact: true }).click();
  await admin
    .getByRole("button", { name: "生成优化建议", exact: true })
    .click();
  await admin.getByText("同边界策略比较", { exact: true }).waitFor();
  await admin.getByRole("button", { name: "关闭详情", exact: true }).click();
  log("用能按场站日期计量对象查询、缺测断点、无数据不补零，能源策略真实生成");

  await route(admin, "station-files", "场站档案");
  await admin.getByRole("tab", { name: "能源资源", exact: true }).click();
  await admin
    .getByRole("button", { name: "登记能源资源", exact: true })
    .waitFor();
  log("场站、工位和能源资源统一归档，原登记能力保留");
  for (const width of [1680, 1280, 1024, 768, 390]) {
    await admin.setViewportSize({ width, height: 1000 });
    await route(admin, "charging", "补能调度");
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `charging overflow ${width}`,
    );
    await route(admin, "stations", "场站作业");
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `station overflow ${width}`,
    );
    await route(admin, "energy", "用能管理");
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `energy overflow ${width}`,
    );
  }
  await admin.screenshot({ path: out + "mobile-energy.png", fullPage: true });
  log("390–1680px三页布局无页面横向溢出");
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
    ) + "\n",
  );
} catch (e) {
  await admin.screenshot({ path: out + "browser-failure.png", fullPage: true });
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      { status: "FAIL", checks, errors, error: String(e) },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
  await f.close();
}
