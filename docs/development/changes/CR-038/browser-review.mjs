import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {database} from '../../../../server/db.mjs';
import {createApp} from '../../../../server/app.mjs';
import {loadConfig} from '../../../../server/config.mjs';
const local=process.argv.includes('--local'),out='docs/development/changes/CR-038/',checks=[],errors=[];
const db=local?null:database(out+'prepared.sqlite'),server=local?null:createApp({db,config:loadConfig()}).app.listen(0,'127.0.0.1');if(server)await new Promise(r=>server.once('listening',r));
const base=local?'http://127.0.0.1:3100':'http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1680,height:1050}});page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
try{
 await page.goto(base);await page.getByRole('button',{name:'登录',exact:true}).click();await page.locator('.global-header').waitFor();
 const projects=await page.evaluate(async()=>{const r=await fetch('/api/planner/projects',{headers:{'X-Client-Portal':'pc'}});return r.json();});assert.equal(projects.items.length,2);checks.push('正式权限下可见两套规划项目');
 for(const route of ['planning','deployment']){
  await page.evaluate(r=>location.hash=r,route);await page.locator('.planning-workspace').waitFor();await page.getByRole('button',{name:'重新测算',exact:true}).waitFor();await page.locator('.planning-toolbar').getByText('庆阳及周边跨日运力与补能规划',{exact:true}).waitFor();await page.waitForTimeout(700);
  const text=await page.locator('.planning-workspace').innerText();assert(!text.includes('创建规划项目，选择业务范围和测算条件'));assert(!/模拟|仿真|示例|演示|deepseek/i.test(text));assert(text.includes('庆阳'));await page.screenshot({path:out+(local?'local-':'')+route+'.png',fullPage:true});checks.push(route+' 显示计算结果且无禁用文案');
 }
 const handoff=page.getByRole('button',{name:'带入交能推演',exact:false});await handoff.waitFor();assert(await handoff.isEnabled());await handoff.click();await page.getByLabel('运输总量（吨）',{exact:true}).waitFor();assert(Number(await page.getByLabel('运输总量（吨）',{exact:true}).inputValue())>0);checks.push('运力规划带入交能推演并保留运量');
 assert.deepEqual(errors,[]);fs.writeFileSync(out+(local?'local-':'')+'browser-check.json',JSON.stringify({status:'PASS',checks,errors},null,2));console.log(checks.join('\n'));
}catch(e){await page.screenshot({path:out+'failure.png',fullPage:true});throw e;}finally{await browser.close();if(server)await new Promise(r=>server.close(r));db?.close();}


