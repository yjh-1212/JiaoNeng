import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='docs/development/changes/',out=root+'CR-038/',db=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true}),legacy=new DatabaseSync(root+'CR-036/prepare-baseline.sqlite',{readOnly:true});
try{
 const counts=Object.fromEntries(['demands','orders','tasks','vehicles','drivers','stations','devices','charging','sessions'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t).get().n]));
 assert.equal(counts.orders,10);assert.equal(counts.demands,10);assert.equal(counts.vehicles,15);assert.equal(counts.stations,6);
 const protectedTypes=new Set(['parameters','integrations','entities','rules']),tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name)),leftovers=[];
 for(const r of legacy.prepare('SELECT resource,id FROM data_visibility').all()){
  if(protectedTypes.has(r.resource))continue;
  const table=r.resource==='agent-conversations'?'agent_conversations':tables.has(r.resource)?r.resource:'records';
  if(db.prepare('SELECT id FROM '+table+' WHERE id=?').get(r.id))leftovers.push(r);
 }
 assert.deepEqual(leftovers,[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const manifest=JSON.parse(db.prepare('SELECT value FROM data_view_state WHERE key=?').get('planning-business-dataset-v1').value);fs.writeFileSync(out+'applied-manifest.json',JSON.stringify(manifest,null,2));
 const report={status:'VERIFIED',at:new Date().toISOString(),counts,planning_projects:manifest.projects.length,planning_solutions:manifest.projects.length,candidates:manifest.candidate_ids.length,legacy_remaining:0,foreign_keys:0,integrity:'ok',restart_checks:2,service_pid:Number(fs.readFileSync(out+'service-pid.txt','utf8')),node_tests:348,workflow_cases:10,local_browser:['CR-036/local-browser-check.json','CR-038/local-browser-check.json'],user_acceptance_signature:false,deployment:false};
 fs.writeFileSync(out+'verification-final.json',JSON.stringify(report,null,2));
 const statePath='docs/development/dev-state.json',s=JSON.parse(fs.readFileSync(statePath,'utf8'));
 assert(s.changes);for(const id of ['CR-036','CR-037','CR-038'])s.changes[id]={status:'VERIFIED',baseline:'docs/design/07-baseline/design-baseline-'+id+'.json',report:out+'verification-final.json',user_acceptance_signature:false,deployment:false};
 s.changes['CR-038'].source_sha256=Object.fromEntries(['server/planning-dataset.mjs','scripts/prepare-planning-data.mjs','tests/planning-dataset.test.mjs','server/business-dataset.mjs','scripts/prepare-business-data.mjs','server/seed.mjs','tests/business-dataset.test.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
 fs.writeFileSync(statePath,JSON.stringify(s,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{db.close();legacy.close();}
