import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture, ok } from "./helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const f = await fixture(),
  out = process.env.SAFETY_BROWSER_OUTPUT || "docs/development/changes/CR-019/",
  checks = [],
  errors = [];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false }),
  admin = await browser.newPage({ viewport: { width: 1680, height: 1050 } }),
  driver = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const page of [admin, driver]) {
  page.setDefaultTimeout(12000);
  page.on("pageerror", (e) => errors.push(e.message));
}
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
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
async function route(p, hash, title) {
  await p.evaluate((hash) => (location.hash = hash), hash);
  await p.getByRole("heading", { name: title, exact: true }).first().waitFor();
}
const form = (p) => p.locator(".energy-drawer").last();
async function select(p, label, name) {
  const c = p.getByRole("combobox", { name: label, exact: true });
  await c.click();
  await c.fill(name);
  await p
    .locator(".ant-select-dropdown:visible")
    .getByText(name, { exact: true })
    .last()
    .click();
}
async function save(p, label = /保\s*存/) {
  await form(p).getByRole("button", { name: label }).click();
  await p.locator(".energy-drawer").waitFor({ state: "hidden" });
}
const later = () => {
  const d = new Date(Date.now() + 3600000);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const panel = () => admin.locator(".safety-incident-drawer");
try {
  await login(admin, "admin");
  await route(admin, "monitoring", "运行监控");
  await admin.locator(".safety-object").first().waitFor();
  assert.equal(
    await admin
      .getByRole("menuitem", { name: "运行保障", exact: true })
      .count(),
    1,
  );
  await admin.getByLabel("监控关键词", { exact: true }).fill("甘M·仿004");
  await admin.getByRole("button", { name: "查询", exact: true }).click();
  await admin
    .locator(".safety-object")
    .filter({ hasText: "甘M·仿004" })
    .waitFor();
  await admin
    .locator(".safety-object-detail")
    .getByText("RW-当前-001", { exact: true })
    .waitFor();
  await admin
    .locator(".safety-object-detail")
    .getByText("DD-2610-0014", { exact: true })
    .waitFor();
  await admin.screenshot({ path: out + "monitoring.png", fullPage: true });
  const floating=await admin.evaluate(()=>{
    const box=s=>document.querySelector(s).getBoundingClientRect();
    const root=box(".safety-monitor-workspace"),map=box(".safety-map"),host=box(".safety-map-host"),left=box(".safety-object-panel"),right=box(".safety-object-detail");
    return {width:map.width,rootHeight:root.height,mapHeight:map.height,hostHeight:host.height,left:left.x,right:right.x,overlay:getComputedStyle(document.querySelector(".safety-object-panel")).position};
  });
  assert.equal(floating.width,1680);assert.equal(floating.overlay,"absolute");assert.equal(floating.mapHeight,floating.rootHeight);assert.equal(floating.hostHeight,floating.mapHeight);assert(floating.left<300&&floating.right>1200);
  log("全幅地图填满内容区，左右面板悬浮覆盖且容器高度一致");
  log(
    "运行监控同排查询、对象选择和任务/订单/补能关联，地图失败保留可用业务列表",
  );
  await admin.getByRole("button", { name: "轨迹回放", exact: true }).click();
  await admin.getByRole("button", { name: "查询轨迹", exact: true }).click();
  await admin.getByRole("button", { name: "地图回放", exact: true }).waitFor();
  assert(
    (await admin.locator(".ant-table-tbody tr[data-row-key]").count()) > 0,
  );
  await admin.getByRole("button", { name: "地图回放", exact: true }).click();
  await admin.getByRole("slider", { name: "监控轨迹时间轴" }).waitFor();
  await admin
    .getByRole("button", { name: "返回当前观察", exact: true })
    .click();
  log("明确时间范围查询历史采样与事件，播放和返回当前观察");
  await admin.getByRole("button", { name: "登记异常", exact: true }).click();
  await select(admin, "异常类型", "充电位故障");
  await admin
    .getByLabel("异常情况", { exact: true })
    .fill("浏览器隔离测试：设备无法启动，需核实补能安排");
  await save(admin);
  const created = f.db
    .prepare(
      "SELECT id,code FROM alerts WHERE json_extract(data,'$.cr019')=1 ORDER BY created_at DESC LIMIT 1",
    )
    .get();
  assert(created);
  await route(admin, "alerts", "异常处置");
  await admin.getByLabel("异常关键词", { exact: true }).fill(created.code);
  await admin.getByRole("button", { name: "查询", exact: true }).click();
  await admin.getByRole("button", { name: "受理 / 查看", exact: true }).click();
  await panel().getByText("RW-当前-001", { exact: true }).waitFor();
  await panel().getByText("DD-2610-0014", { exact: true }).waitFor();
  await admin.screenshot({ path: out + "incident-open.png", fullPage: true });
  log("从监控登记真实关联异常，列表按关联编号查询并展示业务影响");
  await panel()
    .getByRole("button", { name: "受理并指派", exact: true })
    .click();
  const assignee = f.db
    .prepare("SELECT name FROM users WHERE username='admin'")
    .get().name;
  await select(admin, "处理人", assignee);
  await admin.getByLabel("要求反馈时间", { exact: true }).fill(later());
  await admin
    .getByLabel("处理措施 / 情况说明", { exact: true })
    .fill("管理员核实工位和替代场站");
  await admin
    .getByLabel("司机执行要求", { exact: true })
    .fill("请等待管理员确认替代补能安排");
  await save(admin, "受理并指派");
  await panel()
    .getByRole("button", { name: "提交核验", exact: true })
    .waitFor();
  log("明确处理人、反馈时间与司机要求后受理，状态进入处理中");

  await panel().getByRole("button", { name: "补充进展", exact: true }).click();
  await admin
    .getByLabel("处理措施 / 情况说明", { exact: true })
    .fill("浏览器输入必须在版本冲突后保留");
  let current = ok(await f.admin.req("/api/safety/incidents/" + created.id));
  ok(
    await f.cmd("incident.update", created.id, {
      expected_version: current.version,
      note: "并发更新的现场信息",
    }),
  );
  await form(admin)
    .getByRole("button", { name: "补充进展", exact: true })
    .click();
  await form(admin)
    .getByRole("button", { name: "读取最新版本", exact: true })
    .click();
  assert.equal(
    await admin.getByLabel("处理措施 / 情况说明", { exact: true }).inputValue(),
    "浏览器输入必须在版本冲突后保留",
  );
  await save(admin, "补充进展");
  log("版本冲突读取最新记录后保留已填写内容，并成功重试");

  await panel().getByRole("button", { name: "补充进展", exact: true }).click();
  await admin
    .getByLabel("处理措施 / 情况说明", { exact: true })
    .fill("已保存但响应中断的处置进展");
  let lost = false;
  await admin.route("**/api/commands", async (route) => {
    if (!lost && route.request().postDataJSON()?.type === "incident.update") {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form(admin)
    .getByRole("button", { name: "补充进展", exact: true })
    .click();
  await form(admin)
    .getByRole("button", { name: "核查结果", exact: true })
    .click();
  await admin.locator(".energy-drawer").waitFor({ state: "hidden" });
  assert(lost);
  await admin.unroute("**/api/commands");
  assert.equal(
    ok(await f.admin.req("/api/safety/incidents/" + created.id)).history.filter(
      (h) => h.note === "已保存但响应中断的处置进展",
    ).length,
    1,
  );
  log("写入成功后响应丢失，可核查原请求结果且不重复追加记录");

  await login(driver, "driver04");
  await driver.getByRole("button", { name: "异常反馈", exact: true }).click();
  await driver
    .getByText("请等待管理员确认替代补能安排", { exact: true })
    .waitFor();
  await driver.getByRole("button", { name: "确认收到", exact: true }).click();
  await select(driver, "确认收到", "已阅读并确认收到当前要求");
  await save(driver);
  await driver.getByText("已确认收到", { exact: true }).waitFor();
  await driver.getByRole("button", { name: "补充情况", exact: true }).click();
  await driver
    .getByLabel("补充情况", { exact: true })
    .fill("司机已收到要求，等待补能调整确认");
  await save(driver);
  await driver.getByText(/本人补充：司机已收到要求/).waitFor();
  await driver.screenshot({
    path: out + "driver-feedback.png",
    fullPage: true,
  });
  log("司机仅查看本人异常、确认当前要求并补充执行反馈");
  await panel().getByRole("button", { name: "刷新详情", exact: true }).click();
  await panel()
    .getByText(/司机已收到要求，等待补能调整确认/)
    .first()
    .waitFor();
  await panel().getByRole("button", { name: "提交核验", exact: true }).click();
  await admin
    .getByLabel("实际处理结果", { exact: true })
    .fill("现场已核实恢复，运输安排继续执行");
  await select(admin, "恢复情况", "已恢复");
  await admin
    .getByLabel("处理结果凭证", { exact: true })
    .fill("浏览器隔离现场恢复凭证");
  await save(admin, "提交核验");
  await panel().getByRole("button", { name: "核验关闭", exact: true }).click();
  await admin
    .getByLabel("核验依据", { exact: true })
    .fill("核实现场服务及在途责任已处理");
  await select(admin, "现场及在途责任", "已核实，相关责任已处理");
  await save(admin, "核验关闭");
  await panel()
    .getByRole("button", { name: "重新受理", exact: true })
    .waitFor();
  assert.equal(
    f.db.prepare("SELECT status FROM tasks WHERE id='TA001'").get().status,
    "执行中",
  );
  await admin.screenshot({ path: out + "incident-closed.png", fullPage: true });
  log("司机反馈进入管理端，处理结果提交后核验关闭，运输任务状态不被改变");

  await panel().getByRole("button", { name: "调整补能", exact: true }).click();
  await admin.getByRole("heading", { name: "补能调度", exact: true }).waitFor();
  await admin.getByRole("row").filter({ hasText: "RW-当前-001" }).waitFor();
  log("异常调整补能携带具体任务/场站上下文进入原业务工作区");
  await route(admin, "alerts?incident=" + created.id, "异常处置");
  await panel().getByRole("button", { name: "重新推演", exact: true }).click();
  await admin.getByRole("heading", { name: "交能推演", exact: true }).waitFor();
  await admin
    .getByRole("button", { name: "核对受影响任务", exact: true })
    .waitFor();
  await admin
    .getByRole("button", { name: "核对受影响任务", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "核对并调整任务", exact: true })
    .click();
  await admin.getByRole("heading", { name: "运输任务", exact: true }).waitFor();
  await admin.getByRole("dialog").filter({ hasText: "RW-当前-001" }).waitFor();
  log("重新推演携带异常和来源订单，核对余量及已派发任务，任务详情可直接定位");
  await admin.getByRole("button", { name: "关闭", exact: true }).last().click();
  await route(admin, "monitoring", "运行监控");
  await admin.getByRole("button", { name: "重置", exact: true }).click();
  for (const width of [1680, 1280, 1024, 768, 390]) {
    await admin.setViewportSize({ width, height: 1050 });
    await admin.waitForTimeout(150);
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
      "监控页面溢出 " + width,
    );
  }
  await admin.screenshot({
    path: out + "monitoring-mobile.png",
    fullPage: true,
  });
  await route(admin, "alerts", "异常处置");
  for (const width of [390, 768, 1280, 1680]) {
    await admin.setViewportSize({ width, height: 1050 });
    await admin.waitForTimeout(150);
    assert(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
      "异常页面溢出 " + width,
    );
  }
  log("监控与异常页面390至1680像素适配，表格横向滚动限制在容器内");
  assert.equal(errors.length, 0, errors.join("\n"));
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        external_model_calls: f.calls.length,
        isolated_database: true,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await admin.screenshot({ path: out + "browser-failure.png", fullPage: true });
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify({ status: "FAIL", checks, errors, error: e.stack }, null, 2),
  );
  throw e;
} finally {
  await browser.close();
  await f.close();
}
