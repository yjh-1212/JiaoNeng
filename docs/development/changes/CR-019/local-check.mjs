import {chromium} from "file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import fs from "node:fs";
import assert from "node:assert/strict";
const out=process.env.SAFETY_LOCAL_OUTPUT||"docs/development/changes/CR-019/",errors=[],responses=[];
const browser=await chromium.launch({headless:false}),p=await browser.newPage({viewport:{width:1680,height:1050}});
p.on("pageerror",e=>errors.push(e.message));
p.on("response",r=>{const u=new URL(r.url());if(u.origin==="http://127.0.0.1:3100"&&u.pathname.startsWith("/api/safety/"))responses.push({path:u.pathname,status:r.status()});});
try{
 await p.goto("http://127.0.0.1:3100/");
 await p.getByLabel("登录账号",{exact:true}).fill("admin");await p.getByLabel("登录密码",{exact:true}).fill("JiaoNeng2026!");
 await p.getByRole("button",{name:"登录",exact:true}).click();await p.getByRole("heading",{name:"运营总览",exact:true}).waitFor();
 await p.evaluate(()=>location.hash="monitoring");await p.getByRole("heading",{name:"运行监控",exact:true}).waitFor();
 await p.getByLabel("监控关键词",{exact:true}).fill("甘M·仿004");await p.getByRole("button",{name:"查询",exact:true}).click();
 await p.locator(".safety-object-detail").getByText("RW-当前-001",{exact:true}).waitFor();
 let mapReady=false;
 try{await p.waitForFunction(()=>!!document.querySelector(".safety-map-host canvas")&&!document.querySelector(".safety-map-message"),{},{timeout:25000});mapReady=true;}catch{}
 const routePoints=await p.locator(".safety-map-host").getAttribute("data-route-points");
 await p.waitForTimeout(1500);
 const layout=await p.evaluate(()=>{
   const rect=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
   const ancestors=[];let el=document.querySelector(".safety-map");for(let i=0;i<5&&el;i++,el=el.parentElement){const c=getComputedStyle(el);ancestors.push({cls:el.className,height:c.height,position:c.position,display:c.display});}
   return {workspace:rect(".safety-monitor-workspace"),map:rect(".safety-map"),host:rect(".safety-map-host"),left:rect(".safety-object-panel"),right:rect(".safety-object-detail"),ancestors};
 });
 fs.writeFileSync(out+"layout.json",JSON.stringify(layout,null,2));
 await p.screenshot({path:out+"layout-check.png",fullPage:true});
 assert.equal(Math.round(layout.map.width),1680);
 assert(Math.abs(layout.map.height-layout.workspace.height)<=1);
 assert(Math.abs(layout.host.height-layout.map.height)<=1);
 assert(layout.left.x>layout.map.x&&layout.left.x+layout.left.width<layout.map.width/2);
 assert(layout.right.x>layout.map.width/2);
 await p.screenshot({path:out+"local-monitoring.png",fullPage:true});
 await p.evaluate(()=>location.hash="alerts");await p.getByRole("heading",{name:"异常处置",exact:true}).waitFor();
 await p.locator(".safety-list-panel .ant-table-tbody tr[data-row-key]").first().waitFor();
 await p.getByRole("button",{name:"受理 / 查看",exact:true}).first().click();
 await p.locator(".safety-incident-drawer .safety-source").waitFor();
 await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
 await p.screenshot({path:out+"local-incidents.png",fullPage:true});
 assert.equal(errors.length,0);assert(responses.every(r=>r.status===200));
 fs.writeFileSync(out+"local-browser.json",JSON.stringify({status:"PASS",map_ready:mapReady,planned_road_route_points:Number(routePoints||0),layout,responses,errors,readonly_business:true,external_model_calls:0},null,2));
}finally{await browser.close();}
const before=new DatabaseSync("data/backups/jiaoneng-pre-cr019.sqlite",{readOnly:true}),after=new DatabaseSync("data/jiaoneng.sqlite",{readOnly:true}),tables={};
for(const table of ["organizations","drivers","vehicles","stations","devices","demands","orders","tasks","trips","simulations","charging","sessions","costs","alerts","records","telemetry","events"]){
 const a=before.prepare("SELECT * FROM "+table+" ORDER BY id").all(),b=after.prepare("SELECT * FROM "+table+" ORDER BY id").all();
 assert.deepEqual(b,a,table+"业务记录被改变");
 const hash=createHash("sha256").update(JSON.stringify(a)).digest("hex");tables[table]={rows:a.length,sha256:hash,status:"UNCHANGED"};
}
before.close();after.close();
fs.writeFileSync(out+"local-preservation.json",JSON.stringify({status:"PASS",tables},null,2));
console.log(JSON.stringify({business_tables_preserved:Object.keys(tables).length,status:"PASS"}));
