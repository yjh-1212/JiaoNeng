import React,{useEffect,useRef,useState} from 'react';
import {Button,Select,InputNumber,Drawer,Checkbox,Alert,Empty,Segmented,Collapse} from 'antd';
import {Route,ArrowRight,MapPin,Zap,SlidersHorizontal,ChevronDown,Info,Truck,Clock3,Bot,ExternalLink} from 'lucide-react';
import {useApp} from './context';
import {request,detail} from './api';
import {Heading,format,money,time,Pill} from './ui';
import {PointInput} from './scenario-panels';
import ScenarioMap from './scenario-map';
import GoalSimulation from './goal-simulation';
import {AgentContextSync} from './agent-launcher';
import {regionalPresets} from '../shared/regional-data';
import './regional-simulation.css';
const local=v=>new Date(+new Date(v)-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16);
const cargo=['煤炭','矿石','砂石骨料','钢材','水泥','熟料','粉煤灰','焦炭','粮食','其他'];
const initial={quantity:null,cargo:'煤炭',origin:{name:'',lng:null,lat:null},destination:{name:'',lng:null,lat:null},station_ids:[],start_at:new Date(Date.now()+300000).toISOString(),deadline:new Date(Date.now()+3*86400000).toISOString()};
export default function RegionalSimulation(){
 const a=useApp(),[catalog,setCatalog]=useState(null),[inputs,setInputs]=useState(initial),[result,setResult]=useState(null),[selected,setSelected]=useState(null),[stations,setStations]=useState([]),[settings,setSettings]=useState(false),[facilityOpen,setFacilityOpen]=useState(false),[sources,setSources]=useState(false),[ordersOpen,setOrdersOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[aiBusy,setAiBusy]=useState(false),[advanced,setAdvanced]=useState(false),[picking,setPicking]=useState(null),[boundOrder,setBoundOrder]=useState(null),[changed,setChanged]=useState(false);
 const active=useRef(true),seq=useRef(0),handoffKey=useRef('');
 useEffect(()=>{active.current=true;request('/api/regional-scenarios/catalog').then(c=>{if(active.current){setCatalog(c);setInputs(i=>({...c.defaults,...i}));}}).catch(e=>setError(e.message));return()=>{active.current=false;seq.current++;};},[]);
 const patch=(key,value)=>{setInputs(i=>({...i,[key]:value,...(['origin','destination'].includes(key)?{station_ids:[]}:{})}));setChanged(true);};
 useEffect(()=>{if(!catalog)return;let live=true;const q=new URLSearchParams(location.hash.split('?')[1]||''),id=q.get('order_id'),agent=q.get('agent_conversation');
  if(id){detail('orders',id).then(o=>{if(live)applyOrder(o);}).catch(e=>{if(live)setError(e.message);});}
  else if(agent&&handoffKey.current!==agent){handoffKey.current=agent;request('/api/agents/conversations/'+agent+'/handoff').then(h=>{if(!live)return;const draft=h.draft||{};setInputs(i=>({...i,...Object.fromEntries(['quantity','cargo','origin','destination','payload','capacity','consumption','vehicle_count','goal','deadline'].filter(k=>draft[k]!=null).map(k=>[k,draft[k]]))}));setChanged(true);}).catch(e=>setError(e.message));}
  return()=>{live=false;};
 },[catalog,a.intentDraft]);
 function applyOrder(o){setBoundOrder(o);setInputs(i=>({...i,quantity:o.quantity_kg/1000,cargo:o.cargo||'煤炭',origin:{name:o.origin||'',lng:o.origin_coords?.[0]??null,lat:o.origin_coords?.[1]??null},destination:{name:o.destination||'',lng:o.destination_coords?.[0]??null,lat:o.destination_coords?.[1]??null},station_ids:[]}));setChanged(true);setOrdersOpen(false);}
 function preset(p){setBoundOrder(null);setInputs(i=>({...i,quantity:p.quantity,cargo:p.cargo,origin:{name:p.origin,lng:null,lat:null},destination:{name:p.destination,lng:null,lat:null},station_ids:[]}));setStations([]);setChanged(true);}
 async function solve(){if(busy||!catalog)return;const token=++seq.current;setBusy(true);setError('');try{
  const r=await request('/api/regional-scenarios/solve',{method:'POST',body:{...inputs,station_ids:stations,...(boundOrder?{order_id:boundOrder.id,owner_id:boundOrder.owner_id}:{})}});
  if(!active.current||seq.current!==token)return;setResult(r);setSelected(r.candidates[0]?.id);setInputs(r.inputs);setChanged(false);
  if(a.can('ai.use')){setAiBusy(true);request('/api/regional-scenarios/'+r.id+'/analyze',{method:'POST',body:{}}).then(ai=>{if(active.current&&seq.current===token)setResult(prev=>prev?.id===r.id?{...prev,ai}:prev);}).catch(e=>{if(active.current&&seq.current===token)setResult(prev=>prev?.id===r.id?{...prev,ai:{status:'unavailable',message:e.message}}:prev);}).finally(()=>{if(active.current&&seq.current===token)setAiBusy(false);});}
 }catch(e){if(active.current&&seq.current===token)setError(e.message);}finally{if(active.current&&seq.current===token)setBusy(false);}}
 const plan=result?.candidates.find(p=>p.id===selected),metrics=plan?.metrics,displayInputs=result&&!changed?result.inputs:inputs;
 const mapRoutes=result?Object.fromEntries(result.candidates.map(c=>[c.id,c.route])):{};
 const mapPlan=null;
 const visibleStations=result?.facilities||[];
 function assistant(){a.openPageAssistant({agent_entry:{capability:'SIMULATION',owner_id:result?.owner_id||boundOrder?.owner_id||a.user.scopes[0],...(result?{context_resource:'regional-plans',context_id:result.id}:{}),draft:{quantity:inputs.quantity,cargo:inputs.cargo,origin:inputs.origin,destination:inputs.destination,page_context:{page:'simulation',title:'交能推演',summary:JSON.stringify({selected,inputs,metrics}).slice(0,2400)}}},return_hash:location.hash});}
 const fields=[['payload','单车载重（吨）',1,60],['capacity','电池容量（kWh）',100,1200],['consumption','重载能耗（kWh/km）',.3,5],['empty_consumption','空载能耗（kWh/km）',.3,5],['initial_soc','初始电量（%）',10,100],['min_soc','安全电量（%）',5,50],['target_soc','补能目标（%）',30,100],['speed','平均速度（km/h）',10,80],['work_hours','每日作业（小时）',1,12],['handling_minutes','每趟装卸（分钟）',5,240],['power_kw','测算充电功率（kW）',30,1000],['service_minutes','单次补能（分钟）',5,180],['energy_price','测算电价（元/kWh）',0,10],['cost_km','其他里程成本（元/km）',0,30],['driver_hour','司机成本（元/小时）',0,300]];
 if(advanced)return <><div className="regional-mode-back"><Button onClick={()=>setAdvanced(false)}>返回线路规划</Button></div><GoalSimulation/></>;
 return <div className="regional-workbench"><Heading title="交能推演"/>
  <section className="regional-conditions" aria-label="省域运输条件">
   <div className="regional-condition-head"><span><Route size={17}/>运输条件 {boundOrder&&<Pill>{boundOrder.code}</Pill>}</span><div><Button type="text" onClick={()=>setOrdersOpen(true)}>关联运输订单</Button><Button type="text" onClick={()=>setAdvanced(true)}>精细排程 <ArrowRight size={14}/></Button></div></div>
   <div className="regional-primary-fields">
    <label><span>运输总量（吨）</span><InputNumber aria-label="运输总量（吨）" value={inputs.quantity} min={.1} max={100000} onChange={v=>patch('quantity',v)} placeholder="请输入运量" disabled={busy}/></label>
    <label><span>货物类型</span><Select aria-label="货物类型" value={inputs.cargo} options={cargo.map(value=>({value,label:value}))} onChange={v=>patch('cargo',v)} disabled={busy}/></label>
    <PointInput label="起运地" value={inputs.origin} disabled={busy} onChange={v=>patch('origin',v)} onPick={()=>setPicking('origin')}/>
    <PointInput label="目的地" value={inputs.destination} disabled={busy} onChange={v=>patch('destination',v)} onPick={()=>setPicking('destination')}/>
   </div>
   <div className="regional-condition-actions"><Segmented aria-label="运输目标" value={inputs.goal||'existing'} options={[{value:'existing',label:'按给定车数'},{value:'deadline',label:'按期完成'},{value:'economy',label:'按期更省钱'}]} onChange={v=>patch('goal',v)} disabled={busy}/><label>车辆上限 <InputNumber aria-label="参与车辆" value={inputs.vehicle_count} min={1} max={60} onChange={v=>patch('vehicle_count',v)} disabled={busy}/> 辆</label>{inputs.goal!=='existing'&&<label>最晚完成 <input className="regional-deadline" aria-label="最晚完成" type="datetime-local" value={local(inputs.deadline)} onChange={e=>{if(e.target.value)patch('deadline',new Date(e.target.value).toISOString());}}/></label>}<div className="regional-actions-end"><Button icon={<SlidersHorizontal size={15}/>} onClick={()=>setSettings(true)}>调整条件</Button><Button type="primary" icon={<Route size={16}/>} loading={busy} disabled={!catalog||!a.can('simulation.run')} onClick={solve}>开始推演</Button></div></div>
   <div className="regional-quick-routes"><span>快捷测算</span>{regionalPresets.map(p=><button key={p.id} disabled={busy} onClick={()=>preset(p)}>{p.label}</button>)}</div>
  </section>
  {error&&<Alert showIcon type="error" title={error} closable onClose={()=>setError('')}/>}
  {changed&&result&&<Alert type="warning" title="条件已调整，请重新推演后采用结果。"/>}
  <section className="regional-map-stage" aria-label="省域运输路线地图">
   <ScenarioMap inputs={displayInputs} plan={mapPlan} routes={mapRoutes} stations={visibleStations} clock={Date.now()} picking={picking} onPick={p=>{patch(picking,p);setPicking(null);}} onStation={()=>setFacilityOpen(true)} rightOpen={!!result} rightPanelWidth={398} regional selectedRouteKey={selected}/>
   <div className="regional-map-scope"><MapPin size={14}/><b>甘肃全省及周边省区</b><span>陕 · 宁 · 青 · 川 · 蒙 · 新</span></div>
   {!result&&!busy&&!picking&&<div className="regional-map-intro"><Route size={28}/><strong>从一批货开始，找到合适的运输方案</strong><span>选择起讫地，比较路线、运力、能耗和补能安排</span></div>}
   {picking&&<div className="regional-pick">在地图选择{picking==='origin'?'起运地':'目的地'} <Button size="small" onClick={()=>setPicking(null)}>取消</Button></div>}
   {busy&&<div className="regional-computing" role="status"><span className="scene-spinner"/><b>正在规划道路与沿途补能</b><span>按实际道路比较不同策略</span></div>}
   {result&&plan&&!picking&&<aside className="regional-plan-float" aria-label="路线推荐方案">
    <header><b>路线方案 <small>{result.candidates.length}条</small></b><button aria-label="查看路线数据依据" onClick={()=>setSources(true)}><Info size={16}/></button></header>
    <div className="regional-route-options">{result.candidates.map(c=><button key={c.id} className={c.id===selected?'active':''} onClick={()=>setSelected(c.id)} aria-pressed={c.id===selected}><div><i style={{background:c.color}}/><strong>{c.name}</strong><Pill>{c.metrics.on_time?'可按期完成':'期限不足'}</Pill></div><p><b>{format(c.metrics.distance_km)}<small> km</small></b><span>约{format(c.metrics.one_way_minutes/60)}小时行驶</span><span>单车{c.metrics.per_vehicle_charges}次补能</span></p><small>{c.route.roads?.slice(0,3).join(' · ')||'实际道路路线'}</small></button>)}</div>
    <div className="regional-plan-metrics"><div><small>所需车辆</small><strong>{metrics.vehicle_count}<em>辆</em></strong></div><div><small>预计完成</small><strong>{format(metrics.duration_minutes/60)}<em>小时</em></strong></div><div><small>预计费用</small><strong>{money(metrics.total_cost_cents)}</strong></div><div><small>总能耗</small><strong>{format(metrics.total_energy_kwh)}<em>kWh</em></strong></div></div>
    <div className="regional-plan-details"><span><Truck size={14}/>{metrics.trip_count}趟 · 单车最多{metrics.per_vehicle_trips}趟</span><span><Clock3 size={14}/>{time(metrics.finish_at)}完成</span></div>
    <button className="regional-charging-entry" onClick={()=>setFacilityOpen(true)}><Zap size={17}/><span><b>补能安排</b><small>{visibleStations.length}个沿线候选 · {metrics.planned_stops.length}处补能需求</small></span><ArrowRight size={15}/></button>
    <footer><Button block onClick={assistant} icon={<Bot size={16}/>}>{aiBusy?'AI正在分析方案':'让AI解释当前方案'}</Button><span>{metrics.status} · 费用为预计值</span></footer>
   </aside>}
  </section>
  {result&&<section className="regional-result-strip"><div><b>本次运输</b><span>{format(inputs.quantity)}吨{inputs.cargo} · {metrics?.trip_count}趟</span></div><div><b>补能与时效</b><span>{metrics?.status} · 排队状态待接入</span></div><div><b>AI方案建议</b><span>{aiBusy?'正在分析路线、运力和补能条件…':result.ai?.summary||result.ai?.message||'可打开本页AI助手继续分析'}</span></div><button onClick={()=>setSources(true)}>数据依据 <ExternalLink size={13}/></button></section>}
  <Drawer title="调整运输条件" open={settings} onClose={()=>setSettings(false)} size={560}><div className="regional-settings-grid"><label className="full"><span>开始时间</span><input aria-label="开始时间" type="datetime-local" value={local(inputs.start_at)} onChange={e=>{if(e.target.value)patch('start_at',new Date(e.target.value).toISOString());}}/></label><label className="full"><span>要求完成时间</span><input aria-label="要求完成时间" type="datetime-local" value={local(inputs.deadline)} onChange={e=>{if(e.target.value)patch('deadline',new Date(e.target.value).toISOString());}}/></label>{fields.map(([key,label,min,max])=><label key={key}><span>{label}</span><InputNumber aria-label={label} value={inputs[key]} min={min} max={max} onChange={v=>patch(key,v)}/></label>)}</div><p className="regional-muted">公开车型参数可作选型参考；电价、装卸与作业参数可根据实际合同和现场条件调整。</p><Button block type="primary" onClick={()=>setSettings(false)}>保存条件</Button></Drawer>
  <Drawer title="沿线补能安排" open={facilityOpen} onClose={()=>setFacilityOpen(false)} size={560} footer={<Button type="primary" block loading={busy} disabled={!stations.length} onClick={async()=>{setFacilityOpen(false);await solve();}}>按所选补能点重算路线</Button>}>
   <p className="regional-muted">候选地点可纳入道路重算；工位余量、车型适配与实际价格须核验。</p>
   <div className="regional-station-list">{visibleStations.map(s=><label key={s.id}><Checkbox disabled={stations.length>=12&&!stations.includes(s.id)} checked={stations.includes(s.id)} onChange={e=>{setStations(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id));setChanged(true);}}/><div><b>{s.name}</b><p>{s.address||s.city} · 沿线约{format(s.at_km)}km</p><span>{s.mode} · 重卡适配待核验</span></div></label>)}</div>
   {!visibleStations.length&&<Empty description="暂未查询到可核验的沿线补能设施"/>}
   {!!metrics?.planned_stops.length&&<><h3>需落实的补能位置</h3><div className="regional-planned-stops">{metrics.planned_stops.map(s=><div key={s.id}><Zap size={15}/><b>{s.name}</b><span>补能需求点</span></div>)}</div></>}
   {!!metrics?.charging_stops.length&&<><h3>所选补能顺序</h3>{metrics.charging_stops.map(s=><p key={s.id}>{s.name} · 预计到达电量{format(s.arrival_soc)}%</p>)}</>}
  </Drawer>
  <Drawer title="数据依据与测算口径" open={sources} onClose={()=>setSources(false)} size={560}><div className="regional-source-list">{(result?.sources||catalog?.sources||[]).map(s=><article key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title} <ExternalLink size={12}/></a><small>{s.publisher} · {s.published_at||'网页资料'} · 核查于{s.fetched_at}</small><p>{s.facts}</p></article>)}</div><h3>公开重卡补能设施</h3>{catalog?.facilities.map(s=><p className="regional-muted" key={s.id}>{s.name} · {s.city} · <a href={catalog.sources.find(r=>r.id===s.source_id)?.url} target="_blank" rel="noreferrer">查看公开依据</a></p>)}{result?.limitations.map(x=><p className="regional-muted" key={x}>{x}</p>)}<p className="regional-muted">{metrics?.cost_scope}</p></Drawer>
  <Drawer title="选择运输订单" open={ordersOpen} onClose={()=>setOrdersOpen(false)} size={560}>{a.boot.orders.filter(o=>o.status==='已确认').map(o=><button className="regional-order-row" key={o.id} onClick={()=>applyOrder(o)}><b>{o.code}</b><span>{o.origin} → {o.destination}</span><small>{format(o.quantity_kg/1000)}吨</small></button>)}{!a.boot.orders.some(o=>o.status==='已确认')&&<Empty description="暂无已确认运输订单，可直接填写运输条件"/>}</Drawer>
  <AgentContextSync context={{capability:'SIMULATION',owner_id:result?.owner_id||boundOrder?.owner_id||a.user.scopes[0],...(result?{context_resource:'regional-plans',context_id:result.id}:{}),draft:{...(inputs.quantity?{quantity:inputs.quantity}:{}),cargo:inputs.cargo,...(inputs.origin.name?{origin:inputs.origin}:{}),...(inputs.destination.name?{destination:inputs.destination}:{}),page_context:{page:'simulation',title:'交能推演',summary:JSON.stringify({selected,metrics}).slice(0,2000)}}}}/>
 </div>;
}
