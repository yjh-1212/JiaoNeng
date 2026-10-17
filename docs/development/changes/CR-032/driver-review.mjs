import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/development/changes/CR-032/',browser=await chromium.launch({headless:false}),p=await browser.newPage({viewport:{width:390,height:844}}),errors=[],checks=[];
try{
 p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3100/driver');await p.locator('.phone-nav').waitFor();
 for(const [route,title] of [['m-tasks','我的任务'],['m-energy','补能安排'],['m-profile','我的']]){await p.evaluate(r=>location.hash=r,route);await p.getByRole('heading',{name:title,exact:true}).waitFor();const text=await p.locator('body').innerText();assert(!/仿真|模拟|示例|演示|deepseek/i.test(text));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push({name:'司机页面：'+title,status:'PASS'});}
 const data=await p.evaluate(()=>fetch('/api/bootstrap',{headers:{'X-Client-Portal':'driver'}}).then(r=>r.json()));assert.equal(data.user.username,'driver05');assert.equal(data.tasks.length,0);assert.equal(data.orders.length,0);await p.screenshot({path:out+'driver-final.png',fullPage:true});assert.deepEqual(errors,[]);
 const report={status:'PASS',checks,errors,driver:'driver05',historical_operational_rows_visible:0};fs.writeFileSync(out+'driver-browser-check.json',JSON.stringify(report,null,2));
 const partial=JSON.parse(fs.readFileSync(out+'local-final-browser-check.json','utf8'));assert(partial.checks.length===4&&partial.checks.every(c=>c.status==='PASS'));assert(partial.message?.includes('Please use browser.newContext()'));
 fs.writeFileSync(out+'local-final-browser-harness-failure.json',JSON.stringify(partial,null,2));
 fs.writeFileSync(out+'local-final-browser-check.json',JSON.stringify({status:'PASS',checks:[...partial.checks,...checks],errors,real_map_and_ai:true,driver_evidence:'driver-browser-check.json',note:'Regional and AI checks passed before test-harness owned-context restriction. Driver checks were rerun in their own browser context; original harness failure retained.'},null,2));
 console.log('PASS driver three pages, independent entry and hidden historical rows; final combined review complete');
}finally{await browser.close();}
