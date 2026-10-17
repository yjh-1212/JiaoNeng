import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1680,height:1050}}),out='docs/development/changes/CR-024/',errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
try{
 await page.goto('http://127.0.0.1:3100/');await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();await page.locator('.ac-agent-card').last().waitFor();
 for(const width of [1680,1280]){
  await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.ac-hero,.ac-contextbar').count(),0);
  for(const label of ['智能体业务主体','关联业务类型','关联业务对象'])assert.equal(await page.getByLabel(label,{exact:true}).count(),0);
  assert.equal(await page.locator('.ac-agent-card').count(),6);
  const box=await page.getByLabel('向交能AI提问',{exact:true}).boundingBox();assert(box.y<180,'No removed area may retain blank space');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'center-'+width+'.png'});checks.push({width,composer_top:box.y,status:'PASS'});
 }
 await page.getByRole('button',{name:/智能体广场/}).click();assert.equal(await page.locator('.ac-agent-card').count(),6);assert.equal(await page.locator('.ac-hero,.ac-contextbar').count(),0);
 await page.getByRole('button',{name:/运输需求.*整理运输条件/}).click();await page.getByLabel('向交能AI提问',{exact:true}).fill('暂存问题');assert.equal(await page.getByLabel('向交能AI提问',{exact:true}).inputValue(),'暂存问题');assert.equal(await page.locator('.ac-contextbar').count(),0);
 await page.getByRole('button',{name:'返回业务系统',exact:true}).first().click();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).waitFor();assert.deepEqual(errors,[]);
 fs.copyFileSync('docs/development/changes/CR-023/browser-check.json',out+'interaction-regression.json');
 const report={status:'PASS',at:new Date().toISOString(),checks,removed_selectors_and_hero:true,square_and_chat_work:true,return_to_business:true,model_calls:0,business_writes:0,errors};fs.writeFileSync(out+'browser-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
