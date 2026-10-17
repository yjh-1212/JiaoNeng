import {insert,transaction,writeContext,uid,now,unpack} from './db.mjs';
import {get} from './repository.mjs';
import {operationsCommand} from './operations.mjs';
import {transportCommand} from './transport.mjs';
import {energyCommand,guardEnergyMutation,afterEnergyMutation} from './energy-commands.mjs';
import {scenarioDefaults,scenarioCommand,prepareScenario} from './scenarios.mjs';
import {auditSuccess} from './auditing.mjs';
import {qingyangPresets,qingyangFacilities,qingyangSources} from '../shared/qingyang-planning.js';
import {LOCAL_PASSWORD} from './seed.mjs';

export const DATASET_KEY='business-dataset-v1';
const sourceKind='GENERATED_BUSINESS_DATA';
const iso=n=>new Date(n).toISOString();
export const businessCases=[
 {route:0,name:'核桃峪煤炭日发运',quantity:300,stage:'草稿',hours:12,vehicle:0},
 {route:1,name:'新庄煤炭集运',quantity:180,stage:'待推演',hours:12,vehicle:1},
 {route:2,name:'长庆桥泾川转运',quantity:90,stage:'待推演',hours:12,vehicle:2},
 {route:3,name:'西峰彬州骨料运输',quantity:60,stage:'已有方案',hours:12,vehicle:0},
 {route:1,name:'新庄煤炭上午班',quantity:90,stage:'待派发',hours:12,vehicle:2},
 {route:1,name:'新庄长庆桥下午班',quantity:90,stage:'待接收',hours:12,vehicle:4},
 {route:0,name:'核桃峪正宁电煤',quantity:120,stage:'已接收',hours:10,vehicle:5},
 {route:1,name:'新庄煤炭当班运输',quantity:60,stage:'执行中',hours:10,vehicle:6,past:true},
 {route:0,name:'核桃峪煤炭交付核验',quantity:60,stage:'待核验',hours:10,vehicle:7,past:true},
 {route:1,name:'新庄集运交付完成',quantity:60,stage:'已完成',hours:10,vehicle:8,past:true},
];
export function datasetActor(db,username='admin'){
 const r=db.prepare('SELECT * FROM users WHERE username=?').get(username);
 if(!r)throw new Error('业务账号不存在：'+username);
 return{...r,operations:JSON.parse(r.operations),scopes:db.prepare('SELECT owner_id FROM user_scopes WHERE user_id=?').all(r.id).map(x=>x.owner_id),data_view:'operational'};
}
export function runDatasetCommand(db,user,type,id=null,body={},prepared){
 return writeContext.run('operational',()=>transaction(db,()=>{
  guardEnergyMutation(db,user,type,id,body);
  const output=type.startsWith('scenario.')?scenarioCommand(db,user,type,id,body,prepared):(energyCommand(db,user,type,id,body)||transportCommand(db,user,type,id,body)||operationsCommand(db,user,type,id,body));
  if(!output)throw new Error('未支持的业务动作：'+type);
  afterEnergyMutation(db,user,type,id);
  auditSuccess(db,user,type,id,body,output,uid('DATASET-CMD'));
  return output;
 }));
}
function enrich(db,table,id,extra){const r=db.prepare('SELECT data FROM '+table+' WHERE id=?').get(id);db.prepare('UPDATE '+table+' SET data=? WHERE id=?').run(JSON.stringify({...JSON.parse(r.data),...extra}),id);}
export async function buildBusinessDataset(db,roadRoute,{clock=Date.now(),onProgress=()=>{}}={}){
 const existing=db.prepare('SELECT value FROM data_view_state WHERE key=?').get(DATASET_KEY);if(existing)return JSON.parse(existing.value);
 const admin=datasetActor(db),owner=admin.scopes[0],ownerSouth=admin.scopes[1]||owner,created={},snapshot={};
 db.prepare("UPDATE organizations SET name=replace(name,'（仿真）',''),source='ESTIMATED' WHERE id IN (?,?)").run(owner,ownerSouth);
 const tables=['drivers','vehicles','stations','devices','demands','orders','records','simulations','tasks','charging','sessions','trips','events','costs','alerts','users'];
 for(const t of tables)snapshot[t]=new Set(db.prepare('SELECT id FROM '+t).all().map(r=>r.id));
 const cmd=(type,id,body={},actor=admin,prepared)=>runDatasetCommand(db,actor,type,id,body,prepared);
 const names=['徐建国','王海军','张志强','刘建平','李建军','赵永强','陈海涛','杨建华','马志伟','周国强','孙建平','吴海峰','郑国栋','冯建军','胡志强'],drivers=[],vehicles=[];
 const window={available_window:'00:00—24:00',available_windows:[{start_at:iso(clock-3*86400000),finish_at:iso(clock+30*86400000)}]};
 for(let n=0;n<15;n++){
  const owner_id=n<12?owner:ownerSouth;
  const d=cmd('resource.create',null,{resource:'drivers',owner_id,code:'QY-SJ-'+String(n+1).padStart(3,'0'),name:names[n],license:'A2',available_window:window.available_window,evidence:'运输作业人员资料配置'});drivers.push(d.id);
  cmd('resource.edit',d.id,{resource:'drivers',expected_version:1,name:names[n],status:'可用',license:'A2',available_window:window.available_window,evidence:'排班及业务条件配置'});enrich(db,'drivers',d.id,{...window,phone:'待登记'});
  const v=cmd('resource.create',null,{resource:'vehicles',owner_id,code:'甘M·'+String(10001+n)+'D',name:'电动牵引车 '+String(n+1).padStart(2,'0'),driver_id:d.id,capacity_kwh:350,payload_tonnes:30,soc:88,energy_per_km:1.58,compatibility:'DC-GB/T',available_window:window.available_window,evidence:'30吨载重、350kWh电池配置'});vehicles.push(v.id);
  cmd('resource.edit',v.id,{resource:'vehicles',expected_version:1,status:'可用',evidence:'核对车辆与司机绑定'});const anchor=qingyangFacilities[n%qingyangFacilities.length];enrich(db,'vehicles',v.id,{...window,empty_energy_per_km:1.15,location_status:'待接入',longitude:anchor.longitude,latitude:anchor.latitude,source_time:null,location_source:'PLANNING_ANCHOR',registration_verified:false});
 }
 const userMapping=[];
 for(let n=1;n<=12;n++){const old=db.prepare('SELECT id,driver_id,name FROM users WHERE username=? AND role=\'driver\'').get('driver'+String(n).padStart(2,'0'));if(!old)continue;const index=n<=9?n-1:n+2;db.prepare('UPDATE users SET driver_id=?,name=?,version=version+1 WHERE id=?').run(drivers[index],names[index],old.id);userMapping.push({user_id:old.id,username:'driver'+String(n).padStart(2,'0'),old_driver_id:old.driver_id,new_driver_id:drivers[index]});}
 for(let n=0;n<drivers.length;n++)if(!db.prepare('SELECT 1 FROM users WHERE driver_id=? AND enabled=1').get(drivers[n]))cmd('user.create',null,{username:'qingyang'+String(n+1).padStart(2,'0'),name:names[n],role:'driver',driver_id:drivers[n],scopes:[n<12?owner:ownerSouth],password:LOCAL_PASSWORD});
 const stations=[];
 for(const p of qingyangFacilities){
  const r=cmd('resource.create',null,{resource:'stations',owner_id:owner,name:p.name,code:'QY-CZ-'+String(stations.length+1).padStart(3,'0'),mode:'充电',power_kw:p.power_kw*3,longitude:p.longitude,latitude:p.latitude,compatibility:'DC-GB/T',available_window:'00:00—24:00',evidence:'区域货运补能能力配置'});stations.push({reference_id:p.id,id:r.id});
  cmd('resource.edit',r.id,{resource:'stations',expected_version:1,status:'运营中',price_curve:p.price_curve,evidence:'业务工况及分时电价配置'});enrich(db,'stations',r.id,{city:p.city,service_minutes:45,planning_only:false,external_verification:'PENDING',remote_connected:false,source_note:p.source_note});
  for(let k=1;k<=3;k++)writeContext.run('operational',()=>insert(db,'devices',{id:uid('QY-GUN'),code:'QY-GW-'+String(stations.length).padStart(2,'0')+'-'+k,name:p.name+'工位'+k,owner_id:owner,station_id:r.id,status:'空闲',connection:'在线',power_kw:p.power_kw,source:'ESTIMATED',data:{compatibility:'DC-GB/T',remote_connected:false,operational_source:'场站作业能力配置'}}));
 }
 const cases=[];
 // Finish historical work first so pending dispatches capture current device versions.
 for(const index of [9,8,7,6,5,4,3,2,1,0]){
  const c=businessCases[index],p=qingyangPresets[c.route],start=c.past?clock-9*3600000:clock+30*60000,finish=start+c.hours*3600000;
  const direct=await roadRoute([[p.origin.lng,p.origin.lat],[p.destination.lng,p.destination.lat]]);
  const d=cmd('demand.create',null,{owner_id:owner,name:c.name+'需求',cargo:p.cargo,quantity:c.quantity,origin:p.origin.name,destination:p.destination.name});cmd('demand.confirm',d.id,{expected_version:1});enrich(db,'demands',d.id,{origin_coords:[p.origin.lng,p.origin.lat],destination_coords:[p.destination.lng,p.destination.lat]});
  const o=cmd('order.create',null,{demand_id:d.id,name:c.name,cargo:p.cargo,quantity:c.quantity,origin:p.origin.name,destination:p.destination.name,origin_coords:[p.origin.lng,p.origin.lat],destination_coords:[p.destination.lng,p.destination.lat],distance_km:direct.distance_m/1000,start_at:iso(start),finish_at:iso(finish)});
  db.prepare('UPDATE orders SET code=? WHERE id=?').run('DD-QY-'+String(index+1).padStart(3,'0'),o.id);enrich(db,'orders',o.id,{road_source:direct.source,road_fetched_at:direct.fetched_at});
  const entry={index:index+1,name:c.name,demand_id:d.id,order_id:o.id,stage:c.stage,quantity:c.quantity,origin:p.origin,destination:p.destination,start_at:iso(start),finish_at:iso(finish),task_ids:[]};
  if(index>0)cmd('order.confirm',o.id,{expected_version:1});
  if(index>=3){
   const ids=p.stations.map(ref=>stations.find(s=>s.reference_id===ref)?.id).filter(Boolean),defaults=scenarioDefaults(db,admin,'orders',o.id).inputs;
   const i={...defaults,name:c.name+'运输方案',quantity:c.quantity,cargo:p.cargo,origin:p.origin,destination:p.destination,goal:'deadline',resource_mode:'actual',vehicle_count:1,vehicle_limit:index===3?2:1,station_ids:ids,payload:30,capacity:350,initial_soc:40,min_soc:20,target_soc:90,route_strategy:32,include_external:false,max_driver_hours:12,loading_minutes:15,unloading_minutes:20,start_at:iso(start),deadline:iso(finish)};
   let s=cmd('scenario.save',null,{source_resource:'orders',source_id:o.id,inputs:i}).scenario;
   const prepared=await prepareScenario(db,admin,s.id,{expected_version:s.version},roadRoute);s=cmd('scenario.run',s.id,{expected_version:s.version},admin,prepared).scenario;
   const plan=s.result.candidates.find(x=>x.id===s.result.recommended_id);if(!plan?.feasible)throw new Error(c.name+'：无可行排程 '+JSON.stringify(s.result.no_solution));entry.scene_id=s.id;entry.candidate_id=plan.id;
   if(index>=4){
    s=cmd('scenario.confirm',s.id,{expected_version:s.version,candidate_id:plan.id}).scenario;
    const mappings=plan.vehicles.map((v,n)=>({sim_vehicle_id:v.id,vehicle_id:vehicles[c.vehicle+n]}));
    s=cmd('scenario.dispatch',s.id,{expected_version:s.version,mappings}).scenario;entry.task_ids=s.generated_task_ids;
    if(index>=5){cmd('dispatch.batch',null,{items:entry.task_ids.map(id=>({id,expected_version:get(db,admin,'tasks',id).version}))});}
    if(index>=6){for(const id of entry.task_ids){const t=get(db,admin,'tasks',id),username=db.prepare('SELECT username FROM users WHERE driver_id=?').get(t.driver_id).username,driver=datasetActor(db,username);cmd('task.accept',id,{expected_version:t.version},driver);}}
    if(index>=7){for(const id of entry.task_ids){const t=get(db,admin,'tasks',id),username=db.prepare('SELECT username FROM users WHERE driver_id=?').get(t.driver_id).username,driver=datasetActor(db,username);cmd('task.start',id,{expected_version:t.version},driver);}}
    if(index>=8)for(const id of entry.task_ids)await completeDatasetTask(db,id,{verify:index===9});
    if(index===7){const id=entry.task_ids[0],t=get(db,admin,'tasks',id),driver=datasetActor(db,db.prepare('SELECT username FROM users WHERE driver_id=?').get(t.driver_id).username);const r=cmd('trip.create',id,{expected_version:t.version},driver);for(const type of ['trip.load','trip.depart'])cmd(type,id,{expected_version:get(db,admin,'tasks',id).version,trip_id:r.trip_id,quantity:30,evidence:'当班运输装载登记',event_id:uid('QY-EVENT'),occurred_at:iso(clock-30*60000),late_reason:'按当班作业记录补录'},driver);const p=db.prepare("SELECT id FROM charging WHERE task_id=? AND status='已确认' ORDER BY arrival_at LIMIT 1").get(id);if(p)cmd('driver.energy-alert',null,{plan_id:p.id,reason:'到站前需确认可用工位',evidence:'司机补能需求反馈登记'},driver);}
   }
  }
  cases.push(entry);onProgress('已生成 '+cases.length+'/10：'+c.name+'（'+c.stage+'）');
 }
 cases.sort((a,b)=>a.index-b.index);
 for(const table of tables){created[table]=db.prepare('SELECT id FROM '+table).all().map(r=>r.id).filter(id=>!snapshot[table].has(id));const cols=db.prepare('PRAGMA table_info('+table+')').all().map(r=>r.name);for(const id of created[table]){if(cols.includes('source'))db.prepare('UPDATE '+table+' SET source=? WHERE id=?').run('ESTIMATED',id);if(cols.includes('data'))enrich(db,table,id,{dataset_id:DATASET_KEY,data_quality:sourceKind,external_verification:'PENDING',generated_at:iso(clock)});}}
 const manifest={key:DATASET_KEY,created_at:iso(clock),source_kind:sourceKind,source_note:'运输业务条件按载重、道路与作业规则生成；不是外部真实交易或设备遥测。',cases,drivers,vehicles,stations,created,user_mapping:userMapping,public_sources:qingyangSources};
 db.prepare('INSERT INTO data_view_state(key,value) VALUES(?,?)').run(DATASET_KEY,JSON.stringify(manifest));return manifest;
}

