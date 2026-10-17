// Explicit live AMap check; all business mutations use an isolated simulated database.
import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const db = database(":memory:"),
  { app } = createApp({ db }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const b = await chromium.launch({ headless: true }),
  p = await b.newPage({ viewport: { width: 1440, height: 1040 } }),
  out = "docs/development/changes/CR-007/",
  checks = [],
  errors = [],
  tileResults = [];
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => errors.push(e.message));
p.on("response", async (r) => {
  if (new URL(r.url()).pathname === "/web_map/get_tile")
    try {
      tileResults.push((await r.json()).info);
    } catch {}
});
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS", name);
};
const routeResponse = () =>
  p.waitForResponse((r) => new URL(r.url()).pathname === "/api/maps/route");
const button = (name) => p.getByRole("button", { name, exact: true });
const shot = async (name) => {
  await p.waitForFunction(
    () =>
      ![...document.querySelectorAll(".ant-spin-container")].some(
        (e) => Number(getComputedStyle(e).opacity) < 0.99,
      ),
  );
  await p.screenshot({ path: out + name, fullPage: true });
};
try {
  await p.goto("http://127.0.0.1:" + server.address().port);
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await button("登录").click();
  await p.waitForFunction(
    () => document.querySelector(".content h1")?.textContent === "运营总览",
  );
  const r1 = routeResponse();
  await p.evaluate(() => (location.hash = "simulation"));
  const response = await r1,
    data = await response.json();
  assert.equal(response.status(), 200);
  assert(data.coordinates.length > 10);
  assert.equal(data.source, "AMAP_V5_DRIVING");
  const [a, z] = [data.coordinates[0], data.coordinates.at(-1)];
  assert(
    data.coordinates.some(
      (q) =>
        Math.abs(
          (q[0] - a[0]) * (z[1] - a[1]) - (q[1] - a[1]) * (z[0] - a[0]),
        ) > 0.000001,
    ),
  );
  await p.locator(".amap-container[data-route-points]").waitFor();
  await p
    .locator('.amap-container[data-map-ready="true"]')
    .waitFor({ timeout: 25000 });
  assert.equal(await button("历史版本").count(), 0);
  assert.equal(await button("业务示意").count(), 0);
  log("自动加载高德底图、道路非直线、历史及示意入口移除");
  const stations = db
      .prepare("SELECT id,name FROM stations WHERE owner_id='ORG-N'")
      .all(),
    original = stations.find((s) => s.id === new URL(response.url()).searchParams.get("station_id")),
    other = stations.find((s) => s.id !== original.id);
  const selectStation = async (station) => {
    await p.getByLabel("补能场站", { exact: true }).click();
    await p.locator(".ant-select-item-option").filter({hasText:station.name}).click();
  };
  const r2 = routeResponse();
  await selectStation(other);
  const changed = await (await r2).json();
  assert.notDeepEqual(changed.coordinates, data.coordinates);
  await p.locator(".amap-container[data-route-points]").waitFor();
  log("切换补能场站，按新途经点更新道路");
  await p.route("**/api/maps/route?**", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "道路服务测试故障",
        code: "MAP_ROUTE_UNAVAILABLE",
      }),
    }),
  );
  await selectStation(original);
  await p.getByText("道路服务测试故障", { exact: true }).waitFor();
  assert.equal(
    await p.locator(".amap-container[data-route-points]").count(),
    0,
  );
  await p.unroute("**/api/maps/route?**");
  const retry = routeResponse();
  await button("重试加载").click();
  assert.equal((await retry).status(), 200);
  await p.locator(".amap-container[data-route-points]").waitFor();
  await p
    .locator('.amap-container[data-map-ready="true"]')
    .waitFor({ timeout: 25000 });
  log("道路服务失败清除旧线，无直线兜底，重试可恢复");
  await button("开始推演").click();
  await button("确认选中方案").waitFor();
  assert(await button("确认选中方案").isEnabled());
  await p.locator(".candidate-card").last().click();
  assert.equal(await p.locator(".candidate-card.chosen").count(), 1);
  await p.getByRole("button", { name: "查看来源与口径", exact: true }).click();
  await p
    .getByText(
      "人工、租赁、维保等未纳入；路网、安全阈值及资源均为仿真/参考条件",
      { exact: true },
    )
    .waitFor();
  await button("关闭详情").click();
  log("真实推演接口、候选切换、方案专属来源依据保留");
  await p.getByLabel("初始SOC", { exact: true }).fill("72");
  assert(!(await button("确认选中方案").isEnabled()));
  await p.getByText("条件已变化，请重算后确认", { exact: true }).waitFor();
  await button("调整条件重算").click();
  await p.waitForFunction(
    () => !document.body.textContent.includes("条件已变化，请重算后确认"),
  );
  assert(await button("确认选中方案").isEnabled());
  log("改条件禁止确认，重算后恢复确认");
  await p.locator(".amap-container[data-route-points]").waitFor();
  await shot("solve-road-result.png");
  for (const width of [1280, 1024, 768, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.waitForFunction(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    );
    const bounds = await p.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      return {
        conditions: r(".sim-conditions"),
        map: r(".simulation-map-area"),
        results: r(".simulation-solutions"),
      };
    });
    assert(bounds.map.y >= bounds.conditions.y + bounds.conditions.height - 1);
    if (width >= 1024) assert(bounds.results.x > bounds.map.x);
    else assert(bounds.results.y >= bounds.map.y + bounds.map.height - 1);
  }
  await shot("solve-road-mobile.png");
  log("桌面左右、窄屏上下，无页面横向溢出");
  await p.setViewportSize({ width: 1440, height: 1040 });
  const before = db.prepare("SELECT count(*) n FROM tasks").get().n;
  await button("确认选中方案").click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await button("核对派单").waitFor();
  assert(db.prepare("SELECT count(*) n FROM tasks").get().n > before);
  log("确认方案真实生成待派发任务（隔离仿真数据库）");
  await p.waitForFunction(
    () =>
      document.querySelector(".amap-container")?.dataset.mapReady === "true",
  );
  assert(tileResults.length > 0 && tileResults.every((v) => v === "OK"));
  assert.deepEqual(errors, []);
  log("真实瓦片鉴权OK，无页面运行错误");
  fs.writeFileSync(
    out + "browser-check.json",
    JSON.stringify(
      {
        checks,
        road: {
          source: data.source,
          coordinates: data.coordinates.length,
          distance_m: data.distance_m,
        },
        tileResults,
        errors,
        database: "isolated simulated SQLite",
        secrets_logged: false,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await b.close();
  await new Promise((r) => server.close(r));
  db.close();
}
