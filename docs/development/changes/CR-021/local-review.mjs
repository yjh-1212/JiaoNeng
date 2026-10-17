import {chromium} from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3100',out='docs/development/changes/CR-021/';
const backup=new DatabaseSync(out+'pre-change.sqlite',{readOnly:true});
const db=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true});
const tables=['demands','orders','tasks','trips','simulations','vehicles','drivers','stations','devices','charging','sessions','costs','alerts','telemetry','events','organizations','records'];
const raw=(d,t)=>d.prepare('SELECT * FROM '+t+(t==='records'?" WHERE resource NOT IN('planning-projects','planning-solutions')":'')+' ORDER BY id').all();
const pre=tables.map(t=>raw(db,t));
const concurrentChanges=tables.flatMap(t=>{
  const old=new Map(raw(backup,t).map(r=>[r.id,r])),current=raw(db,t);
  return current.filter(r=>JSON.stringify(r)!==JSON.stringify(old.get(r.id))).map(r=>({table:t,id:r.id,previous_version:old.get(r.id)?.version??null,current_version:r.version??null,status:r.status??null}));
});
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'JiaoNeng2026!'})});
assert.equal(login.status,200);const auth=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':auth.csrf,...(body?{'Idempotency-Key':crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json();assert.equal(r.status,200,j.message);return j;}
let projects=await api('/api/planner/projects'),project=projects.items.find(p=>p.name==='北区煤运走廊规划（仿真）')||projects.items[0];let created=false;
if(!project){
  const o=await api('/api/planner/options'),d=await api('/api/planner/business?'+new URLSearchParams({owner_id:o.owner_id,start_date:o.defaults.start_date,finish_date:o.defaults.finish_date}));
  const quantity=d.daily_quantity>0?d.daily_quantity:o.defaults.daily_quantity,dist=d.corridors.filter(c=>c.distance_km),total=dist.reduce((s,l)=>s+l.quantity,0),distance=total?dist.reduce((s,l)=>s+l.quantity*l.distance_km,0)/total:o.defaults.distance_km;
  const sites=o.candidates.slice(0,20).map(p=>({candidate_id:p.id,station_id:p.id==='PL1'&&o.stations.some(s=>s.id==='S001')?'S001':null,supply_kw:p.capacity_kw??null,other_load_kw:0,land_verified:false,grid_verified:false,access_verified:false}));
  if(sites.length){const r=await api('/api/commands',{type:'planner.create',payload:{name:'北区煤运走廊规划（仿真）',owner_id:o.owner_id,start_date:o.defaults.start_date,finish_date:o.defaults.finish_date,conditions:{...o.defaults,daily_quantity:quantity,phase_one_quantity:quantity/2,distance_km:Math.round(distance*10)/10},sites,use_business:d.daily_quantity>0}});project=r.project;created=true;}
}
assert(project,'缺少可审核的规划项目');let detail=await api('/api/planner/projects/'+project.id);if(!detail.solutions.length)await api('/api/commands',{type:'planner.calculate',id:project.id,payload:{expected_version:project.version}});
const browser=await chromium.launch({headless:false}),page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
page.on('response',r=>{const u=new URL(r.url());if(/amap|autonavi/.test(u.hostname))network.push({host:u.hostname,path:u.pathname,status:r.status()});});
page.on('requestfailed',r=>{const u=new URL(r.url());if(/amap|autonavi/.test(u.hostname))network.push({host:u.hostname,path:u.pathname,error:r.failure()?.errorText});});
try{
  await page.goto(base);await page.getByLabel('登录账号',{exact:true}).fill('admin');await page.getByLabel('登录密码',{exact:true}).fill('JiaoNeng2026!');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'运营总览',exact:true}).first().waitFor();
  await page.evaluate(id=>{sessionStorage.setItem('planner-project-'+id.user,id.project);location.hash='planning';},{user:(await api('/api/auth/me')).user.id,project:project.id});
  await page.locator('.planning-recommendation h3').waitFor();await page.waitForFunction(()=>document.querySelector('.planning-map-host')?.dataset.mapReady==='true',{},{timeout:45000});
  await page.waitForFunction(()=>Number(document.querySelector('.planning-map-host')?.dataset.routePoints)>2,{},{timeout:45000});
  await page.waitForFunction(()=>{const h=document.querySelector('.planning-map-host'),p=document.querySelector('.planning-map-workbench');return h&&p&&Math.abs(h.clientHeight-p.clientHeight)<2;});
  await page.waitForFunction(()=>{const h=document.querySelector('.planning-map-host');return h?.querySelector('canvas')?.width>=h.clientWidth;});
  const map=await page.locator('.planning-map-host').evaluate(n=>({ready:n.dataset.mapReady,routePoints:Number(n.dataset.routePoints),width:n.clientWidth,height:n.clientHeight,zoom:n.dataset.zoom,canvas:n.querySelectorAll('canvas').length}));
  assert(map.ready==='true'&&map.canvas>0&&map.routePoints>2);
  await page.waitForTimeout(1800);
  await page.screenshot({path:out+'local-station-planning.png',fullPage:true});
  await page.getByRole('button',{name:'进入运力规划',exact:true}).click();await page.getByText('资源配置',{exact:true}).waitFor();await page.screenshot({path:out+'local-fleet-planning.png',fullPage:true});
  const after=tables.map(t=>raw(db,t));assert(JSON.stringify(after)===JSON.stringify(pre),'本次只读复核期间业务数据发生变化，需按审计核对');assert.deepEqual(errors,[]);
  const relatedAudits=db.prepare("SELECT action,entity_id,user_id,created_at FROM audit WHERE created_at>='2026-10-17T00:00:00Z' AND action IN('task.accept','task.start','trip.create')").all();
  fs.writeFileSync(out+'local-review.json',JSON.stringify({status:'PASS',project_id:project.id,created_simulated_project:created,project_reference_adopted:false,map,errors,network,preserved_tables:tables,in_run_business_unchanged:true,changes_since_initial_backup:concurrentChanges,related_existing_driver_actions:relatedAudits},null,2));console.log(JSON.stringify({status:'PASS',map,preserved_tables:tables.length,created_simulated_project:created,existing_concurrent_changes:concurrentChanges.length,network}));
}catch(e){await page.screenshot({path:out+'local-review-failure.png',fullPage:true});throw e;}finally{await browser.close();db.close();backup.close();}
