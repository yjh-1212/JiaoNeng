import {transaction,writeContext,now} from './db.mjs';
import {datasetActor,DATASET_KEY} from './business-dataset.mjs';
import {operationsCommand} from './operations.mjs';
import {get} from './repository.mjs';
import {planningBusiness,planningCommand,planningDetail,planningHandoff} from './planning-workspace.mjs';
import {defaults} from './planning-engine.mjs';
import {auditSuccess} from './auditing.mjs';

export const PLANNING_DATASET_KEY='planning-business-dataset-v1';
export function buildPlanningDataset(db){
 const installed=db.prepare('SELECT value FROM data_view_state WHERE key=?').get(PLANNING_DATASET_KEY);
 if(installed)return JSON.parse(installed.value);
 const row=db.prepare('SELECT value FROM data_view_state WHERE key=?').get(DATASET_KEY);
 if(!row)throw new Error('请先安装运输业务资料');
 const business=JSON.parse(row.value),admin=datasetActor(db),owner=admin.scopes[0];
 const date=n=>new Date(n+8*3600000).toISOString().slice(0,10),starts=business.cases.map(c=>+new Date(c.start_at)),ends=business.cases.map(c=>+new Date(c.finish_at)),start=date(Math.min(...starts)),finish=date(Math.max(...ends));
 return writeContext.run('operational',()=>transaction(db,()=>{
  const created=[],candidates=business.stations.map(({id})=>{
   const s=get(db,admin,'stations',id),r=runResource({resource:'candidates',name:s.name+'布局评估点',owner_id:owner,station_id:id,longitude:s.longitude,latitude:s.latitude,evidence:'区域运输业务补能布局评估，场站坐标关联现有档案；接电与用地条件需现场核实'});
   return{candidate_id:r.id,station_id:id,supply_kw:null,other_load_kw:0,land_verified:false,grid_verified:false,access_verified:false};
  });
  function provenance(id){const r=db.prepare('SELECT data FROM records WHERE id=?').get(id);db.prepare('UPDATE records SET source=?,data=? WHERE id=?').run('ESTIMATED',JSON.stringify({...JSON.parse(r.data),dataset_id:PLANNING_DATASET_KEY,data_quality:'GENERATED_BUSINESS_DATA',external_verification:'PENDING',generated_at:now()}),id);created.push(id);}
  function runResource(body){const r=operationsCommand(db,admin,'resource.create',null,body);auditSuccess(db,admin,'resource.create',null,body,r,'PLANNING-DATASET-'+r.id);provenance(r.id);return r;}
  function cmd(type,id,body){const r=planningCommand(db,admin,type,id,body);auditSuccess(db,admin,type,id,body,r,'PLANNING-DATASET-'+r.id);provenance(r.id);return r;}
  const projects=[];
  for(const config of [{name:'庆阳煤运当班保障规划',finish_date:start,hours:12},{name:'庆阳及周边跨日运力与补能规划',finish_date:finish,hours:16}]){
   const query={owner_id:owner,start_date:start,finish_date:config.finish_date},snapshot=planningBusiness(db,admin,query);
   if(!snapshot.refs.length||snapshot.daily_quantity<=0)throw new Error('规划基准期没有可引用的有效运输业务');
   const quantity=snapshot.corridors.reduce((s,l)=>s+l.quantity,0),distance=snapshot.corridors.reduce((s,l)=>s+l.quantity*l.distance_km,0)/quantity;
   const conditions={...defaults,daily_quantity:snapshot.daily_quantity,phase_one_quantity:Math.round(snapshot.daily_quantity*.6*1000)/1000,distance_km:Math.round(distance*1000)/1000,hours:config.hours,start_hour:6,loading_minutes:15,unloading_minutes:20,compatibility:'DC-GB/T'};
   const project=cmd('planner.create',null,{name:config.name,...query,use_business:true,conditions,sites:candidates}).project;
   const solution=cmd('planner.calculate',project.id,{expected_version:project.version}).solution;
   projects.push({id:project.id,name:project.name,solution_id:solution.id,business_refs:snapshot.refs.map(r=>r.id),daily_quantity:conditions.daily_quantity,distance_km:distance,fleet:solution.fleet});
  }
  const manifest={key:PLANNING_DATASET_KEY,created_at:now(),business_dataset:DATASET_KEY,projects,candidate_ids:candidates.map(c=>c.candidate_id),created_record_ids:[...new Set(created)],source:'ESTIMATED',engineering_approved:false};
  db.prepare('INSERT INTO data_view_state(key,value) VALUES(?,?)').run(PLANNING_DATASET_KEY,JSON.stringify(manifest));
  verifyPlanningDataset(db,manifest);return manifest;
 }));
}
export function verifyPlanningDataset(db,m){
 const admin=datasetActor(db),checks=[];
 for(const p of m.projects){
  const {project,solutions}=planningDetail(db,admin,p.id),s=solutions.find(s=>s.id===p.solution_id);
  if(!s||s.project_version!==project.version||!s.business_snapshot?.refs.length||s.sites.length!==6)throw new Error('规划数据不完整');
  if(s.engineering_approved||s.sites.some(x=>x.land_verified||x.grid_verified||x.access_verified||x.supply_kw!==null))throw new Error('不得伪造工程批准与接电依据');
  if(s.fleet.available!==s.inventory.vehicles.filter(x=>x.eligible).length)throw new Error('可用车辆与档案不一致');
  for(const ref of s.business_snapshot.refs)get(db,admin,ref.resource,ref.id);
  let handoff=null;if(s.fleet.transport_feasible)handoff=planningHandoff(db,admin,s.id);
  if(s.fleet.transport_feasible&&!handoff?.corridor?.order_id)throw new Error('规划缺少运输订单衔接');
  checks.push({project_id:p.id,name:p.name,business_records:s.business_snapshot.refs.length,sites:s.sites.length,vehicles:s.fleet.vehicles,available:s.fleet.available,transport_feasible:s.fleet.transport_feasible,handoff:!!handoff});
 }
 const fk=db.prepare('PRAGMA foreign_key_check').all();if(fk.length)throw new Error('外键异常');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('完整性异常');
 return{status:'PASS',projects:checks,foreign_keys:0,integrity:'ok'};
}
