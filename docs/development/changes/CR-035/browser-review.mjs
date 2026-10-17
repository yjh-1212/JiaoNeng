import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/development/changes/CR-035/',checks=[],errors=[];
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:3100/');await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.global-header').waitFor();
 for(const route of ['overview','demands','simulation','monitoring','resources']){
  await page.evaluate(r=>location.hash=r,route);await page.locator('main > span.sr-only').waitFor({state:'attached'});
  assert.equal(await page.locator('.data-badge').count(),0);assert.equal(await page.locator('.breadcrumb-bar').count(),0);assert.equal(await page.locator('.global-header .account-name').innerText(),'平台管理员');
  const header=await page.locator('.global-header').boundingBox(),nav=await page.locator('.horizontal-nav').boundingBox();assert(Math.abs(nav.x+nav.width/2-(header.x+header.width/2))<1,'导航居中');
  checks.push({route,status:'PASS'});
  if(route==='monitoring'){await page.locator('.safety-monitor-workspace').waitFor();const map=await page.locator('.safety-monitor-workspace').boundingBox();assert(Math.abs(map.y-header.height)<2);assert(Math.abs(map.y+map.height-900)<2,'监控填满视口');}
 }
 await page.getByRole('button',{name:'账号菜单',exact:true}).click();await page.getByRole('menuitem',{name:'个人信息',exact:true}).waitFor();await page.keyboard.press('Escape');checks.push({check:'账号菜单保留',status:'PASS'});
 for(const width of [1920,1366,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(180);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'横向溢出 '+width);assert(await page.locator('.account-name').isVisible());await page.screenshot({path:out+'header-'+width+'.png'});checks.push({width,status:'PASS'});}
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'verification.json',JSON.stringify({status:'VERIFIED',checks,errors,build:'PASS',user_acceptance_signature:false},null,2));console.log('PASS header cleanup, account menu, centered navigation, monitoring viewport, three widths');
}catch(e){await page.screenshot({path:out+'failure.png',fullPage:true});throw e;}finally{await browser.close();}

