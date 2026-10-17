import test from 'node:test';
import assert from 'node:assert/strict';
import {database,transaction} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {scenarioDefaults,scopedStations,scenarioCommand,prepareScenario} from '../server/scenarios.mjs';
import {validateGoal} from '../server/scenario-goals.mjs';
import {qingyangPresets,corridorFacilities,qingyangFacilities} from '../shared/qingyang-planning.js';
import {fixture} from './helpers.mjs';
const user={id:'U-ADMIN',role:'admin',scopes:['ORG-N','ORG-S'],operations:['*']};
function setup(){const db=database(':memory:');seed(db);const defaults=scenarioDefaults(db,user,'manual','ORG-N'),p=qingyangPresets[1];const inputs={...defaults.inputs,origin:p.origin,destination:p.destination,goal:'deadline',resource_mode:'reference',route_strategy:36,quantity:300,vehicle_count:4,vehicle_limit:8,station_ids:['QP-ZN'],include_external:false,start_at:'2026-10-18T00:00:00Z',deadline:'2026-10-18T12:00:00Z'};return{db,inputs};}
test('CR34 planning facilities are scoped calculation inputs; no operational station or device is inserted',()=>{
 const {db,inputs}=setup();try{const before=db.prepare('SELECT count(*) n FROM stations').get().n;const list=scopedStations(db,user,inputs,'ORG-N');assert.equal(list[0].owner_id,'ORG-N');assert.equal(list[0].planning_only,true);assert.equal(list[0].occupied,0);assert.equal(list[0].source,'PLANNING_PARAMETER');assert.equal(db.prepare('SELECT count(*) n FROM stations').get().n,before);assert.throws(()=>scopedStations(db,{...user,scopes:['ORG-S']},inputs,'ORG-N'));assert.throws(()=>scopedStations(db,user,{...inputs,station_ids:['QP-UNKNOWN']},'ORG-N'));}finally{db.close();}
});
test('CR34 time interval is validated and routes preserve chosen strategy and per-vehicle replenishment nodes',async()=>{
 const {db,inputs}=setup();try{
  assert.throws(()=>validateGoal({...inputs,deadline:inputs.start_at}));assert.throws(()=>validateGoal({...inputs,route_strategy:999}));
  const s=transaction(db,()=>scenarioCommand(db,user,'scenario.save',null,{source_resource:'manual',source_id:'ORG-N',inputs}));
  const seen=[];const route=async(points,options)=>{seen.push(options.strategy);return{coordinates:[points[0],[(points[0][0]+points[1][0])/2+.001,(points[0][1]+points[1][1])/2],points[1]],distance_m:1000,source:'ISOLATED_TEST'};};
  const prepared=await prepareScenario(db,user,s.id,{expected_version:s.scenario.version},route);assert(seen.length===6&&seen.every(v=>v===36));assert.equal(prepared.result.calculation_stations[0].name,'正宁周家补能点');assert(prepared.result.candidates.some(c=>c.feasible));const c=prepared.result.candidates.find(c=>c.feasible);assert.equal(c.vehicles.reduce((n,v)=>n+v.quantity_kg,0),300000);assert(c.vehicles.every(v=>+new Date(v.start_at)>=+new Date(inputs.start_at)&&+new Date(v.finish_at)<=+new Date(inputs.deadline)));assert(c.vehicles.every(v=>v.nodes.some(n=>n.kind==='load')&&v.nodes.some(n=>n.kind==='unload')));
  const short=transaction(db,()=>scenarioCommand(db,user,'scenario.save',null,{source_resource:'manual',source_id:'ORG-N',inputs:{...inputs,deadline:'2026-10-18T00:10:00Z'}}));const limited=await prepareScenario(db,user,short.id,{expected_version:short.scenario.version},route);assert(!limited.result.candidates.some(c=>c.feasible));assert(limited.result.no_solution.remaining_kg>0);
 }finally{db.close();}
});
test('CR34 planning-only charging never becomes an operational task; failed generation leaves business rows unchanged',()=>{
 const {db,inputs}=setup();try{
  const saved=transaction(db,()=>scenarioCommand(db,user,'scenario.save',null,{source_resource:'manual',source_id:'ORG-N',inputs}));
  const row=db.prepare('SELECT data FROM records WHERE id=?').get(saved.id),data=JSON.parse(row.data);data.confirmed=true;data.selected='PLAN';data.result={candidates:[{id:'PLAN',feasible:true,input_overrides:{},vehicles:[{id:'SIM-01',nodes:[{kind:'charge',station_id:'QP-ZN'}]}]}]};db.prepare("UPDATE records SET status='已确认方案',data=? WHERE id=?").run(JSON.stringify(data),saved.id);
  const counts=()=>['tasks','orders','demands','charging'].map(t=>db.prepare('SELECT count(*) n FROM '+t).get().n),before=counts();assert.throws(()=>transaction(db,()=>scenarioCommand(db,user,'scenario.dispatch',saved.id,{expected_version:saved.scenario.version,create_execution:true,mappings:[]})),e=>e.code==='PLANNING_STATION_NOT_REGISTERED');assert.deepEqual(counts(),before);
 }finally{db.close();}
});
test('CR34 corridor filtering avoids distant facilities and presets keep distinct real location coordinates',()=>{
 const p=qingyangPresets[0],stations=corridorFacilities(p.origin,p.destination);assert(stations.some(s=>s.id==='QP-ZN'));assert(!stations.some(s=>s.id==='QP-GY'));assert.notDeepEqual(p.origin,p.destination);assert(qingyangFacilities.every(s=>s.price_curve.length===24&&s.power_kw>0&&s.slots>0));
});
test('CR34 same-yard charger uses a zero-distance stop without requesting or drawing an invented road',async()=>{
 const {db,inputs}=setup();try{const s=qingyangFacilities.find(s=>s.id==='QP-CQQ');const body={...inputs,destination:{name:'长庆桥作业点',lng:s.longitude,lat:s.latitude},station_ids:[s.id]};const saved=transaction(db,()=>scenarioCommand(db,user,'scenario.save',null,{source_resource:'manual',source_id:'ORG-N',inputs:body}));let calls=0;const prepared=await prepareScenario(db,user,saved.id,{expected_version:saved.scenario.version},async([a,z])=>{assert.notDeepEqual(a,z);calls++;return{coordinates:[a,[(a[0]+z[0])/2,(a[1]+z[1])/2],z],distance_m:1000};});assert.equal(calls,4);assert.equal(prepared.result.routes['QP-CQQ_destination'].distance_m,0);assert.equal(prepared.result.routes['destination_QP-CQQ'].source,'COLOCATED_STOP');}finally{db.close();}
});
test('CR34 current scene lookup ignores hidden historical scenes and restores newly saved operational calculations',async()=>{
 const f=await fixture();try{const p=qingyangPresets[1],i={...scenarioDefaults(f.db,user,'manual','ORG-N').inputs,origin:p.origin,destination:p.destination,goal:'deadline',resource_mode:'reference',vehicle_limit:8,station_ids:[]};const old=transaction(f.db,()=>scenarioCommand(f.db,user,'scenario.save',null,{source_resource:'manual',source_id:'ORG-N',inputs:i}));f.db.prepare("INSERT OR REPLACE INTO data_visibility VALUES('simulation-scenarios',?,'CALCULATION_ONLY')").run(old.id);
 const request=async(path,body)=>{const r=await fetch(f.base+path,{method:body?'POST':'GET',headers:{Cookie:f.admin.cookie,'X-Client-Portal':'pc','Content-Type':'application/json','X-CSRF-Token':f.admin.csrf,'Idempotency-Key':crypto.randomUUID()},body:body?JSON.stringify(body):undefined});return{status:r.status,...await r.json()};};const path='/api/scenarios/current?source_resource=manual&source_id=ORG-N';const hidden=await request(path);assert.equal(hidden.status,200);assert.equal(hidden.scenario,null);const saved=await request('/api/commands',{type:'scenario.save',payload:{source_resource:'manual',source_id:'ORG-N',inputs:i}});assert.equal(saved.status,200,saved.message);const current=await request(path);assert.equal(current.status,200,current.message);assert.equal(current.scenario.id,saved.id);
 }finally{await f.close();}
});

