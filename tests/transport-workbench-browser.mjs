import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
const out = "docs/development/changes/CR-002/evidence/";
fs.mkdirSync(out, { recursive: true });
const f = await fixture(),
  browser = await chromium.launch({ headless: true }),
  p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  checks = [],
  errors = [];
p.setDefaultTimeout(8000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error" && /UI_RENDER_ERROR/.test(m.text()))
    errors.push(m.text());
});
p.on("dialog", (d) => d.accept());
const button = (name) => p.getByRole("button", { name, exact: true }),
  click = (name) => button(name).click(),
  fill = (name, value) =>
    p.getByLabel(name, { exact: true }).fill(String(value));
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS", name);
};
const route = async (key, title) => {
  await p.evaluate((key) => (location.hash = key), key);
  await p.getByRole("heading", { name: title, exact: true }).first().waitFor();
};
async function shot(name) {
  await p.waitForFunction(
    () =>
      ![...document.querySelectorAll(".ant-spin-container")].some(
        (el) => Number(getComputedStyle(el).opacity) < 0.99,
      ) &&
      ![...document.querySelectorAll(".ant-spin-spinning")].some(
        (el) => el.getClientRects().length > 0,
      ) &&
      [
        ...document.querySelectorAll(
          ".transport-editor .ant-drawer-content-wrapper",
        ),
      ].every(
        (el) => Math.abs(el.getBoundingClientRect().right - innerWidth) < 1,
      ),
  );
  await p.screenshot({ path: out + name, fullPage: false });
}
const findDemand = () =>
  f.db.prepare("SELECT id FROM demands WHERE name='CR2界面总需求'").get();
