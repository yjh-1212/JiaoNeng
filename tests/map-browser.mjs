import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database } from "../server/db.mjs";
import fs from "node:fs";
const db = database(":memory:"),
  { app } = createApp({ db }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  base = "http://127.0.0.1:" + server.address().port;
const report = {
  checked_at: new Date().toISOString(),
  database: "isolated simulated SQLite",
  secrets_logged: false,
  requests: [],
};
page.on("requestfailed", (r) => {
  const u = new URL(r.url());
  if (/amap/.test(u.hostname))
    report.requests.push({ host: u.hostname, status: "failed" });
});
try {
  await page.goto(base);
  await page.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
  try {
    await page
      .locator(".amap-layers canvas")
      .first()
      .waitFor({ timeout: 20000 });
    report.amap = {
      sdk_loaded: await page.evaluate(() => !!window.AMap),
      canvas_rendered: true,
    };
    await page.waitForTimeout(2500);
    report.amap.complete_event =
      (await page.locator(".amap-container").getAttribute("data-map-ready")) ===
      "true";
  } catch {
    report.amap = {
      sdk_loaded: await page.evaluate(() => !!window.AMap),
      canvas_rendered: false,
      error_visible: await page.locator('.map-feedback[role="alert"]').isVisible(),
    };
  }
  await page.screenshot({
    path: "docs/development/04-integration/amap-live.png",
    fullPage: true,
  });
} finally {
  fs.writeFileSync(
    "docs/development/04-integration/map-browser.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
}
