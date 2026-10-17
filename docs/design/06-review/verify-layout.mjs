import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out=path.resolve('docs/design/06-review/evidence');
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
const base=pathToFileURL(path.resolve('prototypes/design-preview/index.html')).href;
try{
 await p.goto(base+'#page-030');await p.getByRole('heading',{name:'经营分析',exact:true}).waitFor();
 assert.equal(await p.locator('.sidebar,.prototype-strip,.page-heading p').count(),0);
 assert.equal(await p.getByText('预计与实际分开，费用范围和核验交付量决定是否可比。',{exact:true}).count(),0);
 assert(await p.locator('.global-header').isVisible());assert.equal(await p.getByRole('button',{name:'登记费用',exact:true}).evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');checks.push('主按钮文字对比度');checks.push('顶部导航与无常驻说明');
 await p.screenshot({path:path.join(out,'revision-002-cost-desktop.png'),fullPage:true});
 await p.getByRole('menuitem',{name:'运输调度',exact:true}).hover();await p.getByRole('menuitem',{name:'交能推演',exact:true}).click();
 await p.getByRole('heading',{name:'交能推演',exact:true}).waitFor();checks.push('顶部下拉菜单切换工作区');
 await p.getByRole('button',{name:'开始推演',exact:true}).click();await p.getByRole('button',{name:'确认选中方案',exact:true}).waitFor();
 const layout=await p.evaluate(()=>{const c=document.querySelector('.sim-conditions').getBoundingClientRect(),r=document.querySelector('.simulation-results').getBoundingClientRect();return{conditionTop:c.top,conditionBottom:c.bottom,conditionHeight:c.height,resultTop:r.top}});
 assert(layout.conditionBottom<=layout.resultTop);assert(layout.conditionHeight<370);checks.push('条件区低于370px且在结果之上');
 await p.screenshot({path:path.join(out,'revision-002-simulation-desktop.png'),fullPage:true});
 for(const width of [1280,1024,768,390,320]){await p.setViewportSize({width,height:900});await p.waitForTimeout(150);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await p.screenshot({path:path.join(out,`revision-002-simulation-${width}.png`),fullPage:true});checks.push(width+'px无页面横向溢出')}
 await p.setViewportSize({width:390,height:844});await p.getByRole('menuitem',{name:'更多',exact:true}).hover();await p.getByRole('menuitem',{name:'经营管理',exact:true}).hover();await p.getByRole('menuitem',{name:'经营分析',exact:true}).click();await p.getByRole('heading',{name:'经营分析',exact:true}).waitFor();checks.push('手机折叠菜单可进入二级页面');
 await p.screenshot({path:path.join(out,'revision-002-cost-mobile.png'),fullPage:true});
 await p.getByRole('button',{name:'演示',exact:true}).click();await p.getByLabel('界面主题',{exact:true}).click();await p.locator('.ant-select-dropdown:visible').getByText('深色',{exact:true}).click();await p.getByRole('button',{name:'完成',exact:true}).click();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>document.body.dataset.theme),'dark');checks.push('收起的演示设置与主题切换');
 await p.setViewportSize({width:1440,height:1000});await p.screenshot({path:path.join(out,'revision-002-cost-dark.png'),fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'revision-002-checks.json'),JSON.stringify({status:'PASS',checks,errors,layout},null,2));console.log(JSON.stringify({status:'PASS',checks,layout}));
}catch(e){console.error(e);await p.screenshot({path:path.join(out,'revision-002-failure.png'),fullPage:true});process.exitCode=1}finally{await browser.close()}
