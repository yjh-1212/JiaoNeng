import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const OUT=path.resolve('docs/design/05-prototype/evidence');fs.mkdirSync(OUT,{recursive:true});
const base=pathToFileURL(path.resolve('prototypes/design-preview/index.html')).href;
const pageDefs=JSON.parse(fs.readFileSync('prototypes/design-preview/source/schema.js','utf8').replace('export const pages=','').trim().replace(/;$/,''));
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
const errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const log=(name,data={})=>{checks.push({name,result:'PASS',...data});console.log('PASS',name);fs.writeFileSync(path.join(OUT,'progress.json'),JSON.stringify({checks,errors},null,2))};
const click=async(name,exact=true)=>p.getByRole('button',{name,exact}).click();
const go=async id=>{await p.evaluate(id=>location.hash=id.toLowerCase(),id);await p.locator('h1').first().waitFor();await p.waitForTimeout(90)};
const store=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('jiaoneng-d5-demo-v1')));
const select=async(label,text)=>{const review=['演示状态','演示权限','界面主题'].includes(label);if(review)await p.getByRole('button',{name:'演示',exact:true}).click();await p.getByLabel(label,{exact:true}).click();await p.locator('.ant-select-dropdown:visible').getByText(text,{exact:true}).last().click();if(review){await p.getByRole('dialog',{name:'演示设置',exact:true}).getByRole('button',{name:'完成',exact:true}).click();await p.getByRole('dialog',{name:'演示设置',exact:true}).waitFor({state:'hidden'})}};
const save=()=>p.getByRole('dialog').getByRole('button',{name:'保存并核对',exact:true}).click();
const confirm=()=>p.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
try{
 await p.goto(base+'#page-001');await p.getByRole('heading',{name:'运营总览',exact:true}).waitFor();
 for(const meta of pageDefs){await go(meta.page_id);const expected=meta.page_id==='PAGE-041'?'管理员登录':meta.page_name;await p.getByRole('heading',{name:expected,exact:true}).first().waitFor();assert.equal(await p.getByText('原型页面加载异常',{exact:true}).count(),0);await p.screenshot({path:path.join(OUT,meta.page_id+'-light.png'),fullPage:true});log(meta.page_id+'路由与首屏',{page:meta.page_name})}
 await go('PAGE-005');await click('开始推演');await p.getByRole('button',{name:'确认选中方案',exact:true}).waitFor();const bounds=await p.evaluate(()=>{const a=document.querySelector('.sim-conditions').getBoundingClientRect(),b=document.querySelector('.simulation-results').getBoundingClientRect();return{top:a.top,bottom:a.bottom,resultTop:b.top}});assert(bounds.bottom<=bounds.resultTop);log('交能推演上条件下结果布局',bounds);
 await click('方案对比');await p.getByRole('dialog').getByRole('heading',{name:'方案对比 · 同一运行',exact:true}).waitFor();await click('关闭详情');log('方案比较与DraggablePanel可打开关闭');
 await click('确认选中方案');await confirm();assert((await store()).simulation.confirmed);await click('核对派单');await click('核对派单');
 await select('指派车辆 2','示例甘M·0101');await click('整批校验');await p.getByText('任务 RW-261013-02 与首项存在车辆/司机时间冲突。本批全部未派发。',{exact:true}).waitFor();assert((await store()).tasks.every(t=>t.status==='待派发'));log('整批冲突全部不生效');
 await select('指派车辆 2','示例甘M·0102');await click('整批校验');await click('统一派发');await confirm();assert((await store()).tasks.every(t=>t.status==='待接收'));log('全批派单成功但司机仍待接收');
 await click('演示');await click('司机 H5');await p.getByRole('heading',{name:'我的任务',exact:true}).waitFor();await p.getByRole('button').filter({has:p.getByRole('heading',{name:'RW-261013-01',exact:true})}).click();await click('接收任务');await confirm();await click('开始任务');await click('登记新车次');await click('反馈装货完成');await p.getByLabel('装货凭证或核验说明',{exact:true}).fill('');await save();await p.getByText('请填写装货凭证或核验说明',{exact:true}).waitFor();await p.getByLabel('装货凭证或核验说明',{exact:true}).fill('演示装货凭证');await save();await click('开始运输');await click('反馈卸货交付');await save();assert.equal((await store()).tasks[0].trips.length,1);assert.equal((await store()).tasks[0].reported,30);log('司机本人接单、多节点反馈、车次不重复计量与必填校验');
 await click('提交完工');await p.getByLabel('未履约量及责任说明（报告量不足计划时必填）',{exact:true}).fill('剩余270吨未执行，待管理员核对责任和组织余量');await save();assert.equal((await store()).tasks[0].status,'待核验');assert.equal((await store()).tasks[0].verified,0);log('司机提交仅进入待核验');
 await click('管理端演示');await go('PAGE-007');await p.locator('.ant-table-tbody tr[data-row-key]').first().getByRole('button',{name:'查看',exact:true}).click();await click('退回补充');await p.getByLabel('需要补充的差异与依据',{exact:true}).fill('补充本次交付凭证');await save();assert.equal((await store()).tasks[0].status,'退回补充');await go('PAGE-044');await p.getByRole('button').filter({has:p.getByRole('heading',{name:'RW-261013-01',exact:true})}).click();await click('提交完工');await save();assert.equal((await store()).tasks[0].submission,2);log('核验退回后重新提交保留版本');
 await go('PAGE-007');await p.locator('.ant-table-tbody tr[data-row-key]').first().getByRole('button',{name:'查看',exact:true}).click();await click('核验通过');await save();assert.equal((await store()).tasks[0].status,'已完成');assert.equal((await store()).tasks[0].verified,30);await go('PAGE-001');assert.equal((await store()).tasks.filter(t=>t.status==='已完成').reduce((n,t)=>n+t.verified,0),30);log('管理员核验后总览与任务同步');
 await go('PAGE-004');await select('演示权限','北区 · 仅查询');await click('新建订单');await save();await p.getByText('当前只有查询授权，未更改任何业务记录',{exact:true}).first().waitFor();assert.equal((await store()).orders.length,1);await p.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();await select('演示权限','管理员 · 示例全范围');log('管理员只读操作阻止写入且保留输入');
 await go('PAGE-004');await p.getByLabel('编号、名称或关联对象',{exact:true}).fill('不存在的编号');await p.getByText('没有符合条件的记录',{exact:true}).waitFor();await click('清除筛选');log('列表筛选无匹配与恢复');
 await select('演示状态','请求失败');await p.getByRole('heading',{name:'数据读取失败',exact:true}).waitFor();await click('重试读取');await select('演示状态','版本冲突');await p.getByRole('button',{name:'查看差异并重新核对',exact:true}).waitFor();await click('查看差异并重新核对');log('请求失败及版本冲突恢复');
 await go('PAGE-043');await p.getByLabel('业务问题',{exact:true}).fill('帮我整理这单运输条件');await click('发送');await p.getByRole('button',{name:'核对条件并进入推演',exact:true}).waitFor();await click('核对条件并进入推演');await p.getByRole('heading',{name:'交能推演',exact:true}).waitFor();log('AI演示回答带依据并回业务工作区');
 await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(OUT,'simulation-result-light.png'),fullPage:true});
 await p.emulateMedia({colorScheme:'dark'});await p.waitForTimeout(200);await p.screenshot({path:path.join(OUT,'simulation-result-dark.png'),fullPage:true});assert.equal(await p.evaluate(()=>document.body.dataset.theme),'dark');log('系统深色主题');
 await p.emulateMedia({colorScheme:'light'});
 for(const width of [1280,1024,768,390,320]){await p.setViewportSize({width,height:900});await go(width<768?'PAGE-044':'PAGE-005');const dim=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(dim.scroll<=dim.client+2,JSON.stringify(dim));await p.screenshot({path:path.join(OUT,'responsive-'+width+'.png'),fullPage:true});log('响应式'+width,dim)}
 await p.setViewportSize({width:390,height:844});await go('PAGE-044');await click('历史任务');await p.getByRole('button').filter({has:p.getByRole('heading',{name:'RW-261013-01',exact:true})}).click();await p.screenshot({path:path.join(OUT,'driver-task-390.png'),fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));log('全部流程无JavaScript运行错误');
 fs.writeFileSync(path.join(OUT,'test-results.json'),JSON.stringify({status:'PASS',checks,errors,boundary:'仅独立原型模拟业务验收，不验证生产API/数据库/模型效果'},null,2));
}catch(e){console.error('FAIL',e.message);fs.writeFileSync(path.join(OUT,'test-results.json'),JSON.stringify({status:'FAIL',checks,errors,failure:e.message},null,2));await p.screenshot({path:path.join(OUT,'failure.png'),fullPage:true});process.exitCode=1}finally{await browser.close()}
