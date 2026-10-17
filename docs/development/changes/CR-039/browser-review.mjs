import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {database} from '../../../../server/db.mjs';
import {createApp} from '../../../../server/app.mjs';
import {loadConfig} from '../../../../server/config.mjs';
const out='docs/development/changes/CR-039/',local=process.argv.includes('--local'),checks=[],errors=[];
let db,server;
if(!local){const source=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true});for(const suffix of ['','-wal','-shm']){const target=out+'browser.sqlite'+suffix;if(fs.existsSync(target))fs.unlinkSync(target);}await backup(source,out+'browser.sqlite');source.close();db=database(out+'browser.sqlite');server=createApp({db,config:loadConfig()}).app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));}
const base=local?'http://127.0.0.1:3100':'http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1920,height:1080}});page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
const log=name=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
try{
 await page.goto(base);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.global-header').waitFor();
 const menu=await page.locator('.horizontal-nav > ul > li').allTextContents();assert(menu.join('|').indexOf('综合驾驶舱')>menu.join('|').indexOf('运营总览'));assert(menu.join('|').indexOf('综合驾驶舱')<menu.join('|').indexOf('订单管理'));
 await page.getByRole('menuitem',{name:'综合驾驶舱',exact:true}).click();await page.locator('.jn-cockpit-overview-grid').first().waitFor();assert.equal(await page.locator('.global-header').count(),0);assert.equal(await page.getByRole('button',{name:'返回运营总览',exact:true}).count(),1);assert.equal(await page.locator('.jn-cockpit-kpi').count(),0);assert.equal(await page.locator('.jn-cockpit-panel').count(),6);assert.equal(await page.locator('.jn-cockpit [role=tab]').count(),0);log('菜单紧随运营总览，单页六面板，无顶部统计与Tab');
 await page.waitForFunction(()=>document.querySelector('.jn-cockpit-map')?.dataset.ready==='true',{},{timeout:45000});await page.waitForFunction(()=>Number(document.querySelector('.jn-cockpit-map')?.dataset.routePoints)>10,{},{timeout:60000});assert.equal(await page.locator('.jn-cockpit-map').getAttribute('data-view-mode'),'2D');log('高德二维地图加载成功，路线使用道路几何');
 for(const [width,height]of[[1920,1080],[1600,900],[1366,768]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(500);const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,panels:[...document.querySelectorAll('.jn-cockpit-panel')].map(e=>({title:e.getAttribute('aria-label'),bottom:e.getBoundingClientRect().bottom,body:e.querySelector('.jn-cockpit-panel-body').clientHeight,scroll:e.querySelector('.jn-cockpit-panel-body').scrollHeight,children:[...e.querySelector('.jn-cockpit-panel-body').children].map(c=>({class:c.className,height:c.getBoundingClientRect().height,line:getComputedStyle(c).lineHeight,shrink:getComputedStyle(c).flexShrink,margin:getComputedStyle(c).margin,padding:getComputedStyle(c).padding}))}))}));
  fs.writeFileSync(out+`layout-${width}.json`,JSON.stringify(layout,null,2));assert(layout.scrollWidth<=width+2,'横向溢出');assert(layout.scrollHeight<=height+2,'整页纵向溢出');assert(layout.panels.every(p=>p.bottom<=height),'面板越出屏幕');assert(layout.panels.every(p=>p.scroll<=p.body+3),'面板内容溢出 '+JSON.stringify(layout.panels));
  await page.screenshot({path:out+(local?'local-':'')+`cockpit-${width}.png`,fullPage:false});log(width+'×'+height+' 一屏展示、面板无内容溢出');
 }
 await page.setViewportSize({width:1920,height:1080});
 const station=page.locator('.jn-cockpit-site-status button').first();await station.click();await page.getByRole('region',{name:'选中业务信息'}).waitFor();await page.getByRole('button',{name:'关闭选中信息'}).click();
 await page.locator('.jn-cockpit-route-list button').first().click();await page.getByRole('region',{name:'选中业务信息'}).waitFor();await page.getByRole('button',{name:'查看订单',exact:false}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');log('场站和线路选中联动，订单详情可打开');
 await page.getByRole('checkbox',{name:'运输线路'}).uncheck();await page.getByRole('checkbox',{name:'运输线路'}).check();await page.getByRole('button',{name:'恢复全局视角'}).click();log('图层勾选与全局视角恢复');
 await page.getByRole('button',{name:'进入全屏',exact:true}).click();await page.getByRole('button',{name:'退出全屏',exact:true}).waitFor();await page.getByRole('button',{name:'退出全屏',exact:true}).click();log('全屏进入与退出');
 assert.equal(await page.getByRole('button',{name:'打开本页AI助手'}).count(),0);assert.equal(await page.locator('.agent-global-launcher').count(),0);log('驾驶舱隐藏AI人物与交能AI悬浮按钮');
 await page.getByRole('button',{name:'刷新驾驶舱'}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="刷新驾驶舱"]').disabled);log('手动刷新读取当前数据库');
 const text=await page.locator('.jn-cockpit').innerText();assert(!/模拟|仿真|示例|演示|deepseek/i.test(text));
 await page.getByRole('button',{name:'返回运营总览',exact:true}).click();await page.locator('.overview-workbench').waitFor();await page.locator('.global-header').waitFor();assert.equal(await page.locator('.jn-cockpit').count(),0);await page.getByRole('button',{name:'打开本页AI助手'}).waitFor();log('右上角返回运营总览，恢复系统导航、AI入口与原业务布局');await page.goBack();await page.locator('.jn-cockpit').waitFor();assert.equal(await page.locator('.global-header').count(),0);await page.reload();await page.locator('.jn-cockpit-overview-grid').waitFor();assert.equal(await page.locator('.global-header').count(),0);assert.equal(await page.locator('.agent-global-launcher').count(),0);log('浏览器后退和直接刷新保持独立驾驶舱与登录状态');assert.deepEqual(errors,[]);
 fs.writeFileSync(out+(local?'local-':'')+'browser-check.json',JSON.stringify({status:'PASS',checks,errors},null,2));
}catch(e){await page.screenshot({path:out+'failure.png',fullPage:true});fs.writeFileSync(out+'failure.json',JSON.stringify({error:e.stack,checks,errors},null,2));throw e;}finally{await browser.close();if(server)await new Promise(r=>server.close(r));db?.close();}