try {
  await p.goto(f.base);
  await fill("登录密码", "JiaoNeng2026!");
  await click("登录");
  await p.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
  await route("demands", "运输需求");
  await button("新建运输需求").waitFor();
  await p.locator("tbody tr[data-row-key]").first().waitFor();
  assert.equal(
    await p.getByRole("tab", { name: "订单列表", exact: true }).count(),
    0,
  );
  await shot("demands-list.png");
  log("运输需求独立路由、查询卡与列表卡");
  const initial = await p.locator("tbody tr[data-row-key]").count();
  await fill("搜索业务记录", "CR2不存在的需求");
  assert.equal(await p.locator("tbody tr[data-row-key]").count(), initial);
  await click("查询");
  await p.getByText("没有符合条件的记录", { exact: true }).waitFor();
  await click("重置");
  await p.locator("tbody tr[data-row-key]").first().waitFor();
  log("查询显式生效、空结果及重置");
  await click("新建运输需求");
  await p.getByRole("dialog", { name: "新建运输需求", exact: true }).waitFor();
  const drawer = await p
    .locator(".transport-editor .ant-drawer-content-wrapper")
    .boundingBox();
  assert(drawer.x >= 600 && drawer.width <= 810);
  await click("确认需求");
  await p.getByText("请填写需求名称", { exact: true }).waitFor();
  assert.equal(
    await p
      .getByLabel("需求名称", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  await fill("需求名称", "CR2界面总需求");
  await fill("货物", "原煤");
  await fill("需求运量（吨）", 1000);
  await fill("装货位置", "北区装载场");
  await fill("卸货位置", "煤炭集运中心");
  await shot("demand-editor.png");
  await click("确认需求");
  await p.getByRole("heading", { name: "业务详情", exact: true }).waitFor();
  assert.equal(
    f.db.prepare("SELECT status FROM demands WHERE id=?").get(findDemand().id)
      .status,
    "已确认",
  );
  log("右侧新增需求、必填关联错误及保存确认真实联动");
  await p
    .getByRole("dialog", { name: "业务详情", exact: true })
    .getByRole("button", { name: "生成订单", exact: true })
    .click();
  await p.getByRole("dialog", { name: "生成运输订单", exact: true }).waitFor();
  const first = p.locator(".batch-card").first();
  await first.getByLabel("计划运量（吨）", { exact: true }).fill("400");
  await first.getByLabel("单趟距离（km）", { exact: true }).fill("14");
  await click("增加批次");
  const second = p.locator(".batch-card").nth(1);
  await second.getByLabel("计划运量（吨）", { exact: true }).fill("350");
  await second.getByLabel("单趟距离（km）", { exact: true }).fill("14");
  await p.getByText("分配后余量 250 吨", { exact: true }).waitFor();
  await shot("batch-editor.png");
  await click("确认生成订单");
  await p.getByText("已确认生成 2 张订单", { exact: true }).waitFor();
  const d = f.db
    .prepare("SELECT * FROM demands WHERE id=?")
    .get(findDemand().id);
  assert.equal(d.allocated_kg, 750000);
  log("需求内多批安排、余量反馈与整批生成");
  await click("查看订单列表");
  await p.getByRole("heading", { name: "运输订单", exact: true }).waitFor();
  await p.locator("tbody tr[data-row-key]").first().waitFor();
  assert.equal(await p.locator("tbody tr[data-row-key]").count(), 2);
  await shot("orders-list.png");
  log("生成后进入独立订单页并定位来源需求");
  const order = f.db
    .prepare("SELECT * FROM orders WHERE demand_id=? ORDER BY quantity_kg DESC")
    .get(d.id);
  await p
    .locator(`tr[data-row-key="${order.id}"]`)
    .getByRole("button", { name: "调整", exact: true })
    .click();
  await p.getByRole("dialog", { name: /调整运输订单/ }).waitFor();
  await fill("计划运量（吨）", 350);
  await fill("调整及影响说明", "CR2未执行批次调整运量");
  await shot("order-editor.png");
  await click("保存修改");
  await p.getByRole("heading", { name: "订单详情", exact: true }).waitFor();
  assert.equal(
    f.db.prepare("SELECT quantity_kg FROM orders WHERE id=?").get(order.id)
      .quantity_kg,
    350000,
  );
  assert.equal(
    f.db.prepare("SELECT allocated_kg FROM demands WHERE id=?").get(d.id)
      .allocated_kg,
    700000,
  );
  await click("关闭详情");
  assert.equal(await p.locator("tbody tr[data-row-key]").count(), 2);
  log("右侧调整订单、需求额度更新及列表上下文保留");
  await click("新建订单");
  await fill("订单名称", "CR2快捷需求订单");
  await click("快捷登记需求");
  await p.getByRole("dialog", { name: "快捷登记需求", exact: true }).waitFor();
  await fill("需求名称", "CR2快捷来源");
  await fill("货物", "精煤");
  await fill("需求运量（吨）", 120);
  await fill("装货位置", "北区装载场");
  await fill("卸货位置", "煤炭集运中心");
  await click("确认并使用");
  await p.getByRole("dialog", { name: "新建运输订单", exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("订单名称", { exact: true }).inputValue(),
    "CR2快捷需求订单",
  );
  assert.equal(
    await p.getByLabel("货物", { exact: true }).inputValue(),
    "精煤",
  );
  await fill("计划运量（吨）", 60);
  await fill("单趟距离（km）", 14);
  await click("确认并进入推演");
  await p.getByRole("heading", { name: "交能推演", exact: true }).waitFor();
  const quick = f.db
    .prepare("SELECT id,code FROM orders WHERE name='CR2快捷需求订单'")
    .get();
  assert(quick);
  assert(
    (
      await p.getByLabel("来源订单", { exact: true }).locator("..").innerText()
    ).includes(quick.code),
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM tasks WHERE order_id=?").get(quick.id)
      .n,
    0,
  );
  log("快捷登记需求回填保留原输入，准确衔接订单推演且不自动派单");
  await route("orders", "运输订单");
  await click("新建订单");
  await fill("订单名称", "不应保存的临时草稿");
  await click("取消");
  await p
    .getByRole("dialog", { name: "新建运输订单", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM orders WHERE name='不应保存的临时草稿'")
      .get().n,
    0,
  );
  log("未保存退出保护与取消不写入业务库");
  await route("demands", "运输需求");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.locator(".transport-mobile-card").first().waitFor();
  await shot("demands-mobile.png");
  assert(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  );
  await click("新建运输需求");
  await p.getByRole("dialog", { name: "新建运输需求", exact: true }).waitFor();
  await shot("demand-editor-mobile.png");
  const mobile = await p
    .locator(".transport-editor .ant-drawer-content-wrapper")
    .boundingBox();
  assert(mobile.width <= 390 && Math.abs(mobile.x) < 1);
  await p.getByLabel("需求名称", { exact: true }).focus();
  await p.keyboard.press("Tab");
  assert.equal(
    await p.evaluate(() => document.activeElement.getAttribute("aria-label")),
    "归属主体",
  );
  await p.keyboard.press("Escape");
  await p
    .getByRole("dialog", { name: "新建运输需求", exact: true })
    .waitFor({ state: "hidden" });
  await p.setViewportSize({ width: 1440, height: 1000 });
  log("手机列表和全宽编辑抽屉无页面溢出");
  await p.getByLabel("账号菜单", { exact: true }).click();
  await p.getByText("切换深色", { exact: true }).click();
  await shot("demands-dark.png");
  log("独立工作区深色主题");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "browser-results.json",
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        database: "isolated simulated SQLite",
        external_business_writes: false,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await p.screenshot({ path: out + "failure.png", fullPage: true });
  fs.writeFileSync(
    out + "browser-results.json",
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
