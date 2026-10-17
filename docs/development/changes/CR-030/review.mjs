import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fixture} from '../../../../tests/helpers.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const local=process.argv.includes('--local'),f=local?null:await fixture(),base=local?'http://127.0.0.1:3100':f.base,out='docs/development/changes/CR-030/';
const browser=await chromium.launch({headless:false}),context=await browser.newContext({viewport:{width:1920,height:1080}}),p=await context.newPage(),checks=[],errors=[];
const watch=page=>{page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));};watch(p);
const log=name=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
let driver;
try {
 await p.goto(base);await p.getByLabel('登录账号',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('登录账号',{exact:true}).inputValue(),'admin');
 assert.equal(await p.getByLabel('登录密码',{exact:true}).inputValue(),'JiaoNeng2026!');
 assert.equal(await p.getByLabel('登录密码',{exact:true}).getAttribute('type'),'password');
 assert.equal(await p.getByAltText('中国数联',{exact:true}).count(),0);
 assert.equal(await p.getByText('管理员登录',{exact:true}).count(),0);assert.equal(await p.getByLabel('登录身份',{exact:true}).count(),0);assert.equal(await p.getByText('本地仿真账号',{exact:true}).count(),0);assert.equal(await p.getByText('司机',{exact:true}).count(),0);
 let submitted=0;p.on('request',r=>{if(r.url().endsWith('/api/auth/login'))submitted++;});
 await p.getByRole('button',{name:'显示密码',exact:true}).click();assert.equal(await p.getByLabel('登录密码',{exact:true}).getAttribute('type'),'text');
 await p.getByRole('button',{name:'隐藏密码',exact:true}).click();assert.equal(await p.getByLabel('登录密码',{exact:true}).getAttribute('type'),'password');assert.equal(submitted,0);
 for(const [width,height] of [[1920,1080],[1366,900],[390,844]]){
  await p.setViewportSize({width,height});
  const bg=await p.locator('.login-brand').evaluate(e=>getComputedStyle(e).backgroundImage);
  assert(bg.includes('overview-energy-hub'));await p.evaluate(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve();i.onerror=()=>reject(new Error('背景未加载'));i.src=src;}),bg.match(/url\(["']?(.*?)["']?\)/)[1]);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:out+(local?'local-':'')+'login-'+width+'.png',fullPage:true});
 }
 log('账号密码预填、可见切换不提交、角色标题移除、三种尺寸背景加载且无横向溢出');
 await p.setViewportSize({width:1366,height:900});
 if(!local){await p.getByLabel('登录密码',{exact:true}).fill('invalid-password');await p.getByRole('button',{name:'登录',exact:true}).click();await p.getByText('账号或密码不正确',{exact:true}).waitFor();assert.equal(await p.getByLabel('登录密码',{exact:true}).inputValue(),'invalid-password');await p.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');log('错误凭证被拒绝、输入保留');}
 await p.getByRole('button',{name:'登录',exact:true}).click();await p.locator('.ow-metrics').waitFor();
 assert(await p.locator('.global-header .corporate-logo').evaluate(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await p.getByLabel('总览业务主体',{exact:true}).count(),0);assert.equal(await p.locator('.ow-toolbar').getByRole('button',{name:'刷新',exact:true}).count(),0);
 await p.screenshot({path:out+(local?'local-':'')+'overview.png',fullPage:true});log('PC默认登录正常、总览主体筛选和刷新移除');
 driver=await context.newPage();watch(driver);await driver.setViewportSize({width:390,height:844});await driver.goto(base+'/driver');await driver.locator('.phone-nav').waitFor();
 const identity=await driver.evaluate(()=>fetch('/api/auth/me',{headers:{'X-Client-Portal':'driver'}}).then(r=>r.json()));assert.equal(identity.user.username,'driver05');
 await driver.screenshot({path:out+(local?'local-':'')+'driver.png',fullPage:true});
 const cookies=await context.cookies();assert(cookies.some(c=>c.name==='jn_session'));assert(cookies.some(c=>c.name==='jn_driver_session'));
 await driver.reload();await driver.locator('.phone-nav').waitFor();
 assert.equal((await driver.evaluate(()=>fetch('/api/overview',{headers:{'X-Client-Portal':'driver'}}).then(r=>r.status))),403);
 await p.reload();await p.locator('.ow-metrics').waitFor();
 assert.equal((await p.evaluate(()=>fetch('/api/auth/me').then(r=>r.json()))).user.username,'admin');log('独立司机入口自动进入driver05，刷新正常，司机无总览权限，PC会话不被覆盖');
 await driver.getByRole('button',{name:'我的',exact:true}).click();await driver.getByRole('button',{name:'退出登录',exact:true}).click();await driver.getByRole('button',{name:'重新进入司机端',exact:true}).waitFor();
 await p.reload();await p.locator('.ow-metrics').waitFor();
 await driver.getByRole('button',{name:'重新进入司机端',exact:true}).click();await driver.locator('.phone-nav').waitFor();log('司机退出仅清理司机会话，保留PC，支持重新进入');
 await p.getByRole('button',{name:'账号菜单',exact:true}).click();await p.getByRole('menuitem',{name:'退出登录',exact:true}).click();await p.getByLabel('登录账号',{exact:true}).waitFor();
 await driver.reload();await driver.locator('.phone-nav').waitFor();log('PC退出不影响司机会话');
 if(f){f.db.prepare("UPDATE users SET enabled=0 WHERE username='driver05'").run();await driver.reload();await driver.getByText('默认司机账号不可用，请联系管理员',{exact:true}).waitFor();assert.equal(await driver.locator('.login-card').count(),0);f.db.prepare("UPDATE users SET enabled=1 WHERE username='driver05'").run();await driver.getByRole('button',{name:'重新进入司机端',exact:true}).click();await driver.locator('.phone-nav').waitFor();log('默认司机停用时明确报错，恢复后可重试，无管理员回退');}
 assert.deepEqual(errors,[]);
 fs.writeFileSync(out+(local?'local-review':'browser-check')+'.json',JSON.stringify({status:'PASS',checks,errors,business_writes:0,external_model_calls:0},null,2));
}catch(e){await p.screenshot({path:out+'failure.png',fullPage:true});if(driver)await driver.screenshot({path:out+'driver-failure.png',fullPage:true});fs.writeFileSync(out+(local?'local-review':'browser-check')+'.json',JSON.stringify({status:'FAIL',checks,errors,message:e.stack},null,2));throw e;}
finally{await browser.close();if(f)await f.close();}
