import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {createApp} from '../server/app.mjs';
import http from 'node:http';

const demo = (f, body={}, headers={}) => fetch(f.base+'/api/auth/driver-demo', {method:'POST',headers:{'Content-Type':'application/json','X-Client-Portal':'driver',...headers},body:JSON.stringify(body)});
test('CR30 default driver is scoped, uses separate cookie and preserves PC session and CSRF',async()=>{
 const f=await fixture();
 try {
  const response=await demo(f),cookie=response.headers.get('set-cookie');
  assert.equal(response.status,200);assert.match(cookie,/^jn_driver_session=/);assert.match(cookie,/HttpOnly; SameSite=Strict/);
  const data=await response.json();assert.equal(data.user.role,'driver');
  const headers={Cookie:f.admin.cookie+'; '+cookie.split(';')[0], 'X-Client-Portal':'driver'};
  const driver=await (await fetch(f.base+'/api/auth/me',{headers})).json();
  assert.equal(driver.user.username,'driver05');assert.equal(driver.user.driver_id,'D005');
  const pc=await (await fetch(f.base+'/api/auth/me',{headers:{Cookie:headers.Cookie}})).json();assert.equal(pc.user.username,'admin');
  const boot=await (await fetch(f.base+'/api/bootstrap',{headers})).json();
  assert(boot.tasks.every(t=>t.driver_id==='D005'));
  assert.equal((await fetch(f.base+'/api/overview',{headers})).status,403);
  assert.equal((await fetch(f.base+'/api/auth/logout',{method:'POST',headers})).status,403);
  const logout=await fetch(f.base+'/api/auth/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':data.csrf}});
  assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/^jn_driver_session=;/);
  assert.equal((await f.admin.req('/api/auth/me')).statusCode,200);
  assert.equal((await fetch(f.base+'/api/auth/me',{headers})).status,401);
 }finally{await f.close();}
});
test('CR30 driver demo rejects selected identity, cross origin, nonlocal host and missing portal',async()=>{
 const f=await fixture();try{
  assert.equal((await demo(f,{username:'admin'})).status,400);
  assert.equal((await demo(f,{role:'admin'})).status,400);
  assert.equal((await demo(f,{}, {Origin:'https://external.invalid'})).status,403);
  const invalidHostStatus=await new Promise((resolve,reject)=>{const r=http.request(f.base+'/api/auth/driver-demo',{method:'POST',headers:{Host:'external.invalid','X-Client-Portal':'driver','Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end('{}');});
  assert.equal(invalidHostStatus,403);
  assert.equal((await demo(f,{}, {'X-Client-Portal':'pc'})).status,403);
  assert.equal((await fetch(f.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'driver05',password:'JiaoNeng2026!',portal:'pc'})})).status,403);
  const headers={Cookie:f.admin.cookie,'X-Client-Portal':'driver'};
  assert.equal((await fetch(f.base+'/api/auth/me',{headers})).status,401);
  // A driver portal must reject even an administrator token copied into its cookie.
  headers.Cookie=f.admin.cookie.replace('jn_session=','jn_driver_session=');
  assert.equal((await fetch(f.base+'/api/auth/me',{headers})).status,403);
 }finally{await f.close();}
});
test('CR30 unavailable default driver never falls back to administrator; demo may be disabled',async()=>{
 const f=await fixture();let other;
 try{
  f.db.prepare("UPDATE users SET enabled=0 WHERE username='driver05'").run();
  assert.equal((await demo(f)).status,503);
  f.db.prepare("UPDATE users SET enabled=1,role='admin' WHERE username='driver05'").run();
  assert.equal((await demo(f)).status,503);
  const {app}=createApp({db:f.db,seedData:false,config:{driverDemo:false}});
  other=app.listen(0,'127.0.0.1');await new Promise(r=>other.once('listening',r));
  const base='http://127.0.0.1:'+other.address().port;
  assert.equal((await demo({base})).status,403);
 }finally{if(other)await new Promise(r=>other.close(r));await f.close();}
});
