import fs from 'node:fs';
import {loadConfig} from '../../../../server/config.mjs';
const c=loadConfig();
const queries=['甘肃省庆阳市正宁县核桃峪煤矿','甘肃省庆阳市正宁县新庄煤矿','甘肃省庆阳市正宁县华能正宁电厂','甘肃省庆阳市宁县长庆桥镇','甘肃省庆阳市西峰区彭原镇','甘肃省庆阳市环县曲子镇','甘肃省庆阳市环县甜水镇','甘肃省平凉市泾川县','陕西省咸阳市彬州市','宁夏回族自治区固原市'];
const rows=[];
for(const address of queries){
 const u=new URL('https://restapi.amap.com/v3/place/text');u.search=new URLSearchParams({key:c.amapService||c.amapKey,keywords:address,offset:'3'});
 const r=await fetch(u,{signal:AbortSignal.timeout(15000)}),j=await r.json();
 if(j.status!=='1')throw new Error('地点查询失败：'+j.info);
 rows.push({query:address,pois:j.pois,fetched_at:new Date().toISOString()});
 await new Promise(r=>setTimeout(r,700));
}
fs.writeFileSync('docs/development/changes/CR-034/public-poi-lookup.json',JSON.stringify(rows,null,2));
console.log(rows.map(r=>({query:r.query,pois:r.pois.map(p=>({name:p.name,location:p.location,address:p.address}))})));
