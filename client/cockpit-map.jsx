import React,{useEffect,useRef,useState} from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import {Layers,LocateFixed,Plus,Minus,RefreshCw} from 'lucide-react';
import {request} from './api';

export default function CockpitMap({data,selection,onSelect}){
 const host=useRef(),map=useRef(),api=useRef(),overlays=useRef([]),callback=useRef(onSelect),hasFit=useRef(false),[generation,setGeneration]=useState(0),[attempt,setAttempt]=useState(0),[ready,setReady]=useState(false),[error,setError]=useState(''),[roads,setRoads]=useState([]),[routeErrors,setRouteErrors]=useState(0),[layers,setLayers]=useState({routes:true,stations:true,vehicles:true});callback.current=onSelect;
 const padding=()=>{const w=host.current?.clientWidth||1600,side=Math.min(370,Math.max(250,w*.205));return[45,side+32,125,side+32];};
 const fit=()=>{if(overlays.current.length)map.current?.setFitView(overlays.current,true,padding(),11);else{map.current?.setZoomAndCenter(8,[107.4,35.9]);}};
 useEffect(()=>{
  let live=true,instance,observer;setReady(false);setError('');hasFit.current=false;
  const timer=setTimeout(()=>{if(live)setError('地图加载超时，请重试');},22000);
  request('/api/maps/config').then(c=>{if(!live)return;window._AMapSecurityConfig={serviceHost:c.serviceHost};return AMapLoader.load({key:c.key,version:'2.0',plugins:['AMap.Scale']});}).then(A=>{
   if(!live||!A)return;api.current=A;if(A.getConfig)A.getConfig().appname='amap-jsapi-skill';
   instance=new A.Map(host.current,{viewMode:'2D',pitch:0,rotation:0,rotateEnable:false,pitchEnable:false,zoom:8,center:[107.4,35.9],mapStyle:'amap://styles/blue',showIndoorMap:false,features:['bg','road','point'],resizeEnable:true});map.current=instance;
   instance.addControl(new A.Scale({position:'LB',offset:new A.Pixel(12,12)}));
   instance.on('complete',()=>{if(live){clearTimeout(timer);setReady(true);setError('');}});
   observer=new ResizeObserver(()=>instance?.resize());observer.observe(host.current);setGeneration(n=>n+1);
  }).catch(()=>{if(live){clearTimeout(timer);setError('地图暂不可用，请重试');}});
  return()=>{live=false;clearTimeout(timer);observer?.disconnect();instance?.destroy();if(map.current===instance)map.current=null;};
 },[attempt]);
 const routeKey=JSON.stringify(data.corridors.map(l=>[l.order_id,l.origin_coords,l.destination_coords]));
 useEffect(()=>{let live=true;setRouteErrors(0);setRoads([]);Promise.allSettled(data.corridors.filter(l=>l.origin_coords&&l.destination_coords).map(async l=>({...l,...await request('/api/maps/route?'+new URLSearchParams({order_id:l.order_id}))}))).then(results=>{if(!live)return;setRoads(results.filter(r=>r.status==='fulfilled'&&r.value.coordinates?.length>2).map(r=>r.value));setRouteErrors(results.filter(r=>r.status==='rejected').length);});return()=>{live=false;};},[routeKey,attempt]);
 const incident=selection?.kind==='alert'?data.incidents.find(i=>i.id===selection.id):null;
 const lineId=selection?.kind==='order'?selection.id:selection?.kind==='task'?data.priority_tasks.find(t=>t.id===selection.id)?.order_id:incident?.task_id?data.corridors.find(l=>l.task_ids.includes(incident.task_id))?.order_id:null;
 const geometryKey=JSON.stringify({roads:roads.map(r=>[r.order_id,r.coordinates]),stations:data.energy.stations,positions:data.positions,layers,lineId});
 useEffect(()=>{
  const m=map.current,A=api.current;if(!m||!A)return;
  const list=[],addMarker=(position,text,label,kind,id)=>{const el=document.createElement('button');el.type='button';el.className='jn-cockpit-pin '+kind;el.textContent=text;el.title=label;el.setAttribute('aria-label',label);el.onclick=()=>callback.current?.({kind,id});const marker=new A.Marker({position,content:el,anchor:'center',zIndex:160});list.push(marker);};
  if(layers.routes)for(const r of roads){const selected=!lineId||lineId===r.order_id;const line=new A.Polyline({path:r.coordinates,strokeColor:r.alerts?'#efb85a':'#49baff',strokeWeight:lineId===r.order_id?6:4,strokeOpacity:selected?.9:.2,showDir:true,lineJoin:'round',zIndex:selected?100:60});line.on('click',()=>callback.current?.({kind:'order',id:r.order_id}));list.push(line);if(selected){addMarker(r.coordinates[0],'起',r.origin,'order',r.order_id);addMarker(r.coordinates.at(-1),'终',r.destination,'order',r.order_id);}}
  if(layers.stations)for(const s of data.energy.stations){if(Number.isFinite(s.longitude)&&Number.isFinite(s.latitude))addMarker([s.longitude,s.latitude],'⚡',s.name,'station',s.id);}
  if(layers.vehicles)for(const v of data.positions)addMarker([v.longitude,v.latitude],'车',v.code,'vehicle',v.id);
  m.add(list);overlays.current=list;host.current.dataset.routePoints=String(roads.reduce((n,r)=>n+r.coordinates.length,0));host.current.dataset.vehicles=String(layers.vehicles?data.positions.length:0);
  if(ready&&!hasFit.current&&list.length){fit();hasFit.current=true;}
  return()=>{if(map.current===m)m.remove(list);};
 },[generation,geometryKey,ready]);
 useEffect(()=>{
  const m=map.current;if(!m||!ready||!selection)return;
  if(selection.kind==='station'||(selection.kind==='alert'&&incident?.station_id&&!lineId)){const s=data.energy.stations.find(s=>s.id===(incident?.station_id||selection.id));if(s)m.setZoomAndCenter(10,[s.longitude,s.latitude]);}
  else if(selection.kind==='vehicle'){const v=data.positions.find(v=>v.id===selection.id);if(v)m.setZoomAndCenter(12,[v.longitude,v.latitude]);}
  else if(lineId){const r=roads.find(r=>r.order_id===lineId);if(r&&api.current){const line=new api.current.Polyline({path:r.coordinates});m.setFitView([line],true,padding(),12);}}
 },[selection?.kind,selection?.id,generation,roads,ready]);
 return <>
  <div ref={host} className="jn-cockpit-map" data-view-mode="2D" data-ready={ready?'true':'false'} aria-label="交能运输与补能二维地图"/>
  <div className="jn-cockpit-map-tools"><span><Layers size={15}/> 图层</span>{[['routes','运输线路'],['stations','补能场站'],['vehicles','车辆位置']].map(([key,label])=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}</div>
  <div className="jn-cockpit-zoom"><button aria-label="放大地图" onClick={()=>map.current?.zoomIn()}><Plus size={17}/></button><button aria-label="缩小地图" onClick={()=>map.current?.zoomOut()}><Minus size={17}/></button><button aria-label="恢复全局视角" onClick={()=>{onSelect(null);fit();}}><LocateFixed size={17}/></button></div>
  {(!ready||error)&&<div className="jn-cockpit-map-state" role="status">{error||'正在加载高德地图…'}{error&&<button onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={14}/>重试</button>}</div>}
  <div className="jn-cockpit-map-legend"><span><i className="line"/>运输线路</span><span><i className="dot"/>补能场站</span><span><i className="warn"/>关联预警</span><small>{data.resources.unlocated_vehicles} 辆定位待接入</small>{routeErrors>0&&<button onClick={()=>setAttempt(n=>n+1)}>部分道路待获取 · 重试</button>}</div>
 </>;
}
