import {must,unpack,now} from './db.mjs';
import {allowed,scopeClause} from './repository.mjs';
import {availableIn} from './scheduling.mjs';

const closed=new Set(['已完成','已取消','余量已终止']);
const running=t=>['执行中','退回补充'].includes(t.status);
export const chinaDate=t=>Number.isFinite(+new Date(t))?new Date(+new Date(t)+28800000).toISOString().slice(0,10):'';
const coord=r=>Number.isFinite(r.longitude)&&Number.isFinite(r.latitude)&&r.longitude>=73&&r.longitude<=136&&r.latitude>=3&&r.latitude<=54;
export function cockpit(db,user,q={},clock=Date.now()){
 must(user.role==='admin','仅管理端可访问综合驾驶舱',403);allowed(user,'read');
 const date=q.date||chinaDate(clock),owner=q.owner||'';
 must(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&chinaDate(date+'T00:00:00+08:00')===date,'日期无效');
 must(!owner||user.scopes.includes(owner),'无权访问该业务主体',403);
 const rows=(resource)=>{const s=scopeClause(db,user,resource),record=resource==='station-visits',table=record?'records':resource;return db.prepare(`SELECT * FROM ${table} WHERE (${s.sql})${record?' AND resource=?':''}${owner?' AND owner_id=?':''}`).all(...s.args,...(record?[resource]:[]),...(owner?[owner]:[])).map(unpack);};
 const tasks=rows('tasks'),orders=rows('orders'),vehicles=rows('vehicles'),drivers=rows('drivers'),stations=rows('stations'),devices=rows('devices'),charging=rows('charging'),sessions=rows('sessions'),alerts=rows('alerts').filter(r=>r.status!=='已关闭'),trips=rows('trips');
 const idx=a=>new Map(a.map(r=>[r.id,r])),os=idx(orders),vs=idx(vehicles),ds=idx(drivers),ts=idx(tasks);
 const active=tasks.filter(t=>!closed.has(t.status)),executing=tasks.filter(running),today=tasks.filter(t=>!['已取消','余量已终止'].includes(t.status)&&chinaDate(t.start_at)===date);
 const todays=new Set(today.map(t=>t.id)),verified=trips.filter(t=>t.status==='已核验'),todayVerified=verified.filter(t=>chinaDate(t.occurred_at)===date).reduce((n,t)=>n+t.verified_kg,0)/1000;
 const planned=today.reduce((n,t)=>n+t.quantity_kg,0)/1000,cohortVerified=today.reduce((n,t)=>n+t.verified_kg,0)/1000;
 const visits=rows('station-visits'),sessionByPlan=new Map(sessions.map(s=>[s.plan_id,s]));
 const currentVisit=new Map();for(const v of visits.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))))if(v.status!=='已取消')currentVisit.set(v.plan_id,v);
 const plans=charging.filter(p=>p.status!=='已取消'&&(!p.task_id||!['已取消','余量已终止'].includes(ts.get(p.task_id)?.status))).map(p=>{
  const session=sessionByPlan.get(p.id),visit=currentVisit.get(p.id),phase=session?(session.status==='已核验'?'已完成':'待核验'):visit?.status==='补能中'?'作业中':visit?.status==='已完成'?'待核验':'待到站';
  return{...p,phase,vehicle_code:vs.get(p.vehicle_id)?.code,task_code:ts.get(p.task_id)?.code};
 });
 const unfinished=plans.filter(p=>p.phase!=='已完成'),waiting=unfinished.filter(p=>p.phase==='待到站');
 const taskAlerts=t=>alerts.filter(a=>a.task_id===t.id||a.task_ids?.includes(t.id)||a.vehicle_id===t.vehicle_id);
 const taskView=t=>{const o=os.get(t.order_id),v=vs.get(t.vehicle_id);return{id:t.id,code:t.code,name:t.name,status:t.status,order_id:t.order_id,order_code:o?.code,origin:o?.origin,destination:o?.destination,vehicle_code:v?.code,driver_name:ds.get(t.driver_id)?.name,start_at:t.start_at,finish_at:t.finish_at,quantity:t.quantity_kg/1000,verified:t.verified_kg/1000,reported:t.reported_kg/1000,alerts:taskAlerts(t).length,overdue:!closed.has(t.status)&&t.status!=='待核验'&&+new Date(t.finish_at)<clock};};
 const lines=new Map();for(const o of orders.filter(o=>!['草稿','已取消','已终止'].includes(o.status))){
  const key=JSON.stringify([o.owner_id,o.origin,o.destination,o.origin_coords,o.destination_coords]),its=tasks.filter(t=>t.order_id===o.id&&!['已取消','余量已终止'].includes(t.status));
  const l=lines.get(key)||{id:o.id,order_id:o.id,origin:o.origin,destination:o.destination,origin_coords:o.origin_coords,destination_coords:o.destination_coords,quantity:0,verified:0,task_ids:[],vehicle_ids:[],alerts:0};
  l.quantity+=(o.quantity_kg-o.cancelled_kg)/1000;l.verified+=its.reduce((n,t)=>n+t.verified_kg,0)/1000;l.task_ids.push(...its.map(t=>t.id));l.vehicle_ids.push(...its.filter(running).map(t=>t.vehicle_id));l.alerts+=alerts.filter(a=>its.some(t=>a.task_id===t.id||a.task_ids?.includes(t.id))).length;lines.set(key,l);
 }
 const corridors=[...lines.values()].map(l=>({...l,vehicles:new Set(l.vehicle_ids).size,progress:l.quantity?Math.min(100,l.verified/l.quantity*100):0})).sort((a,b)=>b.alerts-a.alerts||b.quantity-a.quantity);
 const stationRows=stations.map(s=>{
  const devicesHere=devices.filter(d=>d.station_id===s.id),ps=unfinished.filter(p=>p.station_id===s.id),next=ps.filter(p=>p.phase==='待到站').sort((a,b)=>a.arrival_at.localeCompare(b.arrival_at))[0];
  return{id:s.id,name:s.name,longitude:s.longitude,latitude:s.latitude,status:s.status,mode:s.mode,remote_connected:s.remote_connected===true,free:devicesHere.filter(d=>d.status==='空闲'&&d.connection==='在线').length,total:devicesHere.length,online:devicesHere.filter(d=>d.connection==='在线').length,waiting:new Set(ps.filter(p=>p.phase==='待到站').map(p=>p.vehicle_id)).size,working:ps.filter(p=>p.phase==='作业中').length,next_at:next?.arrival_at||null,next_vehicle:next?.vehicle_code||null,alerts:alerts.filter(a=>a.station_id===s.id||ps.some(p=>a.plan_id===p.id)).length};
 }).sort((a,b)=>b.alerts-a.alerts||b.waiting-a.waiting||a.name.localeCompare(b.name,'zh-CN'));
 const occupiedVehicles=new Set(active.map(t=>t.vehicle_id)),occupiedDrivers=new Set(active.map(t=>t.driver_id));
 const start=new Date(clock).toISOString(),finish=new Date(clock+3600000).toISOString();
 const available=(r,occupied)=>r.status==='可用'&&!occupied.has(r.id)&&availableIn(r,start,finish);
 const pending=active.filter(t=>t.status==='待派发'),conflicts=pending.filter(t=>{const v=vs.get(t.vehicle_id),d=ds.get(t.driver_id);return !v||!d||v.driver_id!==d.id||v.status!=='可用'||d.status!=='可用'||!availableIn(v,t.start_at,t.finish_at)||!availableIn(d,t.start_at,t.finish_at);});
 const latestTelemetry=new Map();
 const telemetry=vehicles.length?db.prepare(`SELECT * FROM telemetry WHERE vehicle_id IN (${vehicles.map(()=>'?').join(',')}) ORDER BY occurred_at`).all(...vehicles.map(v=>v.id)):[];
 for(const r of telemetry)if(r.owner_id===vs.get(r.vehicle_id)?.owner_id)latestTelemetry.set(r.vehicle_id,r);
 const positions=vehicles.map(v=>{
  const sample=latestTelemetry.get(v.id),rawTime=v.source_time,candidate=sample&&(!rawTime||sample.occurred_at>=rawTime)?{...v,...sample,source_time:sample.occurred_at}:v,time=+new Date(candidate.source_time);
  if(!candidate.source_time||!coord(candidate)||clock-time>600000||clock-time< -60000)return null;
  return{id:v.id,code:v.code,longitude:candidate.longitude,latitude:candidate.latitude,source_time:candidate.source_time,soc:candidate.soc,task_id:active.find(t=>t.vehicle_id===v.id)?.id};
 }).filter(Boolean);
 const ranking={紧急:0,较高:1,重要:1,一般:2,待核实:3};
 const incidents=alerts.map(a=>({id:a.id,code:a.code,name:a.name,severity:a.severity,status:a.status,created_at:a.created_at,task_id:a.task_id||a.task_ids?.[0]||ts.get(plans.find(p=>p.id===a.plan_id)?.task_id)?.id,station_id:a.station_id||plans.find(p=>p.id===a.plan_id)?.station_id,vehicle_id:a.vehicle_id,description:a.description||a.reason||''})).sort((a,b)=>(ranking[a.severity]??3)-(ranking[b.severity]??3)||b.created_at.localeCompare(a.created_at));
 return{at:now(),date,metrics:{planned_tonnes:planned,verified_tonnes:todayVerified,running_tasks:executing.length,running_vehicles:new Set(executing.map(t=>t.vehicle_id)).size,pending_energy_vehicles:new Set(unfinished.filter(p=>p.phase!=='待核验').map(p=>p.vehicle_id)).size,open_alerts:alerts.length},execution:{planned,verified:cohortVerified,progress:planned?Math.min(100,cohortVerified/planned*100):null,states:['待派发','待接收','执行中','待核验'].map(status=>({status,count:tasks.filter(t=>t.status===status||(status==='执行中'&&t.status==='退回补充')).length})),completed:tasks.filter(t=>t.status==='已完成').length},corridors,priority_tasks:tasks.map(taskView).sort((a,b)=>Number(b.alerts>0)-Number(a.alerts>0)||Number(b.overdue)-Number(a.overdue)||Number(closed.has(a.status))-Number(closed.has(b.status))||a.finish_at.localeCompare(b.finish_at)).slice(0,5),energy:{waiting:waiting.length,working:unfinished.filter(p=>p.phase==='作业中').length,verify:unfinished.filter(p=>p.phase==='待核验').length,confirmed_kwh:unfinished.filter(p=>p.status==='已确认').reduce((n,p)=>n+p.quantity_kwh,0),stations:stationRows},resources:{vehicles:vehicles.length,available_vehicles:vehicles.filter(v=>available(v,occupiedVehicles)&&/^A2/.test(ds.get(v.driver_id)?.license||'')).length,occupied_vehicles:occupiedVehicles.size,drivers:drivers.length,available_drivers:drivers.filter(d=>available(d,occupiedDrivers)&&/^A2/.test(d.license||'')).length,conflicting_tasks:conflicts.length,pending_tasks:pending.length,located_vehicles:positions.length,unlocated_vehicles:vehicles.length-positions.length},incidents,positions,basis:{planned:'按任务计划开工日期归属当天，取消和终止任务除外',verified:'按已核验车次的作业日期统计',progress:'当日开工任务的累计核验交付量／计划运量',resources:'当前一小时内可用窗口与未结束任务占用，待派任务另核对档案和时间覆盖'}};
}
