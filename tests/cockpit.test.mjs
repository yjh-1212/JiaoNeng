import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ok} from './helpers.mjs';
import {insert} from '../server/db.mjs';
import {cockpit,chinaDate} from '../server/cockpit.mjs';
test('CR39 cockpit enforces admin read/owner boundaries and valid China dates',async()=>{
 const f=await fixture();try{
  assert.equal((await (await f.login('driver01')).req('/api/cockpit')).statusCode,403);
  assert.equal((await (await f.login('north')).req('/api/cockpit?owner=ORG-S')).statusCode,403);
  const north=ok(await (await f.login('north')).req('/api/cockpit'));
  assert.equal(north.resources.vehicles,f.db.prepare("SELECT count(*) n FROM vehicles WHERE owner_id='ORG-N'").get().n);
  assert.equal((await f.admin.req('/api/cockpit?date=2026-02-30')).statusCode,422);
  f.db.prepare("UPDATE users SET operations='[]' WHERE username='north'").run();assert.equal((await (await f.login('north')).req('/api/cockpit')).statusCode,403);
  assert.equal(chinaDate('2026-10-16T16:00:00Z'),'2026-10-17');assert.equal(chinaDate('2026-10-16T15:59:59Z'),'2026-10-16');
 }finally{await f.close();}
});
test('CR39 full-set task aggregation never truncates at 100 and reported quantity is not verified delivery',async()=>{
 const f=await fixture();try{
  const base=f.db.prepare("SELECT * FROM tasks WHERE owner_id='ORG-N' LIMIT 1").get();
  for(let n=0;n<125;n++)insert(f.db,'tasks',{...base,id:'CP-'+n,code:'CP-'+n,start_at:'2026-10-17T00:00:00Z',finish_at:'2026-10-17T15:59:00Z',status:'执行中',quantity_kg:30000,reported_kg:30000,verified_kg:0});
  const r=ok(await f.admin.req('/api/cockpit?date=2026-10-17&owner=ORG-N'));
  assert.equal(r.metrics.running_tasks,f.db.prepare("SELECT count(*) n FROM tasks WHERE owner_id='ORG-N' AND status IN('执行中','退回补充')").get().n);assert(r.metrics.running_tasks>=125);
  assert.equal(r.metrics.planned_tonnes,f.db.prepare("SELECT COALESCE(sum(quantity_kg),0)/1000 n FROM tasks WHERE owner_id='ORG-N' AND status NOT IN('已取消','余量已终止') AND substr(datetime(start_at,'+8 hours'),1,10)='2026-10-17'").get().n);
  assert.equal(r.execution.verified,f.db.prepare("SELECT COALESCE(sum(verified_kg),0)/1000 n FROM tasks WHERE owner_id='ORG-N' AND status NOT IN('已取消','余量已终止') AND substr(datetime(start_at,'+8 hours'),1,10)='2026-10-17'").get().n);
  assert(r.metrics.running_vehicles<r.metrics.running_tasks);assert(r.priority_tasks.length<=5);assert(!JSON.stringify(r).includes('password_hash'));assert(!JSON.stringify(r).includes('phone'));
 }finally{await f.close();}
});
test('CR39 stale/anchor coordinates are not presented as live positions; refresh is read-only',async()=>{
 const f=await fixture();try{
  const user={...f.db.prepare("SELECT * FROM users WHERE username='admin'").get(),role:'admin',operations:['*'],scopes:['ORG-N','ORG-S']};
  f.db.prepare('DELETE FROM telemetry').run();f.db.prepare("UPDATE vehicles SET data=json_set(data,'$.source_time',NULL)").run();
  const rowsBefore=f.db.prepare('SELECT count(*) n FROM records').get().n;
  let r=cockpit(f.db,user,{},Date.now());assert.equal(r.positions.length,0);assert.equal(r.resources.unlocated_vehicles,r.resources.vehicles);
  const v=f.db.prepare('SELECT * FROM vehicles LIMIT 1').get(),d=JSON.parse(v.data);f.db.prepare('UPDATE vehicles SET data=? WHERE id=?').run(JSON.stringify({...d,longitude:107.4,latitude:35.7,source_time:new Date().toISOString()}),v.id);
  r=cockpit(f.db,user);assert(r.positions.some(p=>p.id===v.id));const before=f.db.prepare('SELECT * FROM tasks ORDER BY id').all();cockpit(f.db,user);assert.deepEqual(f.db.prepare('SELECT * FROM tasks ORDER BY id').all(),before);assert.equal(f.db.prepare('SELECT count(*) n FROM records').get().n,rowsBefore);
 }finally{await f.close();}
});
