import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fixture} from './helpers.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {agentScene} from './agent-center-fixture.mjs';
const f=await fixture({agentModelFetch:async(u,o,c)=>{
  if(c.baseline)return Response.json({model:'adjustment-test-double',choices:[{message:{content:JSON.stringify({answer:'测试替身：参与车辆改为3辆，请核对后重算。',summary:'参与车辆改为3辆',patch:{vehicle_count:3},unsupported:[]})}}]});
  if(c.question==='TEST_FAIL')return new Response('{}',{status:503});
  if(c.question==='TEST_STOP')return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  return Response.json({model:'browser-agent-test-double',choices:[{message:{content:JSON.stringify({answer:'隔离测试替身：当前业务为仿真资料。已整理运输条件，请核对后进入正式工作区办理。',draft:c.question.includes('100吨')?{name:'煤炭运输需求',quantity:100,cargo:'煤炭',origin:'北区装载场',destination:'煤炭集运中心'}:{}})}}]});
}}),out='docs/development/changes/CR-023/',checks=[],errors=[];
fs.mkdirSync(out,{recursive:true});
const scene=await agentScene(f);
const tables=['demands','orders','tasks','trips','charging','vehicles','drivers','stations','devices','simulations','records'],before=tables.map(t=>f.db.prepare('SELECT * FROM '+t+' ORDER BY id').all());
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1680,height:1050}});page.setDefaultTimeout(14000);page.on('pageerror',e=>errors.push(e.message));
const center=()=>page.locator('.agent-center');
const log=name=>{checks.push({name,status:'PASS'});console.log('PASS '+name);};
async function question(text){await center().getByLabel('向交能AI提问',{exact:true}).fill(text);await center().getByRole('button',{name:'发送问题',exact:true}).click();}
async function waitTurn(n){await center().locator('.ac-turn').nth(n-1).waitFor();await center().getByRole('button',{name:'发送问题',exact:true}).waitFor();}
async function confirm(){await page.locator('.ant-modal:visible').getByRole('button',{name:/确\s*认/}).click();}
try{
  await page.goto(f.base);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'运营总览',exact:true}).first().waitFor();
  assert.equal(await page.locator('.agent-global-launcher').count(),1);assert.equal(await page.getByRole('button',{name:'智能助手',exact:true}).count(),0);
  await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();await center().getByRole('heading',{name:'AI智能体中心',exact:true}).waitFor();await center().locator('.ac-agent-card').last().waitFor();
  assert.equal(await center().locator('.ac-agent-card').count(),6);assert.equal(await page.locator('.app-shell[inert]').count(),1);await page.screenshot({path:out+'center-home.png',fullPage:true});log('PC右下唯一人物入口，辽粮式完整中心与六张业务卡片，无新增主菜单');
  await center().getByRole('button',{name:/运输需求.*整理运输条件/}).click();await center().getByRole('heading',{name:'运输需求',exact:true}).waitFor();
  await question('100吨煤炭从北区装载场到煤炭集运中心');await waitTurn(1);await center().getByText('运输条件',{exact:true}).waitFor();
  const c=f.db.prepare('SELECT * FROM agent_conversations').get();assert(c);assert.equal(f.db.prepare('SELECT count(*) n FROM agent_turns').get().n,1);
  await page.screenshot({path:out+'center-demand.png',fullPage:true});log('真实对话保存，DeepSeek接口测试替身返回可追溯结果和条件卡');
  await center().getByRole('button',{name:/查看依据/}).click();await page.locator('.ac-source-drawer').waitFor();await page.locator('.ac-source-reference').first().click();await page.locator('.ac-source-drawer').getByRole('button',{name:'打开业务页面',exact:true}).waitFor();await page.locator('.ac-source-drawer').getByRole('button',{name:'关闭',exact:true}).click();log('引用依据可以读取真实业务原记录及版本');
  await center().getByRole('button',{name:'填写需求草稿',exact:true}).click();await page.getByLabel('需求名称',{exact:true}).waitFor();assert.equal(await page.getByLabel('需求运量（吨）',{exact:true}).inputValue(),'100.000');
  await page.getByRole('button',{name:'关闭编辑',exact:true}).click();log('运输条件带入正式需求编辑面板，未点击保存不创建业务');
  await page.reload();await center().locator('.ac-turn').first().waitFor();assert.equal(await center().locator('.ac-turn').count(),1);log('刷新从SQLite恢复当前会话和历史，不丢失已完成分析');
  await center().getByRole('button',{name:/管理对话/}).first().click();await page.getByRole('menuitem',{name:'重命名',exact:true}).click();await page.getByLabel('对话名称',{exact:true}).fill('北区煤炭运输分析');await page.getByRole('button',{name:'保存名称',exact:true}).click();await center().locator('.ac-conversation-title').getByText('北区煤炭运输分析',{exact:true}).waitFor();log('历史对话可重命名并真实保存');
  await question('TEST_FAIL');await center().getByText('DeepSeek分析暂不可用，请重试',{exact:true}).waitFor();assert.equal(await center().getByLabel('向交能AI提问',{exact:true}).inputValue(),'TEST_FAIL');
  assert.equal(f.db.prepare('SELECT count(*) n FROM agent_turns').get().n,1);log('模型失败展示错误并保留输入，不写入伪成功轮次');
  await question('TEST_STOP');await center().getByRole('button',{name:'停止分析',exact:true}).waitFor();await center().getByRole('button',{name:'停止分析',exact:true}).click();await center().getByText('已停止分析，问题已保留',{exact:true}).waitFor();assert.equal(f.db.prepare('SELECT count(*) n FROM agent_turns').get().n,1);log('停止分析终止后端模型请求，保留输入与已有对话');
  await center().getByRole('button',{name:/管理对话/}).first().click();await page.getByRole('menuitem',{name:'归档对话',exact:true}).click();await center().getByRole('button',{name:'恢复对话',exact:true}).click();await center().getByRole('button',{name:'发送问题',exact:true}).waitFor();log('归档后只读，可恢复继续对话');
  for(const width of [1280,1680]){await page.setViewportSize({width,height:950});await center().getByRole('button',{name:'首页',exact:true}).click();await center().locator('.ac-agent-card').last().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await center().getByRole('button',{name:'返回业务系统',exact:true}).first().click();await page.getByRole('heading',{name:'运营总览',exact:true}).first().waitFor();
  for(const [route,title] of [['charging','补能调度'],['monitoring','运行监控'],['planning','场站规划'],['simulation','交能推演']]){
    await page.evaluate(route=>location.hash=route,route);await page.getByRole('heading',{name:title,exact:true}).first().waitFor();assert.equal(await page.locator('.agent-global-launcher').count(),1);assert.equal(await page.locator('.energy-ai-launcher,.scenario-ai-launcher').count(),0);
  }log('1280/1680布局正常，业务页原独立AI入口已统一，返回原页面可继续操作');
  await page.evaluate(()=>location.hash='simulation?order_id=O013');
  await page.getByLabel('参与车辆数',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('参与车辆数',{exact:true}).inputValue(),'2');
  await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();
  await center().getByRole('button',{name:/交能推演.*比较运力/}).click();
  await question('将参与车辆改为3辆');await waitTurn(1);
  await center().getByRole('button',{name:'核对调整条件',exact:true}).click();
  await page.getByLabel('参与车辆数',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="参与车辆数"]')?.value==='3');
  assert.equal(f.db.prepare('SELECT count(*) n FROM tasks').get().n,before[tables.indexOf('tasks')].length);
  log('已有推演由DeepSeek白名单生成调整预览，带回同一订单推演载入3辆且不修改原场景或生成任务');
  await page.getByLabel('参与车辆数',{exact:true}).fill('4');
  await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();
  await center().getByRole('heading',{name:'AI智能体中心',exact:true}).waitFor();
  await center().getByRole('button',{name:'返回业务系统',exact:true}).first().click();
  assert.equal(await page.getByLabel('参与车辆数',{exact:true}).inputValue(),'4');
  log('从推演打开中心再返回，原页面未保存条件完整保留');
  assert.deepEqual(tables.map(t=>f.db.prepare('SELECT * FROM '+t+' ORDER BY id').all()),before);assert.deepEqual(errors,[]);log('原业务数据逐行一致，0页面脚本错误');
  fs.writeFileSync(out+'browser-check.json',JSON.stringify({status:'PASS',checks,errors},null,2));
}catch(e){await page.screenshot({path:out+'browser-failure.png',fullPage:true});fs.writeFileSync(out+'browser-check.json',JSON.stringify({status:'FAIL',checks,errors,message:e.stack},null,2));throw e;}finally{await browser.close();await f.close();}
