import React from 'react';
import {Checkbox,Select,Button} from 'antd';
import {MapPin,Route,Zap} from 'lucide-react';
import {format} from './ui';

export default function ScenarioRoutePlanner({inputs,stations,plan,busy,locked,onChange,focused,onFocus}){
 const used=new Set(plan?.vehicles.flatMap(v=>v.nodes.filter(n=>n.kind==='charge').map(n=>n.station_id))||[]);
 return <aside className="goal-route-planner" aria-label="路径与补能规划">
  <header><Route size={17}/><strong>路径与补能</strong><span>庆阳及周边</span></header>
  <div className="goal-route-strategy"><label htmlFor="goal-road-strategy">道路策略</label><Select id="goal-road-strategy" aria-label="道路策略" value={inputs.route_strategy||32} disabled={busy||locked} options={[{value:32,label:'推荐路线'},{value:34,label:'高速优先'},{value:36,label:'少收费'}]} onChange={v=>onChange('route_strategy',v)}/></div>
  <div className="goal-route-station-heading"><Zap size={14}/><b>沿途补能点</b><small>已选 {inputs.station_ids.length}/8</small></div>
  <div className="goal-route-stations">{stations.map(s=><div key={s.id} className={'goal-route-station '+(focused===s.id?'focused':'')}>
   <div><Checkbox aria-label={'选择'+s.name} disabled={busy||locked||inputs.station_ids.length>=8&&!inputs.station_ids.includes(s.id)} checked={inputs.station_ids.includes(s.id)} onChange={e=>onChange('station_ids',e.target.checked?[...inputs.station_ids,s.id]:inputs.station_ids.filter(id=>id!==s.id))}/><button onClick={()=>onFocus(s.id)}><b>{s.name}</b><span>{s.city||s.address||'线路沿途'}{used.has(s.id)&&<em>方案补能点</em>}</span></button><Button type="text" size="small" aria-label={'定位'+s.name} icon={<MapPin size={13}/>} onClick={()=>onFocus(s.id)}/></div>
   <p>{s.mode} · {s.slots}工位 · {format(s.power_kw)}kW</p>
   <small>{s.planning_only?'按规划参数测算':s.status} · {s.price_curve?.length?'分时电价':'电价待核对'}</small>
  </div>)}</div>
  {!stations.length&&<p className="goal-route-no-station">当前线路附近暂无补能点，可在地图选择位置后调整路线。</p>}
  <footer>选点后重新推演，更新路线、车辆时间轴与费用。</footer>
 </aside>;
}
