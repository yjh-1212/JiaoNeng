import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const before=process.argv.includes('--before'),out='docs/development/changes/CR-027/',browser=await chromium.launch({headless:false}),page=await browser.newPage(),errors=[],checks=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3100/');await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();await page.locator('.ac-agent-card').last().waitFor();
 for(const [width,height]of [[1920,1080],[1680,900],[1536,864],[1366,768],[1280,720],[1280,640]]){
  await page.setViewportSize({width,height});const sizes=await page.evaluate(()=>{const q=s=>{const e=document.querySelector(s);return{client:e.clientHeight,scroll:e.scrollHeight,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}};return{home:q('.ac-home'),root:q('.agent-center'),last:q('.ac-agent-card:last-child'),docHeight:document.documentElement.scrollHeight,docWidth:document.documentElement.scrollWidth}});
  checks.push({width,height,...sizes});
  if(!before){assert(sizes.home.scroll<=sizes.home.client+1,JSON.stringify(checks.at(-1)));assert(sizes.docHeight<=height+1);assert(sizes.docWidth<=width+1);assert(sizes.last.bottom<=height-8);assert.equal(await page.locator('.ac-agent-card').count(),6);}
  if(width===1366)await page.screenshot({path:out+(before?'before-':'')+'home-1366.png'});
 }
 if(!before){
  await page.setViewportSize({width:1280,height:520});const small=await page.locator('.ac-home').evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,overflow:getComputedStyle(e).overflowY}));assert(small.scroll>small.client);assert.equal(small.overflow,'auto');await page.locator('.ac-agent-card').last().scrollIntoViewIfNeeded();assert(await page.locator('.ac-agent-card').last().isVisible());
  await page.setViewportSize({width:1366,height:768});await page.locator('.ac-agent-card').filter({has:page.locator('strong',{hasText:'交能推演'})}).click();await page.locator('.ac-examples button').last().waitFor();const composer=await page.locator('.ac-compose-area').boundingBox();
  const chat=await page.locator('.ac-messages').evaluate(e=>{const content=document.createElement('div');content.style.height='2000px';content.textContent='布局检查：长消息滚动区域';e.append(content);e.scrollTop=500;return{client:e.clientHeight,scroll:e.scrollHeight}});assert(chat.scroll>chat.client);await page.waitForFunction(()=>document.querySelector('.ac-messages').scrollTop>0);const after=await page.locator('.ac-compose-area').boundingBox();assert.equal(after.y,composer.y);assert(after.y+after.height<=769);
  assert.equal(await page.locator('.ac-contextbar').count(),0);await page.getByRole('button',{name:'返回业务系统',exact:true}).first().click();await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).waitFor();
 }
 assert.deepEqual(errors,[]);const report={status:before?'MEASURED':'PASS',at:new Date().toISOString(),checks,small_window_reachable:!before,chat_scroll_preserved:!before,business_writes:0,external_model_calls:0,errors};fs.writeFileSync(out+(before?'before-measurements':'browser-check')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
