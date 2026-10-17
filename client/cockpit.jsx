import React,{useEffect,useRef,useState} from 'react';
import {Activity,ArrowLeft,ArrowUpRight,BatteryCharging,CheckCheck,ChevronRight,Clock3,Expand,Minimize,RefreshCw,Route,ShieldAlert,Truck,Users,X,Zap} from 'lucide-react';
import {useApp} from './context';
import {request} from './api';
import {AgentContextSync} from './agent-launcher';
import CockpitMap from './cockpit-map';
import './cockpit.css';
const number=n=>n==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(n);
const hour=t=>t?new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai'}):'—';
const dateTime=t=>new Date(t).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'});
function Panel({title,icon:Icon,extra,children,className=''}){
 const host=useRef(),[size,setSize]=useState({w:340,h:240});
 useEffect(()=>{const observer=new ResizeObserver(()=>{if(host.current)setSize({w:host.current.clientWidth,h:host.current.clientHeight});});if(host.current)observer.observe(host.current);return()=>observer.disconnect();},[]);
 const {w,h}=size;return <section ref={host} className={'jn-cockpit-panel '+className} aria-label={title}>
  <svg className="jn-cockpit-frame" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><path className="outline" d={`M1 18 L18 1 H${w*.72} L${w*.79} 17 H${w-1} V${h-1} H${w*.83} L${w*.81} ${h-7} H${w*.19} L${w*.17} ${h-1} H1 Z`}/><path className="corners" d={`M${w-18} 17 H${w-1} V32 M1 ${h-18} V${h-1} H18 M${w*.19} ${h-3} H${w*.81}`}/><path className="notch" d="M1 14 V1 H14 Z"/></svg>
  <header><span><Icon size={19}/><h2>{title}</h2></span>{extra}</header><div className="jn-cockpit-panel-body">{children}</div>
 </section>;
}
function Meter({value,color}){return <span className="jn-cockpit-meter"><i style={{width:Math.min(100,Math.max(0,value||0))+'%',background:color}}/></span>;}
function StatusRing({name,count,total,color}){return <div className="jn-cockpit-status-ring" style={{'--ring-color':color}}><div><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="base" cx="50" cy="50" r="40"/><circle className="value" cx="50" cy="50" r="40" strokeDasharray={`${total?count/total*251:0} 251`}/></svg><strong>{count}<small>项</small></strong></div><span>{name}</span></div>;}
export default function Cockpit(){
 const a=useApp(),root=useRef(),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[selection,setSelection]=useState(null),[clock,setClock]=useState(Date.now()),[fullscreen,setFullscreen]=useState(false),requestId=useRef(0);
 async function refresh(signal){const id=++requestId.current;setLoading(true);try{const d=await request('/api/cockpit',{signal});if(id===requestId.current){setData(d);setError('');}}catch(e){if(!signal?.aborted&&id===requestId.current)setError(e.message);}finally{if(id===requestId.current)setLoading(false);}}
 useEffect(()=>{const ctl=new AbortController();refresh(ctl.signal);const timer=setInterval(()=>{if(!document.hidden)refresh(ctl.signal);},30000);return()=>{ctl.abort();clearInterval(timer);requestId.current++;};},[a.revision]);
 useEffect(()=>{const element=root.current;const timer=setInterval(()=>setClock(Date.now()),1000),change=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',change);return()=>{clearInterval(timer);document.removeEventListener('fullscreenchange',change);if(element&&document.fullscreenElement===element)document.exitFullscreen?.().catch(()=>{});};},[]);
 const select=s=>setSelection(s),openTasks=()=>a.go('tasks'),openAlert=id=>a.go('alerts',{incident_id:id}),openOrder=id=>a.showDetail('orders',id);
 const selectedTask=data?.priority_tasks.find(t=>selection?.kind==='task'&&t.id===selection.id),selectedLine=data?.corridors.find(l=>selection?.kind==='order'&&l.order_id===selection.id),selectedStation=data?.energy.stations.find(s=>selection?.kind==='station'&&s.id===selection.id),selectedVehicle=data?.positions.find(v=>selection?.kind==='vehicle'&&v.id===selection.id),selectedIncident=data?.incidents.find(i=>selection?.kind==='alert'&&i.id===selection.id);
 const context=selectedTask?{context_resource:'tasks',context_id:selectedTask.id}:selectedLine?{context_resource:'orders',context_id:selectedLine.order_id}:selectedStation?{context_resource:'stations',context_id:selectedStation.id}:selectedIncident?{context_resource:'alerts',context_id:selectedIncident.id}:{};
 const quick=(route,label)=> <button className="jn-cockpit-more" onClick={()=>a.go(route)} aria-label={label}>全部<ChevronRight size={12}/></button>;
 const metrics=data?[['今日计划运输量',data.metrics.planned_tonnes,'吨',Truck,data.basis.planned],['今日核验交付量',data.metrics.verified_tonnes,'吨',CheckCheck,data.basis.verified],['执行中任务',data.metrics.running_tasks,'项',Route,'当前执行中及退回补充任务'],['在执行车辆',data.metrics.running_vehicles,'辆',Truck,'执行中任务关联车辆去重'],['待补能车辆',data.metrics.pending_energy_vehicles,'辆',BatteryCharging,'未完成作业的补能车辆去重'],['待处置预警',data.metrics.open_alerts,'项',ShieldAlert,'当前未关闭事件']]:[];
 const selectedName=selectedTask?.name||selectedLine&&(selectedLine.origin+' → '+selectedLine.destination)||selectedStation?.name||selectedVehicle?.code||selectedIncident?.name;
 return <div className="jn-cockpit" ref={root}>
  <AgentContextSync context={{capability:'DISPATCH',...context,draft:{page_context:{page:'cockpit',title:'综合驾驶舱'},cockpit:data?{date:data.date,metrics:data.metrics,resources:data.resources,selection:selectedName}:{}},examples:['今天哪些运输任务需要优先关注？','当前补能安排会不会影响运输？','现有车辆能否完成剩余运输任务？']}}/>
  <div className="jn-cockpit-titlebar"><span className="jn-cockpit-region"><Activity size={16}/>庆阳 · 区域运行态势</span><h1>交能融合综合驾驶舱</h1><div className="jn-cockpit-actions"><time>{dateTime(clock)}</time><button aria-label="刷新驾驶舱" disabled={loading} onClick={()=>refresh()}><RefreshCw size={17} className={loading?'spinning':''}/></button><button aria-label={fullscreen?'退出全屏':'进入全屏'} onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current.requestFullscreen();}catch{a.message.warning('请使用浏览器全屏功能');}}}>{fullscreen?<Minimize size={18}/>:<Expand size={18}/>}</button><button className="jn-cockpit-back" onClick={()=>a.go('overview')}><ArrowLeft size={17}/>返回运营总览</button></div></div>
  {error&&<div className="jn-cockpit-error" role="alert">{error} <button onClick={()=>refresh()}>重新加载</button>{data&&<span>当前保留上次数据 · {hour(data.at)}</span>}</div>}
  {!data?<div className="jn-cockpit-initial" role="status">{loading?'正在载入运行数据…':'暂无运行数据'}</div>:<>
   <div className="jn-cockpit-stage">
    <CockpitMap data={data} selection={selection} onSelect={select}/>
    <aside className="jn-cockpit-side left">
     <Panel title="运输总体态势" icon={Activity} extra={<small>核心指标</small>}>
      <div className="jn-cockpit-overview-grid">{[metrics[0],metrics[1],metrics[2],metrics[5]].map(([label,value,unit,Icon,basis],i)=><div key={label} title={basis} style={{'--metric-color':['#91afff','#4cc9e5','#c0b5ff','#efb85a'][i]}}><span>{label}</span><p><strong>{number(value)}</strong><small>{unit}</small></p></div>)}</div>
      <footer className="jn-cockpit-overview-foot"><span><i/>运输与能源协同</span><strong>{data.corridors.length}<small>条业务线路</small></strong></footer>
     </Panel>
     <Panel title="重点运输线路" icon={Route} extra={<small>{data.corridors.length} 条线路</small>}>
      <div className="jn-cockpit-route-list">{data.corridors.slice(0,3).map((l,i)=><button key={l.id} className={selection?.id===l.id?'selected':''} onClick={()=>select({kind:'order',id:l.order_id})}><div><span className="jn-cockpit-rank">{String(i+1).padStart(2,'0')}</span><strong title={l.origin+' → '+l.destination}>{l.origin} → {l.destination}</strong>{l.alerts>0&&<em>{l.alerts}项预警</em>}</div><p><span>计划 {number(l.quantity)} 吨</span><span>核验 {number(l.verified)} 吨</span></p><Meter value={l.progress}/><small>{l.vehicles} 辆执行中<span>{Math.round(l.progress)}%</span></small></button>)}{!data.corridors.length&&<p className="jn-cockpit-empty">暂无运输线路</p>}</div>
     </Panel>
     <Panel title="运输任务执行" icon={Truck} extra={quick('tasks','查看全部运输任务')}>
      <div className="jn-cockpit-execution"><div className="jn-cockpit-ring"><svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="61" className="orbit"/><circle cx="75" cy="75" r="52" className="base"/><circle cx="75" cy="75" r="52" className="progress" strokeDasharray={`${(data.execution.progress||0)/100*327} 327`}/></svg><strong>{data.execution.progress==null?'—':Math.round(data.execution.progress)}<small>%</small></strong><span>核验完成率</span></div><div className="jn-cockpit-states">{data.execution.states.map((s,i)=><button key={s.status} onClick={()=>a.go('tasks',{stage:['pending','ready','running','verify'][i]})}><span><i/>{s.status}</span><strong>{s.count}<small>项</small></strong></button>)}</div></div>
      <footer className="jn-cockpit-foot">核验交付 <b>{number(data.execution.verified)}</b> / {number(data.execution.planned)} 吨<span>已完成 {data.execution.completed} 项</span></footer>
      {data.priority_tasks[0]&&<button className="jn-cockpit-focus-task" onClick={()=>select({kind:'task',id:data.priority_tasks[0].id})}><span>{data.priority_tasks[0].name}</span><ChevronRight size={13}/></button>}
     </Panel>
    </aside>
    <aside className="jn-cockpit-side right">
     <Panel title="补能运行态势" icon={BatteryCharging} extra={quick('charging','查看全部补能安排')}>
      <div className="jn-cockpit-energy-rings">{[['待到站',data.energy.waiting,'#94b1ff'],['作业中',data.energy.working,'#4bd1c1'],['待核验',data.energy.verify,'#efb85a']].map(([name,count,color])=><StatusRing key={name} name={name} count={count} total={data.energy.waiting+data.energy.working+data.energy.verify} color={color}/>)}</div>
      <div className="jn-cockpit-energy-foot"><span>待补能 <strong>{data.metrics.pending_energy_vehicles}<small>辆</small></strong></span><span>已确认需求 <strong>{number(data.energy.confirmed_kwh)}<small>kWh</small></strong></span></div>
      <div className="jn-cockpit-capacity-foot"><span>可用车辆 <b>{data.resources.available_vehicles}</b> 辆</span><span>可用司机 <b>{data.resources.available_drivers}</b> 人</span></div>
     </Panel>
     <Panel title="重点场站态势" icon={Zap} extra={quick('stations','查看全部场站')}>
      <div className="jn-cockpit-site-status">{data.energy.stations.slice(0,5).map(s=><button key={s.id} onClick={()=>select({kind:'station',id:s.id})} className={selection?.id===s.id?'selected':''}><span><i className={s.alerts?'warn':'dot'}/><strong title={s.name}>{s.name}</strong></span><Meter value={s.total?s.free/s.total*100:0} color={s.alerts?'#efb85a':'#45c5c5'}/><b>{s.free}<small>/{s.total}</small></b></button>)}{!data.energy.stations.length&&<p className="jn-cockpit-empty">暂无补能场站</p>}</div>
      <div className="jn-cockpit-site-foot">工位可用 / 总量<span>待到站 {data.energy.waiting} 项</span></div>
     </Panel>
     <Panel title="待处置预警" icon={ShieldAlert} extra={quick('alerts','查看全部预警')}>
      <div className="jn-cockpit-incidents">{data.incidents.slice(0,3).map(i=><button key={i.id} onClick={()=>select({kind:'alert',id:i.id})}><i className={['紧急','重要','较高'].includes(i.severity)?'danger':'warn'}/><div><strong>{i.name}</strong><p>{i.status} · {hour(i.created_at)}</p></div><em>{i.severity||'关注'}</em></button>)}{!data.incidents.length&&<div className="jn-cockpit-no-alert"><ShieldAlert size={30}/><strong>当前无待处置预警</strong><span>持续关注运输与补能运行</span></div>}</div>
      <button className="jn-cockpit-alert-link" onClick={()=>a.go('monitoring')}>进入运行监控<ArrowUpRight size={13}/></button>
     </Panel>
    </aside>
    {selection&&selectedName&&<section className="jn-cockpit-selection" aria-label="选中业务信息"><button className="jn-cockpit-close" onClick={()=>select(null)} aria-label="关闭选中信息"><X size={15}/></button><span className="jn-cockpit-selection-label">{selectedLine?'运输线路':selectedStation?'补能场站':selectedIncident?'异常事件':selectedVehicle?'车辆位置':'运输任务'}</span><strong>{selectedName}</strong><div>{selectedLine&&<><span>计划 {number(selectedLine.quantity)} 吨 · 核验 {number(selectedLine.verified)} 吨</span><button onClick={()=>openOrder(selectedLine.order_id)}>查看订单<ArrowUpRight size={13}/></button></>}{selectedStation&&<><span>可用 {selectedStation.free} / {selectedStation.total} 工位 · 待到站 {selectedStation.waiting} 辆</span><button onClick={()=>a.go('stations',{station_id:selectedStation.id})}>场站作业<ArrowUpRight size={13}/></button></>}{selectedTask&&<><span>{selectedTask.status} · {selectedTask.vehicle_code} · {selectedTask.driver_name}</span><button onClick={()=>a.go('tasks',{task_id:selectedTask.id})}>任务详情<ArrowUpRight size={13}/></button></>}{selectedIncident&&<><span>{selectedIncident.severity} · {selectedIncident.status}</span><button onClick={()=>openAlert(selectedIncident.id)}>查看预警<ArrowUpRight size={13}/></button></>}{selectedVehicle&&<><span>最近定位 {hour(selectedVehicle.source_time)} · SOC {number(selectedVehicle.soc)}%</span><button onClick={()=>a.go('monitoring')}>运行监控<ArrowUpRight size={13}/></button></>}</div></section>}
   </div>
   <footer className="jn-cockpit-status"><span><i/>数据更新 {hour(data.at)}{loading?' · 更新中':''}</span><span>运输任务 · 补能协同 · 运行保障</span><span>30秒自动更新</span></footer>
  </>}
 </div>;
}


