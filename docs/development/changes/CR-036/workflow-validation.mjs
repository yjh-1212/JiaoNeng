import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {database} from '../../../../server/db.mjs';
import {createApp} from '../../../../server/app.mjs';
import {loadConfig} from '../../../../server/config.mjs';
import {createRoadRouter} from '../../../../server/maps.mjs';
import {qingyangPresets} from '../../../../shared/qingyang-planning.js';
const out='docs/development/changes/CR-036/',manifest=JSON.parse(fs.readFileSync(out+'dataset-manifest.json','utf8')),roads=JSON.parse(fs.readFileSync(out+'road-cache.json','utf8')),config=loadConfig(),checks=[];
const RealDate=Date,replayClock=Math.max(...manifest.cases.map(c=>+new RealDate(c.finish_at)))+3600000;
class ReplayDate extends RealDate{constructor(...args){super(...(args.length?args:[replayClock]));}static now(){return replayClock;}}
globalThis.Date=ReplayDate;
const external=createRoadRouter({key:config.amapService||config.amapKey});
const mapFetch=async raw=>{const u=new URL(raw),parse=s=>s.split(',').map(Number),points=[parse(u.searchParams.get('origin')),...(u.searchParams.get('waypoints')?.split(';').map(parse)||[]),parse(u.searchParams.get('destination'))],strategy=Number(u.searchParams.get('strategy')||32),key=JSON.stringify({points,strategy});const r=roads[key]||await external(points,{strategy});roads[key]=r;fs.writeFileSync(out+'road-cache.json',JSON.stringify(roads));return Response.json({status:'1',route:{paths:[{distance:r.distance_m,cost:{duration:r.duration_s||1,tolls:r.tolls_yuan||0},steps:[{road_name:r.roads?.[0]||'道路',polyline:r.coordinates.map(p=>p.join(',')).join(';')}]}]}});};
const modelFetch=async(raw,o)=>{const b=JSON.parse(o.body),facts=JSON.parse(b.messages[1].content);return Response.json({model:'ISOLATED_WORKFLOW_REVIEW',choices:[{message:{content:JSON.stringify({summary:'已根据输入条件完成路线和车辆排程核对。',recommended_id:facts.candidates.find(c=>c.feasible)?.id||null,reasons:[],suggestions:[]})}}]});};
try{for(const c of manifest.cases){
 const file=out+'workflow-'+String(c.index).padStart(2,'0')+'.sqlite';fs.copyFileSync(out+'prepared.sqlite',file);const db=database(file),{app}=createApp({db,config:{...config,deepseekKey:'isolated-workflow-review',mapIntervalMs:0},mapFetch,modelFetch}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port,calls=[];
 try{
  async function login(username){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'JiaoNeng2026!'})}),j=await r.json();assert(r.ok,JSON.stringify(j));const cookie=r.headers.get('set-cookie').split(';')[0];return{cookie,csrf:j.csrf};}
  const admin=await login('admin');
  async function req(session,path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:session.cookie,'X-Client-Portal':'pc','Content-Type':'application/json','X-CSRF-Token':session.csrf,'Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined}),j=await r.json();if(!r.ok){fs.writeFileSync(out+'workflow-failure-details.json',JSON.stringify({case:c.index,error:j,devices:db.prepare('SELECT id,version,status,connection FROM devices').all(),simulations:db.prepare('SELECT id,data FROM simulations WHERE order_id=?').all(c.order_id).map(r=>({id:r.id,refs:JSON.parse(r.data).device_versions}))},null,2));}assert(r.ok,path+' '+JSON.stringify(j));return j;}
  const command=async(type,id,payload={},actor=admin)=>{const r=await req(actor,'/api/commands',{type,id,payload});calls.push(type);return r;},get=async(resource,id)=>req(admin,'/api/resources/'+resource+'/'+id);
  let order=await get('orders',c.order_id),scene=c.scene_id?await get('simulation-scenarios',c.scene_id):null;
  if(order.status==='草稿'){await command('order.confirm',order.id,{expected_version:order.version});order=await get('orders',order.id);}
  if(!c.task_ids.length){
   if(!scene){const defaults=await req(admin,'/api/scenarios/source/orders/'+order.id),p=qingyangPresets[[0,1,2,3][c.index-1]];const inputs={...defaults.inputs,name:c.name+'后续运输',goal:'deadline',resource_mode:'actual',vehicle_count:1,vehicle_limit:3,initial_soc:40,min_soc:20,target_soc:90,station_ids:p.stations.map(id=>manifest.stations.find(s=>s.reference_id===id).id),include_external:false,route_strategy:32};scene=(await command('scenario.save',null,{source_resource:'orders',source_id:order.id,inputs})).scenario;scene=(await command('scenario.run',scene.id,{expected_version:scene.version})).scenario;}
   const plan=scene.result.candidates.find(p=>p.id===scene.result.recommended_id);assert(plan?.feasible,'方案必须可行：'+c.name);scene=(await command('scenario.confirm',scene.id,{expected_version:scene.version,candidate_id:plan.id})).scenario;
   const used=new Set(),mappings=plan.vehicles.map(v=>{const ref=scene.resource_versions.find(r=>!used.has(r.id));assert(ref,'缺少匹配运力');used.add(ref.id);return{sim_vehicle_id:v.id,vehicle_id:ref.id};});scene=(await command('scenario.dispatch',scene.id,{expected_version:scene.version,mappings})).scenario;
  }
  const tasks=c.task_ids.length?c.task_ids:scene.generated_task_ids;
  const pending=[];for(const id of tasks){const t=await get('tasks',id);if(t.status==='待派发')pending.push({id,expected_version:t.version});}if(pending.length)await command('dispatch.batch',null,{items:pending});
  for(const id of tasks){
   let task=await get('tasks',id);if(task.status==='已完成')continue;
   if(task.status==='待派发')await command('dispatch.batch',null,{items:[{id,expected_version:task.version}]});task=await get('tasks',id);
   const username=db.prepare('SELECT username FROM users WHERE driver_id=?').get(task.driver_id).username,driver=await login(username);const b=await req(driver,'/api/bootstrap');assert(b.tasks.every(t=>t.driver_id===task.driver_id),'司机数据隔离');
   const step=async(type,payload={})=>command(type,id,{expected_version:(await get('tasks',id)).version,...payload},driver);
   if(task.status==='待接收')await step('task.accept');task=await get('tasks',id);if(task.status==='已接收')await step('task.start');task=await get('tasks',id);
   if(task.status==='执行中'){
    let total=task.reported_kg;
    while(total<task.quantity_kg){const row=db.prepare("SELECT * FROM trips WHERE task_id=? AND status NOT IN('已卸货','已核验')").get(id),trip=row?{trip_id:row.id}:await step('trip.create'),quantity=(row?.loaded_kg||Math.min(30000,task.quantity_kg-total))/1000;
     for(const [type,needed] of [['trip.load','待装货'],['trip.depart','已装货'],['trip.deliver','运输中']]){if(db.prepare('SELECT status FROM trips WHERE id=?').get(trip.trip_id).status===needed)await step(type,{trip_id:trip.trip_id,quantity,evidence:'运输业务量登记',event_id:randomUUID(),occurred_at:new Date().toISOString()});}total+=quantity*1000;
    }
    const plans=db.prepare("SELECT * FROM charging WHERE task_id=? AND status='已确认'").all(id);
    for(const p of plans){if(db.prepare("SELECT 1 FROM records WHERE resource='station-visits' AND json_extract(data,'$.plan_id')=?").get(p.id))continue;
     const arrival=await command('driver.arrive',null,{plan_id:p.id,expected_version:p.version,arrived_at:new Date(Date.now()-40*60000).toISOString(),evidence:'司机补能到站登记'},driver),visit=await get('station-visits',arrival.id),device=db.prepare("SELECT * FROM devices WHERE station_id=? AND status='空闲' AND connection='在线'").get(p.station_id);assert(device);
     await command('station.start',visit.id,{expected_version:visit.version,device_id:device.id,device_version:device.version,start_at:new Date(Date.now()-35*60000).toISOString(),release_at:new Date(Date.now()+10*60000).toISOString()});const current=await get('station-visits',visit.id),finish=await command('station.finish',visit.id,{expected_version:current.version,finish_at:new Date(Date.now()-60000).toISOString(),quantity_kwh:p.quantity_kwh,amount:p.quantity_kwh,included:'电费及服务费',evidence:'补能量业务登记'}),session=await get('sessions',finish.session_id);await command('session.verify',session.id,{expected_version:session.version,evidence:'补能记录核对'});assert.equal((await get('station-visits',visit.id)).status,'已完成');
    }
    await step('task.submit',{evidence:'逐车次交付量已整理'});
   }
   task=await get('tasks',id);if(task.status==='待核验')await command('task.verify',id,{expected_version:task.version,verified_quantity:task.reported_kg/1000,evidence:'逐车次报告量与任务量一致'});assert.equal((await get('tasks',id)).status,'已完成');
  }
  order=await get('orders',c.order_id);assert.equal(order.status,'已完成');const delivered=db.prepare('SELECT sum(verified_kg) n FROM tasks WHERE order_id=?').get(order.id).n;assert.equal(delivered,order.quantity_kg);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);checks.push({index:c.index,name:c.name,initial_stage:c.stage,result:'已完成',verified_tonnes:delivered/1000,api_calls:calls.length,commands:[...new Set(calls)],status:'PASS'});console.log('PASS '+c.index+'/10 '+c.name+'：'+c.stage+' → 已完成');
 }finally{await new Promise(r=>server.close(r));db.close();for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.unlinkSync(file+suffix);}
 }
 fs.writeFileSync(out+'workflow-verification.json',JSON.stringify({status:'PASS',manifest_checksum:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),cases:checks,clock_mode:'ISOLATED_TIME_ADVANCED_AFTER_ALL_DELIVERY_WINDOWS',map_source:'AMAP_CACHED_ROAD_GEOMETRY',model_service:'ISOLATED_TEST_DOUBLE',business_database_changed:false},null,2));
}finally{globalThis.Date=RealDate;}