export async function completeDatasetTask(db,id,{verify=true}={}){
 const admin=datasetActor(db),initial=get(db,admin,'tasks',id),driver=datasetActor(db,db.prepare('SELECT username FROM users WHERE driver_id=?').get(initial.driver_id).username),cmd=(type,target,body={},actor=admin)=>runDatasetCommand(db,actor,type,target,body);
 let t=get(db,admin,'tasks',id);
 if(t.status==='待派发')cmd('dispatch.batch',null,{items:[{id,expected_version:t.version}]});
 t=get(db,admin,'tasks',id);if(t.status==='待接收')cmd('task.accept',id,{expected_version:t.version},driver);
 t=get(db,admin,'tasks',id);if(t.status==='已接收')cmd('task.start',id,{expected_version:t.version},driver);
 t=get(db,admin,'tasks',id);if(t.status==='已完成')return t;
 const step=(type,body)=>cmd(type,id,{expected_version:get(db,admin,'tasks',id).version,...body},driver);
 if(['执行中','退回补充'].includes(t.status)){
  const nodes=t.plan.nodes,loads=nodes.filter(n=>n.kind==='装载'),unloads=nodes.filter(n=>n.kind==='卸载');
  let done=db.prepare('SELECT COALESCE(sum(delivered_kg),0) n FROM trips WHERE task_id=?').get(id).n;
  for(let n=db.prepare("SELECT count(*) n FROM trips WHERE task_id=? AND status IN('已卸货','已核验')").get(id).n;done<t.quantity_kg;n++){
   let open=db.prepare("SELECT * FROM trips WHERE task_id=? AND status NOT IN('已卸货','已核验') ORDER BY occurred_at LIMIT 1").get(id);
   const quantity=(open?.loaded_kg||Math.min(30000,t.quantity_kg-done))/1000,r=open?{trip_id:open.id}:step('trip.create',{}),load=loads[n],unload=unloads[n];
   const occurs=value=>iso(Math.min(Date.now()-1000,+new Date(value||Date.now()-2000)));
   for(const type of ['trip.load','trip.depart','trip.deliver']){const status=db.prepare('SELECT status FROM trips WHERE id=?').get(r.trip_id).status;if(type==='trip.load'&&status!=='待装货'||type==='trip.depart'&&status!=='已装货'||type==='trip.deliver'&&status!=='运输中')continue;step(type,{trip_id:r.trip_id,quantity,evidence:type==='trip.deliver'?'卸货量业务登记':'装载量业务登记',event_id:uid('QY-EVENT'),occurred_at:occurs(type==='trip.deliver'?unload?.finish_at:load?.finish_at),late_reason:'按作业过程整理登记'});}
   done+=quantity*1000;
  }
  const plans=db.prepare('SELECT * FROM charging WHERE task_id=? AND status=\'已确认\'').all(id).map(unpack);
  for(const p of plans){if(db.prepare("SELECT 1 FROM records WHERE resource='station-visits' AND json_extract(data,'$.plan_id')=?").get(p.id))continue;
   const event=t.plan.charging_events.find(e=>e.station_id===p.station_id&&e.arrival_at===p.arrival_at)||t.plan.charging_events[0],end=Math.min(Date.now()-60000,+new Date(event?.finish_at||Date.now()-60000)),begin=end-Math.max(5,Math.min(90,event?(+new Date(event.finish_at)-+new Date(event.start_at))/60000:30))*60000;
   const arrive=cmd('driver.arrive',null,{plan_id:p.id,expected_version:p.version,arrived_at:iso(begin-2*60000),evidence:'运输补能到站登记'},driver);
   let visit=get(db,admin,'station-visits',arrive.id);const device=db.prepare("SELECT id FROM devices WHERE station_id=? AND status='空闲' AND connection='在线'").get(p.station_id),dr=get(db,admin,'devices',device.id);
   cmd('station.start',visit.id,{expected_version:visit.version,device_id:dr.id,device_version:dr.version,start_at:iso(begin),release_at:iso(end+60000)});
   visit=get(db,admin,'station-visits',visit.id);const r=cmd('station.finish',visit.id,{expected_version:visit.version,finish_at:iso(end),quantity_kwh:p.quantity_kwh,amount:(event?.amount_cents||Math.round(p.quantity_kwh*100))/100,included:'电费及服务费',evidence:'补能量与费用业务登记'});const session=get(db,admin,'sessions',r.session_id);cmd('session.verify',r.session_id,{expected_version:session.version,evidence:'补能作业量与费用核对'});
  }
  step('task.submit',{evidence:'逐车次装卸量已整理完成'});
 }
 t=get(db,admin,'tasks',id);if(verify&&t.status==='待核验')cmd('task.verify',id,{expected_version:t.version,verified_quantity:t.reported_kg/1000,evidence:'逐车次装卸量核对一致'});
 return get(db,admin,'tasks',id);
}
