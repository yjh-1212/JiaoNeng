// Location anchors are from AMap POI/geocoding, checked 2026-10-17.
// Facility capacities/prices are planning inputs, never live operating telemetry.
const point=(name,lng,lat)=>({name,lng,lat});
export const qingyangPresets=[
 {id:'hty-zn',label:'核桃峪 → 正宁',quantity:600,cargo:'煤炭',hours:10,vehicles:4,origin:point('核桃峪煤矿副立井',108.011215,35.295782),destination:point('正宁电厂基建指挥部',107.982475,35.265975),stations:['QP-ZN']},
 {id:'xz-cqq',label:'新庄 → 长庆桥',quantity:600,cargo:'煤炭',hours:12,vehicles:6,origin:point('庆阳新庄煤业有限公司',107.898491,35.287117),destination:point('宁县长庆桥镇',107.747780,35.333339),stations:['QP-ZN','QP-CQQ']},
 {id:'cqq-jc',label:'长庆桥 → 泾川',quantity:300,cargo:'煤炭',hours:12,vehicles:8,origin:point('宁县长庆桥镇',107.747780,35.333339),destination:point('平凉市泾川县',107.367608,35.332992),stations:['QP-CQQ','QP-JC']},
 {id:'qy-bz',label:'庆阳 → 彬州',quantity:180,cargo:'砂石骨料',hours:12,vehicles:8,origin:point('庆阳市西峰区彭原镇',107.612616,35.779468),destination:point('陕西省彬州市',108.081892,35.035702),stations:['QP-XF','QP-CQQ','QP-ZN']},
 {id:'qx-gy',label:'环县 → 固原',quantity:120,cargo:'煤炭',hours:12,vehicles:8,origin:point('环县曲子镇',107.515730,36.297510),destination:point('宁夏固原市',106.242670,36.016280),stations:['QP-QZ','QP-GY']},
];
const facility=(id,name,longitude,latitude,city,slots,power_kw)=>({id,name,longitude,latitude,city,slots,power_kw,mode:'充电',status:'规划测算',source:'PLANNING_PARAMETER',planning_only:true,version:1,occupied:0,device_versions:[],window:'00:00-24:00',service_minutes:45,price_curve:Array.from({length:24},(_,hour)=>({hour,electricity:hour<7?.38:hour>=17&&hour<22?.95:.65,service:.35})),source_note:'区域位置锚点来自地图查询；工位、功率、电价为可调整的规划参数，未作为已投运场站登记。'});
export const qingyangFacilities=[
 facility('QP-ZN','正宁周家补能点',107.985,35.279,'庆阳正宁',6,360),
 facility('QP-CQQ','长庆桥补能点',107.747780,35.333339,'庆阳宁县',8,360),
 facility('QP-XF','西峰北补能点',107.612616,35.779468,'庆阳西峰',8,480),
 facility('QP-QZ','环县曲子补能点',107.515730,36.297510,'庆阳环县',6,360),
 facility('QP-JC','泾川补能点',107.367608,35.332992,'平凉泾川',6,360),
 facility('QP-GY','固原东补能点',106.260,36.025,'宁夏固原',6,480),
];
export const qingyangSources=[
 {title:'宁县长庆桥工业集中区',publisher:'甘肃政务服务网',url:'https://zwfw.gansu.gov.cn/qingyang/tsfw/qyrzyqzq/qyrylc/nxcqqgyjzq/art/2023/art_14a100704e0746de82993819974f495a.html',facts:'核实长庆桥煤电化产业集聚及庆阳、平凉、咸阳区位关系；不代表本次运量或运输合同。'},
 {title:'庆阳市现代流通战略支点城市建设方案',publisher:'庆阳市人民政府',url:'https://zgqingyang.gov.cn/gk/zfxxgk/zfgb35zwgkb/content_23387',facts:'核实煤炭物流、宁县货运中心及矿区转运业务背景。'},
];
export function corridorFacilities(origin,destination,facilities=qingyangFacilities){
 if(!Number.isFinite(origin?.lng)||!Number.isFinite(destination?.lng))return facilities;
 const scale=Math.cos((origin.lat+destination.lat)*Math.PI/360),a=[origin.lng*scale,origin.lat],b=[destination.lng*scale,destination.lat],dx=b[0]-a[0],dy=b[1]-a[1];
 return facilities.map(s=>{const p=[s.longitude*scale,s.latitude],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)*111;return{...s,corridor_distance_km:distance};}).filter(s=>s.corridor_distance_km<=35).sort((a,b)=>a.corridor_distance_km-b.corridor_distance_km);
}
