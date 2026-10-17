import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.mjs';
import {regionalCatalog,createRegionalPlanner} from '../server/regional-planner.mjs';
import {regionalInputs,regionalMetrics} from '../server/regional-engine.mjs';
import {installDataVisibility} from '../server/data-visibility.mjs';
import {createRoadRouter} from '../server/maps.mjs';
const op=async(f,path,body)=>{const r=await fetch(f.base+path,{method:body?'POST':'GET',headers:{Cookie:f.admin.cookie,'X-Client-Portal':'pc','Content-Type':'application/json','X-CSRF-Token':f.admin.csrf,...(body?{'Idempotency-Key':crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()};};
test('CR32 historical records hidden in operational lists, details, statistics, driver bootstrap and AI evidence; raw database preserved',async()=>{
 const f=await fixture();try{
  assert(f.db.prepare('SELECT count(*) n FROM tasks').get().n>0);
  for(const resource of ['demands','orders','vehicles','drivers','stations','devices','tasks','charging'])assert.equal((await op(f,'/api/resources/'+resource)).total,0,resource);
  assert.equal((await op(f,'/api/resources/orders/O013')).status,404);
  const b=await op(f,'/api/bootstrap');assert.equal(b.data_mode,'OPERATIONAL');assert.equal(b.orders.length,0);assert.equal(b.tasks.length,0);assert(!/仿真|模拟/.test(b.organizations[0].name));
  const overview=await op(f,'/api/overview');assert.equal(overview.items.length,0);assert.equal(overview.statistics.running,0);assert.equal(overview.todo_count,0);
  const old=await f.admin.req('/api/resources/orders');assert(old.total>0);
  const c=await op(f,'/api/agents/conversations',{capability:'DISPATCH',owner_id:'ORG-N',draft:{page_context:{page:'tasks',title:'运输任务',summary:'仅当前正式业务范围'}}});assert.equal(c.status,200);
  const r=await op(f,'/api/agents/conversations/'+c.id+'/messages',{question:'查询当前运输任务进度',request_key:crypto.randomUUID()});assert.equal(r.status,200);assert(r.turn.response.samples.every(s=>s.total===0));
 }finally{await f.close();}
});
test('CR32 new manual business records survive restart classification and do not expose historical data',async()=>{
 const f=await fixture();try{
  const r=await op(f,'/api/commands',{type:'demand.create',payload:{owner_id:'ORG-N',name:'兰州钢材运输',cargo:'钢材',quantity:100,origin:'甘肃省兰州市',destination:'青海省西宁市'}});assert.equal(r.status,200,r.message);
  const row=f.db.prepare('SELECT * FROM demands WHERE id=?').get(r.id);assert.equal(row.source,'MANUAL_ENTRY');
  assert.equal((await op(f,'/api/resources/demands')).total,1);
  installDataVisibility(f.db);assert.equal((await op(f,'/api/resources/demands')).total,1);
  assert.equal((await op(f,'/api/resources/demands/'+r.id)).name,'兰州钢材运输');
  const mutate=await op(f,'/api/commands',{type:'demand.confirm',id:'DM001',payload:{expected_version:1}});assert.equal(mutate.status,404);
 }finally{await f.close();}
});
test('CR32 regional computation conserves freight, reduces work with extra trucks and expresses energy requirements without invented queues',()=>{
 const base=regionalCatalog().defaults,i=regionalInputs({...base,quantity:301,cargo:'煤炭',origin:{name:'兰州',lng:103.8,lat:36.1},destination:{name:'西宁',lng:101.8,lat:36.6},start_at:'2026-10-18T00:00:00Z',deadline:'2026-10-22T00:00:00Z'});
 const route={coordinates:[[103.8,36.1],[102.8,36.3],[101.8,36.6]],distance_m:400000,duration_s:18000};
 const a=regionalMetrics({...i,vehicle_count:1},route,route),b=regionalMetrics({...i,vehicle_count:10},route,route);
 assert.equal(a.delivered_kg,301000);assert.equal(a.trip_count,11);assert.equal(a.last_trip_tonnes,1);assert(a.duration_minutes>b.duration_minutes);assert(a.total_energy_kwh>b.total_energy_kwh);assert.equal(a.queue_minutes,null);assert(a.planned_stops.length>0);assert.equal(a.dispatch_ready,false);assert.match(a.status,/待核验/);
 assert.throws(()=>regionalInputs({...i,initial_soc:10,min_soc:20}));assert.throws(()=>regionalInputs({...i,quantity:-1}));
});
test('CR32 real road strategies use separate cache keys, accept multi-stop geometry and never invent alternate roads',async()=>{
 const seen=[];const route=createRoadRouter({key:'isolated-test',minIntervalMs:0,fetcher:async url=>{seen.push(new URL(url));return Response.json({status:'1',route:{paths:[{distance:'200000',cost:{duration:'9000',tolls:'90'},steps:[{road_name:'G6京藏高速',polyline:'103.8,36.1;102.8,36.3;101.8,36.6'}]}]}});}});
 const points=[[103.8,36.1],[103,36.2],[102,36.4],[101.8,36.6]];
 await route(points,{strategy:32});await route(points,{strategy:34});await route(points,{strategy:32});
 assert.equal(seen.length,2);assert.equal(seen[0].searchParams.get('waypoints'),'103.000000,36.200000;102.000000,36.400000');assert.equal(seen[1].searchParams.get('strategy'),'34');
});
test('CR32 chosen public charging location becomes an actual route waypoint; calculation never creates orders or dispatches',async()=>{
 const f=await fixture();try{
  const calls=[],user=(await f.admin.req('/api/auth/me')).user,original=f.db.prepare('SELECT count(*) n FROM orders').get().n;
  const planner=createRegionalPlanner({db:f.db,key:'ISOLATED_TEST',fetcher:async()=>Response.json({status:'1',pois:[{id:'POI-ONLY-TEST',name:'充电站（接口隔离用）',location:'102.8,36.3',address:'隔离地点'}]}),roadRoute:async(points,options)=>{calls.push({points,options});return{coordinates:[points[0],[102.8,36.3],points.at(-1)],distance_m:240000,duration_s:15000,roads:['G6'],source:'TEST_DOUBLE'};}});
  const i={...regionalCatalog().defaults,quantity:300,cargo:'钢材',origin:{name:'兰州',lng:103.8,lat:36.1},destination:{name:'西宁',lng:101.8,lat:36.6},start_at:'2026-10-18T00:00:00Z',deadline:'2026-10-21T00:00:00Z'};
  const first=await planner.solve(user,i);assert.equal(first.facilities.length,1);assert.equal(first.candidates.length,1,'identical routes must be deduplicated');
  calls.length=0;const second=await planner.solve(user,{...i,station_ids:['POI-ONLY-TEST']});assert(calls.every(c=>c.points.length===3));assert.deepEqual(calls[0].points[1],[102.8,36.3]);assert.equal(second.candidates[0].metrics.charging_stops.length,1);assert.equal(f.db.prepare('SELECT count(*) n FROM orders').get().n,original);
  await assert.rejects(planner.solve(user,{...i,station_ids:['unknown']}),/失效/);
 }finally{await f.close();}
});
