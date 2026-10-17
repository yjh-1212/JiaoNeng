import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {database,transaction,now} from '../server/db.mjs';
import {loadConfig} from '../server/config.mjs';
import {createRoadRouter} from '../server/maps.mjs';
import {buildBusinessDataset,DATASET_KEY} from '../server/business-dataset.mjs';
import {recordTypes} from '../server/repository.mjs';
const out=path.resolve('docs/development/changes/CR-036'),dbPath=path.resolve(process.env.DATABASE_PATH||'data/jiaoneng.sqlite');fs.mkdirSync(out,{recursive:true});
const applying=process.argv.includes('--apply'),main=new DatabaseSync(dbPath,{readOnly:true});
const installed=main.prepare('SELECT value FROM data_view_state WHERE key=?').get(DATASET_KEY);
if(installed){const m=JSON.parse(installed.value);const check=verify(main,m);if(applying)fs.writeFileSync(path.join(out,'applied.json'),JSON.stringify({status:'APPLIED',at:now(),idempotent_recheck:true,...check},null,2));console.log('业务数据已安装，10条业务与数据库完整性复核通过，无重复生成。');main.close();process.exit(0);}
const backupPath=path.join(out,'before-business-data.sqlite');if(!fs.existsSync(backupPath))await backup(main,backupPath);
const stagePath=path.join(out,'prepared.sqlite'),baselinePath=path.join(out,'prepare-baseline.sqlite');
if(!applying){for(const p of [stagePath,baselinePath])for(const suffix of ['','-wal','-shm']){const target=p+suffix;if(path.dirname(target)!==out)throw new Error('暂存路径越界');if(fs.existsSync(target))fs.unlinkSync(target);}await backup(main,stagePath);await backup(main,baselinePath);}
else if(!fs.existsSync(stagePath)||!fs.existsSync(baselinePath))throw new Error('缺少已验证的业务数据工作副本');
main.close();
const stage=database(stagePath);
const tables=stage.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
const snapshot=db=>Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
const baseline=new DatabaseSync(baselinePath,{readOnly:true}),before=snapshot(baseline);baseline.close();const legacy=stage.prepare('SELECT resource,id FROM data_visibility').all();
const columns=Object.fromEntries(tables.map(t=>[t,stage.prepare('PRAGMA table_info('+t+')').all()]));
const cachePath=path.join(out,'road-cache.json'),cache=fs.existsSync(cachePath)?JSON.parse(fs.readFileSync(cachePath,'utf8')):{};
const config=loadConfig(),router=createRoadRouter({key:config.amapService||config.amapKey});let networkCount=0;
const roadRoute=async(points,options={})=>{const key=JSON.stringify({points,strategy:options.strategy||32});if(cache[key])return cache[key];const r=await router(points,options);cache[key]=r;fs.writeFileSync(cachePath,JSON.stringify(cache));if(++networkCount%5===0)console.log('已核对道路段 '+networkCount);return r;};
function retireLegacy(db){
 const protectedTypes=new Set(['parameters','integrations','entities','rules']);
 const targets={};
 for(const row of legacy){if(protectedTypes.has(row.resource)||row.resource==='agent-conversations')continue;const t=recordTypes.includes(row.resource)?'records':row.resource;if(!tables.includes(t))continue;(targets[t]??=new Set()).add(row.id);}
 const oldTasks=targets.tasks||new Set(),oldTrips=targets.trips||new Set();
 for(const row of db.prepare('SELECT id,task_id,trip_id FROM events').all())if(oldTasks.has(row.task_id)||oldTrips.has(row.trip_id))(targets.events??=new Set()).add(row.id);
 const targetIds=new Set(Object.values(targets).flatMap(ids=>[...ids]));
 const mentions=value=>typeof value==='string'?targetIds.has(value):Array.isArray(value)?value.some(mentions):value&&typeof value==='object'?Object.values(value).some(mentions):false;
 for(const row of db.prepare('SELECT user_id,command_key,response FROM command_results').all())if(mentions(JSON.parse(row.response)))db.prepare('DELETE FROM command_results WHERE user_id=? AND command_key=?').run(row.user_id,row.command_key);
 const oldConversations=new Set(legacy.filter(r=>r.resource==='agent-conversations').map(r=>r.id));for(const id of oldConversations){db.prepare('DELETE FROM agent_turns WHERE conversation_id=?').run(id);db.prepare('DELETE FROM agent_conversations WHERE id=?').run(id);}
 db.exec('PRAGMA defer_foreign_keys=ON');
 for(const [t,ids] of Object.entries(targets)){const stmt=db.prepare('DELETE FROM '+t+' WHERE id=?');for(const id of ids)stmt.run(id);}
 for(const row of legacy)if(!protectedTypes.has(row.resource))db.prepare('DELETE FROM data_visibility WHERE resource=? AND id=?').run(row.resource,row.id);
 return Object.fromEntries(Object.entries(targets).map(([t,ids])=>[t,ids.size]));
}
function verify(db,manifest){
 const fk=db.prepare('PRAGMA foreign_key_check').all();if(fk.length)throw new Error('外键检查失败 '+JSON.stringify(fk));if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('数据库完整性失败');
 for(const c of manifest.cases){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(c.order_id),d=db.prepare('SELECT * FROM demands WHERE id=?').get(c.demand_id);if(!o||!d||o.demand_id!==d.id||o.quantity_kg!==c.quantity*1000)throw new Error('需求订单关联不符');if(o.status!=='草稿'&&d.allocated_kg!==o.quantity_kg)throw new Error('需求分配量不符');const tasks=db.prepare('SELECT * FROM tasks WHERE order_id=?').all(o.id);if(tasks.reduce((n,t)=>n+t.quantity_kg,0)>o.quantity_kg)throw new Error('任务超量');for(const t of tasks){const v=db.prepare('SELECT * FROM vehicles WHERE id=?').get(t.vehicle_id),driver=db.prepare('SELECT * FROM drivers WHERE id=?').get(t.driver_id);if(v.driver_id!==driver.id||v.owner_id!==o.owner_id||driver.owner_id!==o.owner_id)throw new Error('车司机绑定不符');if(t.verified_kg>t.reported_kg||t.reported_kg>t.quantity_kg)throw new Error('任务交付量不符');}}
 return{status:'PASS',cases:manifest.cases.length,foreign_keys:fk.length,integrity:'ok'};
}
try{
 const manifest=await buildBusinessDataset(stage,roadRoute,{onProgress:console.log});
 const retired=applying?JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8')).retired:transaction(stage,()=>retireLegacy(stage));const check=verify(stage,manifest),manifestChecksum=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
 const after=snapshot(stage),delta={};
 for(const t of tables){const pk=columns[t].filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);if(!pk.length)continue;const key=r=>JSON.stringify(pk.map(k=>r[k])),old=new Map(before[t].map(r=>[key(r),r])),fresh=new Map(after[t].map(r=>[key(r),r]));delta[t]={pk,added:after[t].filter(r=>!old.has(key(r))),updated:after[t].filter(r=>old.has(key(r))&&JSON.stringify(r)!==JSON.stringify(old.get(key(r)))).map(row=>({before:old.get(key(row)),after:row})),deleted:before[t].filter(r=>!fresh.has(key(r)))};}
 fs.writeFileSync(path.join(out,'dataset-manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({...check,retired,backup:backupPath,delta:Object.fromEntries(Object.entries(delta).map(([t,d])=>[t,{added:d.added.length,updated:d.updated.length,deleted:d.deleted.length}]))},null,2));
 // Delta contains local credential hashes; keep it only in a SQLite working copy, not a JSON export.
 fs.writeFileSync(path.join(out,'apply-plan.json'),JSON.stringify({database:dbPath,staging:stagePath,backup:backupPath,manifest_checksum:manifestChecksum,prepared_at:new Date().toISOString(),expected:check,status:'PREPARED'},null,2));
 if(applying){
  if(!fs.existsSync(path.join(out,'workflow-verification.json'))||JSON.parse(fs.readFileSync(path.join(out,'workflow-verification.json'),'utf8')).status!=='PASS')throw new Error('先完成独立完整流程验证，再执行应用');
  if(JSON.parse(fs.readFileSync(path.join(out,'workflow-verification.json'),'utf8')).manifest_checksum!==manifestChecksum)throw new Error('验证结果不是本次准备的数据，停止应用');
  const dest=database(dbPath);try{transaction(dest,()=>{dest.exec('PRAGMA defer_foreign_keys=ON');for(const[t,d]of Object.entries(delta)){const where=d.pk.map(k=>k+'=?').join(' AND ');for(const old of [...d.deleted,...d.updated.map(u=>u.before)]){const current=dest.prepare('SELECT * FROM '+t+' WHERE '+where).get(...d.pk.map(k=>old[k]));if(JSON.stringify(current)!==JSON.stringify(old))throw new Error('业务数据在准备后已变化：'+t+'，停止应用');}for(const row of d.deleted)dest.prepare('DELETE FROM '+t+' WHERE '+where).run(...d.pk.map(k=>row[k]));for(const u of d.updated){const cols=Object.keys(u.after);dest.prepare('UPDATE '+t+' SET '+cols.map(k=>k+'=?').join(',')+' WHERE '+where).run(...cols.map(k=>u.after[k]),...d.pk.map(k=>u.before[k]));}for(const row of d.added){const cols=Object.keys(row);dest.prepare('INSERT INTO '+t+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...cols.map(k=>row[k]));}}verify(dest,manifest);});console.log('10条运输业务已写入，旧数据已按清单清理。');fs.writeFileSync(path.join(out,'applied.json'),JSON.stringify({status:'APPLIED',at:now(),...verify(dest,manifest),retired},null,2));}finally{dest.close();}
 }else console.log('已在独立数据库准备10条业务链，主库尚未修改。');
}finally{stage.close();}
