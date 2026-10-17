import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {database} from '../../../../server/db.mjs';
import {createApp} from '../../../../server/app.mjs';
import {loadConfig} from '../../../../server/config.mjs';
const local=process.argv.includes('--local'),out='docs/development/changes/CR-036/',prefix=local?'local-':'',manifest=JSON.parse(fs.readFileSync(out+'dataset-manifest.json','utf8')),checks=[],errors=[];
const file=out+'browser-validation.sqlite';if(!local)fs.copyFileSync(out+'prepared.sqlite',file);const db=local?null:database(file),server=local?null:createApp({db,config:loadConfig()}).app.listen(0,'127.0.0.1');if(server)await new Promise(r=>server.once('listening',r));const base=local?'http://127.0.0.1:3100':'http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1600,height:1050}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
const check=async name=>{const text=await page.evaluate(()=>document.body.innerText);assert(!/模拟|仿真|示例|演示|deepseek/i.test(text),name+'文案残留');checks.push({name,status:'PASS'});console.log('PASS '+name);};
try{
 await page.goto(base);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.global-header').waitFor();
 const bootstrap=await page.evaluate(async()=>{const r=await fetch('/api/bootstrap',{headers:{'X-Client-Portal':'pc'}});return r.json();});assert.equal(bootstrap.orders.length,10);assert.equal(bootstrap.demands.length,10);assert.equal(bootstrap.vehicles.length,15);assert.equal(bootstrap.stations.length,6);assert.equal(bootstrap.tasks.length,6);assert(bootstrap.orders.every(o=>o.code.startsWith('DD-QY-')));await check('正式页面可见10条需求、10条订单及完整资源');
 for(const [route,selector] of [['overview','.overview-workbench'],['demands','.transport-list-card'],['orders','.transport-list-card'],['tasks','.task-workbench'],['charging','.energy-workspace'],['stations','.energy-workspace'],['monitoring','.safety-monitor-workspace'],['alerts','.safety-workspace']]){
  await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(r=>document.querySelector('main > span.sr-only')&&location.hash.slice(1).split('?')[0]===r,route);await page.waitForTimeout(350);await check('业务页面数据与文字：'+route);await page.screenshot({path:out+prefix+route+'.png',fullPage:true});
 }
 const c=manifest.cases[1];await page.evaluate(id=>location.hash='simulation?order_id='+id,c.order_id);await page.getByLabel('运输总量（吨）',{exact:true}).waitFor();assert.equal(Number(await page.getByLabel('运输总量（吨）',{exact:true}).inputValue()),c.quantity);await check('订单可以带入交能推演，装卸点、运量和时间区间关联');
 const driver=await browser.newPage({viewport:{width:390,height:844}});driver.on('pageerror',e=>errors.push(e.message));await driver.goto(base+'/driver');await driver.locator('.phone-nav').waitFor();await driver.getByText('新庄长庆桥下午班',{exact:false}).first().waitFor();assert.equal(await driver.getByRole('button',{name:'登录',exact:true}).count(),0);await driver.screenshot({path:out+prefix+'driver-tasks.png',fullPage:true});
 if(!local){await driver.getByText('新庄长庆桥下午班',{exact:false}).first().click();await driver.getByRole('button',{name:'接收任务',exact:true}).click();await driver.getByRole('button',{name:'开始任务',exact:true}).waitFor();await driver.getByRole('button',{name:'开始任务',exact:true}).click();await driver.getByRole('button',{name:'登记新车次',exact:true}).waitFor();checks.push({name:'司机端默认登录、接收本人任务并开始执行',status:'PASS'});console.log('PASS 司机端接收和开始执行');}
 else checks.push({name:'司机端默认登录且显示本人待接收任务',status:'PASS'});
 const text=await driver.evaluate(()=>document.body.innerText);assert(!/模拟|仿真|示例|演示|deepseek/i.test(text));await driver.close();assert.deepEqual(errors,[]);fs.writeFileSync(out+prefix+'browser-check.json',JSON.stringify({status:'PASS',checks,errors,main_business_mutations:0},null,2));
}catch(e){await page.screenshot({path:out+prefix+'browser-failure.png',fullPage:true});fs.writeFileSync(out+prefix+'browser-check.json',JSON.stringify({status:'FAIL',checks,errors,message:e.stack},null,2));throw e;}finally{await browser.close();if(server)await new Promise(r=>server.close(r));if(db)db.close();}
