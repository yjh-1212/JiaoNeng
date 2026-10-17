import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fixture} from '../../../../tests/helpers.mjs';
import {agents} from '../../../../shared/agents.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const local=process.argv.includes('--local'),f=local?null:await fixture(),out='docs/development/changes/CR-026/',errors=[],checks=[];
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1680,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(local?'http://127.0.0.1:3100/':f.base);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();await page.locator('.ac-agent-card').last().waitFor();
 for(const width of [1680,1280]){
  await page.setViewportSize({width,height:1000});await page.getByRole('heading',{name:'让运输与能源协同更清晰',exact:true}).waitFor();assert(await page.locator('.ac-banner img').evaluate(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('.ac-contextbar').count(),0);assert.equal(await page.locator('.ac-agent-card').count(),6);
  const banner=await page.locator('.ac-banner').boundingBox(),input=await page.getByLabel('向交能AI提问',{exact:true}).boundingBox();assert(banner.y+banner.height<input.y);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+(local?'local-':'')+'banner-'+width+'.png'});checks.push('banner '+width);
 }
 for(const g of agents){
  await page.locator('.ac-agent-card').filter({has:page.locator('strong',{hasText:g.name})}).click();await page.locator('.ac-examples button').last().waitFor();assert.deepEqual(await page.locator('.ac-examples button span').allTextContents(),g.examples);assert.equal(await page.locator('.ac-examples button svg').count(),2);assert.equal(await page.locator('.ac-banner,.ac-contextbar').count(),0);
  const first=await page.locator('.ac-examples button').first().boundingBox(),welcome=await page.locator('.ac-welcome').boundingBox();assert(first.width>=welcome.width-2);assert(first.height>=64);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(g.code==='SIMULATION')await page.screenshot({path:out+(local?'local-':'')+'simulation-prompts.png'});
  if(!local){
   const done=page.waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST');await page.locator('.ac-examples button').first().click();const response=await done;assert(response.ok());const body=await response.json();assert.equal(body.turn.question,g.examples[0]);assert.equal(body.turn.response.capability,g.code);await page.getByRole('button',{name:'发送问题',exact:true}).waitFor();
  }
  checks.push(g.code+' two row prompts'+(!local?' and send':''));await page.getByRole('button',{name:'首页',exact:true}).click();await page.locator('.ac-agent-card').last().waitFor();
 }
 await page.getByRole('button',{name:'返回业务系统',exact:true}).first().click();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).waitFor();assert.deepEqual(errors,[]);
 const report={status:'PASS',at:new Date().toISOString(),checks,local_service:local,business_writes:0,model_service:local?'not called':'explicit isolated test double',external_model_calls:0,errors};fs.writeFileSync(out+(local?'local-review':'browser-check')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();if(f)await f.close();}
