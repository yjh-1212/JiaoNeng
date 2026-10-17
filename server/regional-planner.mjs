import {must,insert,uid,now,BusinessError} from './db.mjs';
import {allowed,get} from './repository.mjs';
import {regionalInputs,regionalMetrics,locateAlong,kmBetween} from './regional-engine.mjs';
import {regionalPresets,provinces,gansuCities,publicSources,publicFacilities} from '../shared/regional-data.js';
import {createHash} from 'node:crypto';
const policies=[{strategy:32,name:'综合推荐',color:'#2878d5'},{strategy:34,name:'高速优先',color:'#6c61c6'},{strategy:36,name:'少收费',color:'#1b9b83'}];
export const regionalCatalog=()=>({provinces,cities:gansuCities,presets:regionalPresets,sources:publicSources,facilities:publicFacilities,defaults:{payload:30,capacity:600,initial_soc:90,min_soc:20,target_soc:90,consumption:1.5,empty_consumption:1.05,vehicle_count:10,speed:55,work_hours:8,handling_minutes:35,power_kw:360,service_minutes:45,energy_price:1.2,cost_km:2.5,driver_hour:45,goal:'deadline'}});
export function createRegionalPlanner({db,key,fetcher=fetch,roadRoute,explain}){
 const cache=new Map(),discoveries=new Map();let queue=Promise.resolve(),last=0;
 async function query(path,params){
  must(key,'地点及道路服务尚未配置',503,'NOT_CONFIGURED');const cacheKey=path+JSON.stringify(params),hit=cache.get(cacheKey);if(hit&&hit.expires>Date.now())return hit.value;
  const run=async()=>{const delay=Math.max(0,last+700-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));last=Date.now();const url=new URL('https://restapi.amap.com'+path);url.search=new URLSearchParams({...params,key}).toString();let data;try{const response=await fetcher(url,{signal:AbortSignal.timeout(12000),redirect:'error'});must(response.ok,'地点服务暂不可用',502);data=await response.json();}catch(e){throw new BusinessError('地点服务暂不可用，请重试',502,'MAP_QUERY_FAILED');}must(data.status==='1','地点服务未返回有效结果',502,'MAP_QUERY_FAILED');if(cache.size>150)cache.delete(cache.keys().next().value);cache.set(cacheKey,{value:data,expires:Date.now()+3600000});return data;};
  const job=queue.then(run,run);queue=job.catch(()=>{});return job;
 }
 async function point(p){if(p.lng!=null&&p.lat!=null)return p;const data=await query('/v3/geocode/geo',{address:p.name});const item=data.geocodes?.[0];must(item?.location,'未找到地点：'+p.name,422,'PLACE_NOT_FOUND');const [lng,lat]=item.location.split(',').map(Number);return{...p,lng,lat,source:'AMAP_GEOCODE',location_level:item.level,formatted_address:item.formatted_address,fetched_at:now()};}
 async function facilities(route){
  const result=new Map(),coords=route.coordinates;
  for(const ratio of [.12,.35,.58,.82]){
   const p=coords[Math.min(coords.length-1,Math.floor((coords.length-1)*ratio))];
   try{
    const data=await query('/v3/place/around',{location:p.join(','),keywords:'重卡充电|重卡换电|充电站',radius:'20000',offset:'12',extensions:'base',sortrule:'distance'});
    for(const row of data.pois||[]){if(!/充电|换电|补能|超充/.test(row.name||''))continue;const [longitude,latitude]=String(row.location||'').split(',').map(Number);if(!Number.isFinite(longitude)||!Number.isFinite(latitude))continue;
     const along=locateAlong(route,[longitude,latitude]);if(along.distance_km>20||along.at_km<2)continue;
     result.set(row.id,{id:row.id,name:row.name,longitude,latitude,address:typeof row.address==='string'?row.address:'',city:row.cityname||'',mode:/换电/.test(row.name)?'换电':'充电',kind:'PUBLIC_POI',source:'AMAP_POI',source_url:'https://lbs.amap.com/api/webservice/guide/api/search',fetched_at:now(),compatibility:'重卡适配待核验',power_kw:null,queue_minutes:null,price:null,...along});}
   }catch(e){/* Real routes remain usable when public facility lookup is unavailable. */}
  }
  return [...result.values()].sort((a,b)=>a.at_km-b.at_km).slice(0,24);
 }
 async function solve(user,body){
  must(user.role==='admin','仅管理端可运行推演',403);allowed(user,'simulation.run');
  const i=regionalInputs(body);i.origin=await point(i.origin);i.destination=await point(i.destination);must(kmBetween([i.origin.lng,i.origin.lat],[i.destination.lng,i.destination.lat])>1,'起讫地点过近，请核对位置');
  const ownerId=body.owner_id||user.scopes[0];must(user.scopes.includes(ownerId),'无权访问业务主体',403);
  if(body.order_id){const order=get(db,user,'orders',body.order_id);must(order.owner_id===ownerId,'订单主体不一致',403);must(order.status==='已确认','请选择已确认订单');must(i.quantity*1000<=order.quantity_kg,'运输量超过订单总量');}
  const keyId=[i.origin.lng,i.origin.lat,i.destination.lng,i.destination.lat].join(','),known=discoveries.get(user.id+':'+keyId)?.items||[];
  const selected=i.station_ids.map(id=>{const row=known.find(s=>s.id===id);must(row,'补能候选已失效，请先重新查询线路',409,'STALE_FACILITY');return row;}).sort((a,b)=>a.at_km-b.at_km);
  const points=[[i.origin.lng,i.origin.lat],...selected.map(s=>[s.longitude,s.latitude]),[i.destination.lng,i.destination.lat]];
  const candidates=[],signatures=new Set(),failures=[];
  for(const policy of policies){try{
   const route=await roadRoute(points,{strategy:policy.strategy});
   const sample=route.coordinates.filter((_,n)=>n%Math.max(1,Math.floor(route.coordinates.length/30))===0).map(p=>p.map(x=>x.toFixed(4)));
   const sig=createHash('sha256').update(JSON.stringify(sample)).digest('hex');if(signatures.has(sig))continue;signatures.add(sig);
   const back=await roadRoute([...points].reverse(),{strategy:policy.strategy});
   candidates.push({id:'R'+policy.strategy,name:policy.name,color:policy.color,route,back});
  }catch(e){failures.push({name:policy.name,message:e.message});}}
  must(candidates.length,'道路规划暂未成功，请核对地点后重试',502,'MAP_ROUTE_UNAVAILABLE');
  const found=selected.length?known:await facilities(candidates[0].route);discoveries.set(user.id+':'+keyId,{items:found,at:Date.now()});if(discoveries.size>80)discoveries.delete(discoveries.keys().next().value);
  for(const c of candidates){c.metrics=regionalMetrics(i,c.route,c.back,found);c.feasible=c.metrics.on_time;c.violations=c.metrics.violations.map(message=>({kind:'SOC',message}));c.bottleneck=c.metrics.status;}
  candidates.sort((a,b)=>Number(b.metrics.on_time)-Number(a.metrics.on_time)||a.metrics.total_cost_cents-b.metrics.total_cost_cents);
  const id=uid('RP'),result={id,owner_id:ownerId,inputs:i,candidates,facilities:found,failures,generated_at:now(),source:'ESTIMATED',limitations:['道路为通用驾车参考，货车禁限行、桥隧承载及进出场条件需核验。','补能地点来自公开地图或公开报道，不表示可用工位、已完成适配或已预约。','电价、能耗、作业与工时按当前输入计算，结果为预计值，排队状态待接入。'],sources:publicSources};
  result.ai={status:'pending',message:'正在整理方案分析'};
  insert(db,'records',{id,resource:'regional-plans',code:id,name:i.origin.name+' → '+i.destination.name,owner_id:ownerId,status:'已测算',source:'ESTIMATED',created_at:now(),data:{inputs:i,result}});
  return result;
 }
 async function analyze(user,id){allowed(user,'ai.use');const row=get(db,user,'regional-plans',id),result=row.result;const ai=explain?await explain({candidates:result.candidates.map(c=>({id:c.id,name:c.name,feasible:c.feasible,metrics:c.metrics,bottleneck:c.bottleneck,violations:c.violations})),limitations:result.limitations},row.inputs):{status:'unavailable',message:'AI分析暂未启用'};const data=db.prepare('SELECT data FROM records WHERE id=?').get(id);const payload=JSON.parse(data.data);payload.result.ai=ai;db.prepare('UPDATE records SET data=?,version=version+1 WHERE id=?').run(JSON.stringify(payload),id);return ai;}
 return{solve,analyze};
}
