import {must,number,text} from './db.mjs';
import {validCoordinate} from './maps.mjs';
export const kmBetween=(a,b)=>{const rad=Math.PI/180,p=(b[1]-a[1])*rad,q=(b[0]-a[0])*rad,t=Math.sin(p/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(q/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(t)));};
const round=(x,d=1)=>Number(x.toFixed(d));
export function regionalInputs(b){
 const i={...b};
 for(const [key,label,min,max] of [['quantity','运量',0.1,100000],['payload','单车载重',1,60],['capacity','电池容量',100,1200],['initial_soc','初始电量',10,100],['min_soc','安全电量',5,50],['target_soc','补能目标',30,100],['consumption','重载能耗',0.3,5],['empty_consumption','空载能耗',0.3,5],['vehicle_count','车辆数量',1,60],['speed','平均行驶速度',10,80],['work_hours','每日作业时长',1,12],['handling_minutes','每趟装卸时间',5,240],['power_kw','补能功率',30,1000],['service_minutes','单次补能作业时间',5,180],['energy_price','测算电价',0,10],['cost_km','其他里程成本',0,30],['driver_hour','司机小时成本',0,300]])i[key]=number(b[key],label,min,max);
 must(Number.isInteger(i.vehicle_count),'车辆数量须为整数');must(i.min_soc<i.initial_soc&&i.min_soc<i.target_soc,'初始及目标电量须高于安全电量');
 i.cargo=text(b.cargo,'货物品类',40);i.goal=b.goal||'existing';must(['existing','deadline','economy'].includes(i.goal),'运输目标无效');
 for(const k of ['origin','destination']){const p=b[k];must(p&&typeof p==='object','请填写起讫地点');i[k]={name:text(p.name,'地点',100),lng:p.lng??null,lat:p.lat??null};if(p.lng!=null||p.lat!=null)must(validCoordinate([p.lng,p.lat]),'地点坐标无效');}
 must(Number.isFinite(+new Date(b.start_at)),'开始时间无效');i.start_at=new Date(b.start_at).toISOString();
 must(!b.deadline||Number.isFinite(+new Date(b.deadline)),'完成期限无效');i.deadline=b.deadline?new Date(b.deadline).toISOString():new Date(+new Date(i.start_at)+3*86400000).toISOString();must(+new Date(i.deadline)>+new Date(i.start_at),'完成期限须晚于开始时间');
 i.station_ids=Array.isArray(b.station_ids)?[...new Set(b.station_ids)]:[];must(i.station_ids.length<=12,'每次最多选择12个补能点');must(i.station_ids.every(x=>typeof x==='string'&&x.length<100),'补能点编号无效');return i;
}
export function locateAlong(route,point){
 let best=Infinity,index=0,total=0;const prefix=[0];
 for(let n=1;n<route.coordinates.length;n++){total+=kmBetween(route.coordinates[n-1],route.coordinates[n]);prefix.push(total);}
 for(let n=0;n<route.coordinates.length;n++){const d=kmBetween(route.coordinates[n],point);if(d<best){best=d;index=n;}}
 return {distance_km:round(best),at_km:round(total?prefix[index]/total*route.distance_m/1000:0),index};
}
export function plannedStops(route,i){
 const km=route.distance_m/1000,initialRange=(i.initial_soc-i.min_soc)/100*i.capacity/i.consumption,range=(i.target_soc-i.min_soc)/100*i.capacity/i.consumption;
 const out=[];let at=initialRange*0.88;
 while(at<km-1&&out.length<24){
  const target=at/km,coords=route.coordinates;let sum=0,all=0;for(let n=1;n<coords.length;n++)all+=kmBetween(coords[n-1],coords[n]);
  let p=coords[0];for(let n=1;n<coords.length;n++){sum+=kmBetween(coords[n-1],coords[n]);if(sum>=all*target){p=coords[n];break;}}
  out.push({id:'PLAN-'+out.length,name:`第${Math.round(at)}公里补能建议点`,longitude:p[0],latitude:p[1],at_km:round(at),kind:'PLANNED',compatibility:'需落实补能设施',mode:'充电',source:'PLANNING_REQUIREMENT',power_kw:i.power_kw});at+=range*0.88;
 }
 return out;
}
export function regionalMetrics(i,route,back,facilities=[]){
 const trips=Math.ceil(i.quantity/i.payload),distance=route.distance_m/1000,returnKm=back.distance_m/1000;
 const loadedHours=Math.max(route.duration_s/3600||0,distance/i.speed),emptyHours=Math.max(back.duration_s/3600||0,returnKm/(i.speed+5));
 const chargePack=i.capacity*(i.target_soc-i.min_soc)/100,chargeMinutes=Math.max(i.service_minutes,chargePack/i.power_kw*60+5);
 const perTruck=(count)=>{
  const journeys=Math.ceil(trips/count),heavyEnergy=distance*i.consumption,emptyEnergy=returnKm*i.empty_consumption;
  const energy=heavyEnergy*journeys+emptyEnergy*Math.max(0,journeys-1),available=i.capacity*(i.initial_soc-i.min_soc)/100,pack=i.capacity*(i.target_soc-i.min_soc)/100;
  const recharges=Math.max(0,Math.ceil((energy-available)/pack)),hours=loadedHours*journeys+emptyHours*Math.max(0,journeys-1)+i.handling_minutes/60*journeys+recharges*chargeMinutes/60;
  const days=Math.floor(Math.max(0,hours-0.00001)/i.work_hours),elapsed=hours+days*(24-i.work_hours);
  return{journeys,energy,recharges,hours,elapsed,finish:+new Date(i.start_at)+elapsed*3600000};
 };
 let count=Math.min(trips,i.vehicle_count);
 if(i.goal!=='existing'){const limit=Math.min(i.vehicle_count,trips);count=limit;if(i.goal==='deadline')for(let n=1;n<=limit;n++){if(perTruck(n).finish<=+new Date(i.deadline)){count=n;break;}}}
 const single=perTruck(count),emptyTrips=Math.max(0,trips-count),totalEnergy=distance*i.consumption*trips+returnKm*i.empty_consumption*emptyTrips;
 const totalCharges=Array.from({length:count},(_,n)=>{const journeys=Math.floor(trips/count)+(n<trips%count?1:0),energy=distance*i.consumption*journeys+returnKm*i.empty_consumption*Math.max(0,journeys-1);return Math.max(0,Math.ceil((energy-i.capacity*(i.initial_soc-i.min_soc)/100)/chargePack));}).reduce((a,b)=>a+b,0);
 const totalKm=distance*trips+returnKm*emptyTrips,totalDriverHours=loadedHours*trips+emptyHours*emptyTrips+i.handling_minutes/60*trips+totalCharges*chargeMinutes/60;
 const totalCost=Math.round((totalEnergy*i.energy_price+totalKm*i.cost_km+totalDriverHours*i.driver_hour)*100);
 const suggestions=plannedStops(route,i),selected=facilities.filter(s=>i.station_ids.includes(s.id)).map(s=>({...s,...locateAlong(route,[s.longitude,s.latitude])})).sort((a,b)=>a.at_km-b.at_km);
 if(!suggestions.length&&single.recharges>0){suggestions.push({id:'PLAN-ORIGIN',name:'起运地补能条件',longitude:i.origin.lng,latitude:i.origin.lat,at_km:0,kind:'PLANNED',source:'PLANNING_REQUIREMENT'},{id:'PLAN-DESTINATION',name:'目的地补能条件',longitude:i.destination.lng,latitude:i.destination.lat,at_km:round(distance),kind:'PLANNED',source:'PLANNING_REQUIREMENT'});}
 const timeline=[];let soc=i.initial_soc,last=0,clock=+new Date(i.start_at);const violations=[];
 for(const s of selected){const used=(s.at_km-last)*i.consumption,arrival=soc-used/i.capacity*100;clock+=(s.at_km-last)/i.speed*3600000;if(arrival<i.min_soc)violations.push('到达'+s.name+'前电量不足');timeline.push({...s,arrival_soc:round(arrival),departure_soc:i.target_soc,arrival_at:new Date(clock).toISOString(),queue_minutes:null});clock+=i.service_minutes*60000;soc=i.target_soc;last=s.at_km;}
 const arrivalSoc=soc-(distance-last)*i.consumption/i.capacity*100;
 const energetic=arrivalSoc>=i.min_soc&&!violations.length;
 const needs= single.recharges>0;
 return{vehicle_count:count,trip_count:trips,delivered_kg:Math.round(i.quantity*1000),last_trip_tonnes:round(i.quantity-(trips-1)*i.payload,3),distance_km:round(distance),return_distance_km:round(returnKm),one_way_minutes:Math.round(loadedHours*60),duration_minutes:Math.round(single.elapsed*60),finish_at:new Date(single.finish).toISOString(),total_energy_kwh:round(totalEnergy),total_cost_cents:totalCost,energy_cost_cents:Math.round(totalEnergy*i.energy_price*100),unit_cost_cents:Math.round(totalCost/i.quantity),per_vehicle_trips:single.journeys,per_vehicle_charges:single.recharges,single_trip_arrival_soc:round(arrivalSoc),arrival_soc:single.journeys>1?null:round(arrivalSoc),on_time:single.finish<=+new Date(i.deadline),energy_feasible:energetic,dispatch_ready:false,charging_stops:timeline,planned_stops:suggestions,violations,queue_minutes:null,status:needs?'补能条件待核验':single.finish<=+new Date(i.deadline)?'运输条件可行':'完成期限不足',cost_scope:'按输入电价、里程及人工参数估算；不含未录入的路桥、租赁等费用。'};
}
