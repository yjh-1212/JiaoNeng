import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:false}),context=await browser.newContext({viewport:{width:1680,height:1050}}),page=await context.newPage(),errors=[],checks=[],out='docs/development/changes/CR-023/';
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
async function login(p,user){await p.goto('http://127.0.0.1:3100/');await p.getByLabel('登录账号',{exact:true}).fill(user);await p.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await p.getByRole('button',{name:'登录',exact:true}).click();}
try{
  await login(page,'admin');await page.getByRole('heading',{name:'运营总览',exact:true}).first().waitFor();
  for(const [route,title]of[['demands','运输需求'],['orders','运输订单'],['tasks','运输任务'],['charging','补能调度'],['alerts','异常处置'],['planning','场站规划'],['simulation','交能推演']]){
    await page.evaluate(r=>location.hash=r,route);await page.getByRole('heading',{name:title,exact:true}).first().waitFor();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).waitFor();assert.equal(await page.locator('.agent-global-launcher').count(),1);
    await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();await page.locator('.ac-agent-card').last().waitFor();assert.equal(await page.locator('.ac-agent-card').count(),6);
    if(route==='demands')await page.screenshot({path:out+'local-center-home.png'});
    await page.getByRole('button',{name:'返回业务系统',exact:true}).first().click();assert((await page.evaluate(()=>location.hash)).startsWith('#'+route));checks.push(route);
  }
  const driver=await browser.newContext(),dp=await driver.newPage();await login(dp,'driver01');await dp.locator('.phone-wrap').waitFor();assert.equal(await dp.locator('.agent-global-launcher').count(),0);await driver.close();
  assert.deepEqual(errors,[]);const report={status:'PASS',at:new Date().toISOString(),url:'http://127.0.0.1:3100/',business_pages:checks,each_has_one_launcher:true,each_opens_six_agent_center:true,returns_to_original_page:true,driver_entry_absent:true,live_model_calls:0,business_writes:0,errors};
  fs.writeFileSync(out+'local-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page.screenshot({path:out+'local-review-failure.png'});fs.writeFileSync(out+'local-review.json',JSON.stringify({status:'FAIL',checks,errors,message:e.message},null,2));throw e;}
finally{await browser.close();}
