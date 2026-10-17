import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createApp } from "../server/app.mjs";
import { database, transaction } from "../server/db.mjs";
import { operationsCommand } from "../server/operations.mjs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
// User-authorized external check against an independent simulation database only.
const db = database(":memory:"),
  { app } = createApp({ db });
const user = {
  id: "U-ADMIN",
  role: "admin",
  scopes: ["ORG-N", "ORG-S"],
  operations: ["*"],
};
transaction(db, () => {
  operationsCommand(db, user, "forecast.load", null, {});
  operationsCommand(db, user, "planning.run", null, {
    candidate_id: "PL1",
    daily_quantity: 1200,
    distance_km: 20,
  });
});
const tables = [
  "orders",
  "tasks",
  "trips",
  "costs",
  "charging",
  "sessions",
  "alerts",
  "records",
  "vehicles",
  "drivers",
  "stations",
  "devices",
  "command_results",
];
const fingerprint = () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        tables.map((t) =>
          db.prepare("SELECT * FROM " + t + " ORDER BY 1").all(),
        ),
      ),
    )
    .digest("hex");
const before = fingerprint(),
  expectedTonnes = db
    .prepare("SELECT sum(verified_kg)/1000.0 n FROM tasks")
    .get().n;
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = {
  checked_at: new Date().toISOString(),
  database: "isolated simulated SQLite",
  secrets_logged: false,
  authorization:
    "当前用户明确允许发送本批仿真交付量及少量订单、预警、预测、规划资料，仅用于联调",
  runtime_errors: [],
};
page.on("pageerror", (e) => report.runtime_errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("heading", { name: "运营总览", exact: true }).waitFor();
  await page.evaluate(() => (location.hash = "assistant"));
  await page.getByRole("heading", { name: "智能助手", exact: true }).waitFor();
  await page
    .getByLabel("业务问题", { exact: true })
    .fill(
      "仅根据当前授权资料简短回答：已核验交付量是多少吨？请引用一个上下文中的订单编号，并明确这些资料是仿真数据；不要执行任何操作。",
    );
  const pending = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/assistant") && r.request().method() === "POST",
    { timeout: 55000 },
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const response = await pending,
    result = await response.json();
  report.http_status = response.status();
  assert.equal(response.status(), 200, result.message);
  await page.locator(".message.assistant").waitFor();
  const answer = await page.locator(".message.assistant").innerText();
  assert(answer.includes(String(expectedTonnes)), "回答应与数据库核验量一致");
  assert(/仿真|模拟/.test(answer), "回答应明确仿真属性");
  assert(result.refs.length > 0);
  for (const ref of result.refs) {
    if (ref.resource === "summary") {
      assert.equal(ref.id, "summary");
      continue;
    }
    const row = db
      .prepare("SELECT id,code,version FROM orders WHERE id=?")
      .get(ref.id);
    assert(row);
    assert.equal(row.code, ref.code);
    assert.equal(row.version, ref.version);
  }
  const cited = result.refs.filter(
    (ref) => ref.resource === "orders" && answer.includes(ref.code),
  );
  assert(cited.length > 0, "正文应引用上下文中的订单编号");
  assert.equal(result.actions_allowed, false);
  assert.equal(fingerprint(), before, "只读回答不得修改业务记录");
  assert.deepEqual(report.runtime_errors, []);
  report.status = "PASS";
  report.deepseek = {
    business_response: true,
    model: result.model,
    expected_verified_tonnes: expectedTonnes,
    quantity_matches_database: true,
    simulated_label_present: true,
    cited_orders: cited,
    all_reference_versions_valid: true,
    read_only_business_unchanged: true,
    data_time: result.data_time,
    answer: result.answer,
  };
} catch (e) {
  report.status = "FAIL";
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  await page.screenshot({
    path: "docs/development/04-integration/assistant-live.png",
    fullPage: true,
  });
  fs.writeFileSync(
    "docs/development/04-integration/live-browser.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
}
