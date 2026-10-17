import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture, ok } from "./helpers.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
const f = await fixture(),
  out = "docs/development/changes/CR-021/",
  checks = [],
  errors = [];
const before = [
  "demands",
  "orders",
  "tasks",
  "charging",
  "vehicles",
  "drivers",
  "stations",
  "devices",
  "simulations",
].map((t) => f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all());
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: false }),
  page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
page.setDefaultTimeout(14000);
page.on("pageerror", (e) => errors.push(e.message));
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
const editor = () => page.locator(".planning-editor");
const route = async (hash, title) => {
  await page.evaluate((hash) => (location.hash = hash), hash);
  await page
    .getByRole("heading", { name: title, exact: true })
    .first()
    .waitFor();
};
const save = async () => {
  await page.getByRole("button", { name: "保存条件", exact: true }).click();
  await editor().waitFor({ state: "hidden" });
};
async function select(locator, name) {
  await locator.click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText(name, { exact: true })
    .last()
    .click();
}
try {
  await page.goto(f.base);
  await page.getByLabel("登录账号", { exact: true }).fill("admin");
  await page.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page
    .getByRole("heading", { name: "运营总览", exact: true })
    .first()
    .waitFor();
  await route("planning", "场站规划");
  await page
    .getByText("创建规划项目，选择业务范围和测算条件", { exact: true })
    .waitFor();
  log("空规划库提供新建入口，无伪造结果");
  await page
    .getByRole("button", { name: "新建规划项目", exact: true })
    .first()
    .click();
  await editor()
    .getByLabel("项目名称", { exact: true })
    .fill("北区煤运走廊规划（浏览器仿真）");
  await editor()
    .getByRole("button", { name: "引用需求与订单", exact: true })
    .click();
  await editor()
    .getByText(/条有效记录/)
    .waitFor();
  await editor().getByLabel("日运输需求（吨）", { exact: true }).fill("2400");
  await editor().getByLabel("一期日运量（吨）", { exact: true }).fill("1200");
  await editor()
    .getByLabel("供电上限（kW）", { exact: true })
    .first()
    .fill("4000");
  await editor()
    .getByLabel("供电上限（kW）", { exact: true })
    .last()
    .fill("4000");
  await save();
  await page.locator(".planning-context").getByText(/2,400/).waitFor();
  const p = f.db
    .prepare("SELECT id FROM records WHERE resource='planning-projects'")
    .get();
  assert(p);
  log("右侧条件抽屉引用业务数据、手工调整并写入真实SQLite");
  await page.getByRole("button", { name: "重新测算", exact: true }).click();
  await page.locator(".planning-recommendation h3").waitFor();
  await page.getByText("布局方案对照", { exact: true }).waitFor();
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM records WHERE resource='planning-solutions'",
      )
      .get().n,
    1,
  );
  await page.screenshot({ path: out + "station-planning.png", fullPage: true });
  log("场站比选生成完整候选结果，地图左右悬浮，底部方案对照");
  await page.getByRole("button", { name: "进入运力规划", exact: true }).click();
  await page
    .getByRole("heading", { name: "运力规划", exact: true })
    .first()
    .waitFor();
  await page.getByText("资源配置", { exact: true }).waitFor();
  assert(
    (await page.locator(".planning-metrics").innerText()).includes("建议车辆"),
  );
  await page.screenshot({ path: out + "fleet-planning.png", fullPage: true });
  log("运力规划共享项目及V1，显示总量、库存、缺口、约束与分期");
  await page
    .getByRole("button", { name: "采用为参考方案", exact: true })
    .click();
  await page
    .locator(".ant-modal")
    .getByRole("button", { name: /确\s*认/ })
    .click();
  await page.getByText("已采用参考：V1", { exact: true }).waitFor();
  assert.equal(
    f.db
      .prepare(
        "SELECT json_extract(data,'$.reference_id') id FROM records WHERE id=?",
      )
      .get(p.id).id !== null,
    true,
  );
  log("采用为当前参考真实落库，不生成运输或补能执行记录");
  await page.getByRole("button", { name: "查看资源明细", exact: true }).click();
  await page.locator(".planning-evidence").waitFor();
  await page
    .locator(".planning-evidence")
    .getByRole("tab", { name: "车辆明细", exact: true })
    .click();
  await page
    .getByText("窗口、状态及规格符合", { exact: true })
    .first()
    .waitFor();
  await page
    .locator(".planning-evidence")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  log("依据抽屉提供车辆筛选与排除明细");
  await page.getByRole("button", { name: "带入交能推演", exact: true }).click();
  await page.getByText(/已带入规划 V1 条件/).waitFor();
  assert.equal(f.db.prepare("SELECT count(*) n FROM simulations").get().n, 0);
  log("规划带入推演为待测算条件，不自动确认或派单");
  await page.getByRole("button", { name: "返回规划", exact: true }).click();
  const modal = page.locator(".ant-modal:visible");
  if (await modal.count())
    await modal.getByRole("button", { name: /确\s*认/ }).click();
  await page.getByText("资源配置", { exact: true }).waitFor();
  await page.getByRole("button", { name: "调整条件", exact: true }).click();
  await editor().getByLabel("日运输需求（吨）", { exact: true }).fill("3000");
  await save();
  await page
    .getByText("当前为旧条件方案，请重新测算后采用", { exact: true })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "采用为参考方案", exact: true })
      .isDisabled(),
  );
  log("变更条件产生新条件版本，旧方案标记过期并阻止采用");
  await page.getByRole("button", { name: "重新测算", exact: true }).click();
  await page
    .getByRole("combobox", { name: "规划方案版本", exact: true })
    .locator("..")
    .getByText("V2", { exact: true })
    .waitFor();
  await page.getByRole("tab", { name: "方案比较", exact: true }).click();
  await page.getByRole("combobox", { name: "对比方案", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("V1", { exact: true })
    .click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .locator(".planning-workspace .ant-table-tbody tr[data-row-key]")
      .count(),
    2,
  );
  log("新旧条件方案可并排比较并保留快照");
  await page.getByRole("tab", { name: "历史方案", exact: true }).click();
  await page
    .getByRole("button", { name: "归档", exact: true })
    .last()
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "运力规划", exact: true })
    .first()
    .waitFor();
  await page.getByText("资源配置", { exact: true }).waitFor();
  log("刷新后从数据库恢复项目和已保存方案");
  await page.getByRole("button", { name: "调整条件", exact: true }).click();
  await editor().getByLabel("日运输需求（吨）", { exact: true }).fill("3100");
  await editor().getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .locator(".ant-modal:visible")
    .getByRole("button", { name: /确\s*认/ })
    .click();
  await editor().waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "调整条件", exact: true }).click();
  await editor().getByRole("button", { name: "恢复草稿", exact: true }).click();
  assert.equal(
    await editor().getByLabel("日运输需求（吨）", { exact: true }).inputValue(),
    "3100.0",
  );
  assert.equal(
    await editor().getByText("发现未提交的本机草稿", { exact: true }).count(),
    0,
  );
  await page.route("**/api/commands", async (r) => {
    const b = r.request().postDataJSON();
    if (b.type === "planner.update")
      await r.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "测试替身：服务暂不可用，输入保留" }),
      });
    else await r.continue();
  });
  await page.getByRole("button", { name: "保存条件", exact: true }).click();
  await editor()
    .getByText("测试替身：服务暂不可用，输入保留", { exact: true })
    .waitFor();
  assert.equal(
    await editor().getByLabel("日运输需求（吨）", { exact: true }).inputValue(),
    "3100.0",
  );
  await page.unroute("**/api/commands");
  await editor().getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .locator(".ant-modal:visible")
    .getByRole("button", { name: /确\s*认/ })
    .click();
  await editor().waitFor({ state: "hidden" });
  log("草稿在关闭后可恢复，API失败保留输入且固定动作可重试");
  await route("planning", "场站规划");
  await page.getByText("布局方案对照", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "需求分析", exact: true }).click();
  await page.getByText("运输需求分析", { exact: true }).waitFor();
  assert(
    (await page
      .locator(".planning-workspace .ant-table-tbody tr[data-row-key]")
      .count()) > 0,
  );
  log("需求分析显示引用走廊与核验交付，来源保留且无渲染异常");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await route("planning", "场站规划");
    await page.getByRole("tab", { name: "选址比选", exact: true }).click();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: out + `planning-${width}.png`,
      fullPage: true,
    });
    await route("deployment", "运力规划");
    await page.getByText("资源配置", { exact: true }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  log("1280及390宽度场站与运力页无页面横向溢出");
  assert.deepEqual(
    [
      "demands",
      "orders",
      "tasks",
      "charging",
      "vehicles",
      "drivers",
      "stations",
      "devices",
      "simulations",
    ].map((t) => f.db.prepare("SELECT * FROM " + t + " ORDER BY id").all()),
    before,
  );
  assert.deepEqual(errors, []);
  log("原业务记录保留，无浏览器脚本错误");
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify({ status: "PASS", checks, errors }, null, 2),
  );
} catch (e) {
  await page.screenshot({ path: out + "browser-failure.png", fullPage: true });
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      { status: "FAIL", checks, errors, message: e.stack },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
  await f.close();
}
