import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {database} from '../../../../server/db.mjs';
import {createApp} from '../../../../server/app.mjs';
import {loadConfig} from '../../../../server/config.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const out='docs/development/changes/CR-023/',config=loadConfig(),db=database(':memory:');
assert(config.deepseekKey,'Real DeepSeek config required');
const {app}=createApp({db,config}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
const tables=['demands','orders','tasks','trips','charging','vehicles','drivers','stations','devices','simulations','records'];
const before=tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY id').all());
try{
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'打开交能AI智能体中心',exact:true}).click();
  await page.locator('.ac-agent-card').last().waitFor();await page.screenshot({path:out+'live-center-home.png'});
  await page.getByRole('button',{name:/运输需求.*整理运输条件/}).click();
  await page.getByLabel('向交能AI提问',{exact:true}).fill('我有100吨煤炭，从北区装载场运到煤炭集运中心。帮我整理需求条件，未知时间先保留空白。');
  const response=page.waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST',{timeout:60000});
  await page.getByRole('button',{name:'发送问题',exact:true}).click();
  const res=await response,body=await res.json();assert(res.ok(),body.message);
  const result=body.turn.response;assert.equal(result.draft.quantity,100);assert.equal(result.draft.cargo,'煤炭');assert(!result.draft.start_at);assert(!result.actions_allowed);
  assert.equal(result.draft.origin.lng,null);assert(result.refs.length>0);assert(result.answer.length>20);
  await page.locator('.ac-turn').first().waitFor();await page.getByRole('button',{name:'带入交能推演',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:out+'live-center-answer.png'});
  assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY id').all()),before);assert.deepEqual(errors,[]);
  const report={status:'PASS',at:new Date().toISOString(),provider:'DeepSeek official API',model:result.model,live_model_requests:1,isolated_simulated_database:true,persisted_turns:db.prepare('SELECT count(*) n FROM agent_turns').get().n,draft_quantity:100,unknown_time_unfilled:true,model_coordinates_absent:true,authorized_source_count:result.refs.length,business_rows_unchanged:true,page_errors:errors};
  fs.writeFileSync(out+'live-ai-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page.screenshot({path:out+'live-ai-failure.png'});fs.writeFileSync(out+'live-ai-review.json',JSON.stringify({status:'FAIL',message:e.message,errors},null,2));throw e;}
finally{await browser.close();await new Promise(r=>server.close(r));db.close();}
