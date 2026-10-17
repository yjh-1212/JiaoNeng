import { chromium } from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { fixture } from "./helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
const local = process.argv.includes("--local"),
  f = local ? null : await fixture(),
  base = local ? "http://127.0.0.1:3100/" : f.base,
  out = "docs/development/changes/CR-030/overview-",
  checks = [],
  errors = [];
const browser = await chromium.launch({ headless: false }),
  p = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => errors.push(e.message));
const log = (name) => {
  checks.push({ name, status: "PASS" });
  console.log("PASS " + name);
};
const originalTables=['demands','orders','tasks','trips','charging','sessions','alerts','vehicles','drivers','stations','devices','records'];
const originalRows=f?originalTables.map(t=>f.db.prepare('SELECT * FROM '+t+' ORDER BY id').all()):null;
async function home() {
  await p.evaluate(() => (location.hash = "overview"));
  await p.locator(".ow-metrics").waitFor();
}
async function allScopes() {
  // CR-030 removes the owner selector: retain the current account's full scope.
  assert.equal(await p.getByLabel("总览业务主体", { exact: true }).count(), 0);
  await p.locator(".ow-metrics").waitFor();
}
try {
  await p.goto(base);
  await p.getByLabel("登录账号", { exact: true }).fill("admin");
  await p.getByLabel("登录密码", { exact: true }).fill("JiaoNeng2026!");
  await p.getByRole("button", { name: "登录", exact: true }).click();
  await p.locator(".ow-metrics").waitFor();
  assert.equal(await p.locator(".ow-shortcuts>button").count(), 4);
  assert.equal(await p.locator(".ow-metrics>button").count(), 4);
  assert.equal(await p.locator(".ow-todos>button").count(), 6);
  assert.equal(await p.locator(".ow-ai-panel").count(), 1);
  assert.equal(await p.locator(".agent-global-launcher").count(), 1);
  await p.screenshot({
    path: out + (local ? "local-" : "") + "overview-1920.png",
    fullPage: true,
  });
  log("辽粮式欢迎横幅、四入口、概况、进度、六待办、近期任务与AI侧栏完整");
  await allScopes();
  await p.locator('[data-todo="dispatch"]').click();
  await p.getByRole("tab", { name: /待派发/ }).waitFor();
  assert.equal(
    await p.getByRole("tab", { name: /待派发/ }).getAttribute("aria-selected"),
    "true",
  );
  log("全部授权范围内待派发筛选正确带入运输任务");
  await home();
  await allScopes();
  await p.locator('[data-todo="charging"]').click();
  assert(!(await p.evaluate(() => location.hash)).includes("owner=ORG-N"));
  assert((await p.evaluate(() => location.hash)).includes("stage=pending"));
  log("待补能进入全部授权范围及待安排分组");
  await home();
  await allScopes();
  await p.locator('[data-todo="alert"]').click();
  await p.getByRole('heading', {name:'异常处置',exact:true}).first().waitFor();
  assert(!(await p.evaluate(() => location.hash)).includes("owner="));
  log("异常待办进入全部授权范围");
  await home();
  await p.locator(".ow-task-panel .ow-action").first().click();
  await p.locator(".task-drawer-summary").waitFor();
  log("近期任务查看进入真实任务详情");
  await home();
  await p.locator(".ow-shortcuts>button").first().click();
  await p.getByRole("dialog", { name: "新建运输需求", exact: true }).waitFor();
  await p.getByLabel("需求名称", { exact: true }).fill("总览入口草稿检查");
  p.once('dialog',dialog=>dialog.accept());
  await p.getByRole("button", { name: "关闭编辑", exact: true }).click();
  await p.getByRole('dialog',{name:'新建运输需求',exact:true}).waitFor({state:'hidden'});
  log("需求入口打开原右侧编辑抽屉，未保存不写业务");
  await p.locator(".ow-ai-prompts>button").first().click();
  await p.getByLabel("向交能AI提问", { exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("向交能AI提问", { exact: true }).inputValue(),
    "帮我整理一笔煤炭运输需求。",
  );
  if (f) {
    assert.equal(f.calls.length,0);
    await p.getByRole('button',{name:'发送问题',exact:true}).click();
    await p.locator('.ac-turn').first().waitFor();
    await p.getByRole('button',{name:'发送问题',exact:true}).waitFor();
    assert.equal(f.calls.length,1);
    assert.equal(f.calls[0].question,'帮我整理一笔煤炭运输需求。');
  }
  await p
    .getByRole("button", { name: "返回业务系统", exact: true })
    .first()
    .click();
  await p.locator(".ow-metrics").waitFor();
  log("AI建议带入对应智能体及可编辑问题，不自动调用模型或创建业务");
  for (const [width, height] of [
    [1366, 900],
    [1280, 800],
    [390, 844],
  ]) {
    await p.setViewportSize({ width, height });
    await p.locator(".ow-metrics").waitFor();
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const horizontal=await p.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).filter(e=>e.right>innerWidth+1).slice(0,12)}));
    assert(horizontal.width<=horizontal.viewport+1,JSON.stringify(horizontal));
    await p.screenshot({
      path: out + (local ? "local-" : "") + "overview-" + width + ".png",
      fullPage: true,
    });
  }
  log("1366/1280/390布局无整页横向溢出");
  await p.setViewportSize({ width: 1366, height: 900 });
  await p.route("**/api/overview*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "隔离测试接口失败" }),
    }),
  );
  await p.reload();
  await p
    .getByText("业务数据暂未加载：隔离测试接口失败", { exact: true })
    .waitFor();
  assert.equal(await p.locator(".ow-metrics").count(), 0);
  await p.unroute("**/api/overview*");
  await p.getByRole("button", { name: "重试", exact: true }).click();
  await p.locator(".ow-metrics").waitFor();
  log("汇总失败明确显示并可重试，不把失败显示为零或旧主体数据");
  assert.deepEqual(errors, []);
  if(f)assert.deepEqual(originalTables.map(t=>f.db.prepare('SELECT * FROM '+t+' ORDER BY id').all()),originalRows);
  const report = {
    status: "PASS",
    at: new Date().toISOString(),
    checks,
    errors,
    local_service: local,
    formal_business_writes: 0,
    external_model_calls: 0,
  };
  fs.writeFileSync(
    out + (local ? "local-review" : "browser-check") + ".json",
    JSON.stringify(report, null, 2),
  );
} catch (e) {
  await p.screenshot({
    path: out + (local ? "local-" : "") + "browser-failure.png",
    fullPage: true,
  });
  fs.writeFileSync(
    out + (local ? "local-review" : "browser-check") + ".json",
    JSON.stringify(
      { status: "FAIL", checks, errors, message: e.stack },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
  if (f) await f.close();
}
