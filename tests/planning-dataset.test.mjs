import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {installDataVisibility} from '../server/data-visibility.mjs';
import {buildBusinessDataset,datasetActor} from '../server/business-dataset.mjs';
import {buildPlanningDataset,verifyPlanningDataset} from '../server/planning-dataset.mjs';
import {planningDetail,planningHandoff} from '../server/planning-workspace.mjs';
const road=async([a,z])=>({coordinates:[a,[(a[0]+z[0])/2+.0001,(a[1]+z[1])/2],z],distance_m:20000,duration_s:1800,source:'ISOLATED_TEST_DOUBLE'});
test('CR38 planning snapshots reference valid orders, conserve daily quantity, size real inventory, and hand off without creating tasks',async()=>{
 const db=database(':memory:');try{
  seed(db);installDataVisibility(db);const business=await buildBusinessDataset(db,road),admin=datasetActor(db),before=db.prepare('SELECT count(*) n FROM tasks').get().n;
  const m=buildPlanningDataset(db),v=verifyPlanningDataset(db,m);assert.equal(v.status,'PASS');assert.equal(m.projects.length,2);assert.equal(m.candidate_ids.length,6);
  for(const p of m.projects){const {project,solutions}=planningDetail(db,admin,p.id),s=solutions[0],snap=s.business_snapshot;
   assert.equal(snap.refs.length,9);assert(!snap.refs.some(r=>r.id===business.cases[0].order_id));assert(Math.abs(snap.daily_quantity*snap.days-snap.quantity_tonnes)<.01);
   assert.equal(project.conditions.daily_quantity,snap.daily_quantity);assert(snap.refs.every(r=>business.cases.some(c=>c.order_id===r.id)));assert.equal(s.inventory.vehicles.length,12);
   assert(s.sites.every(x=>x.supply_kw===null&&x.unknown.includes('接电')&&x.status==='待核实'));assert.equal(s.engineering_approved,false);assert.equal(s.source,'ESTIMATED');
   const h=planningHandoff(db,admin,s.id);assert.equal(h.vehicles,s.fleet.vehicles);assert(business.cases.some(c=>c.order_id===h.corridor.order_id));
  }
  const count=db.prepare('SELECT count(*) n FROM records').get().n;assert.deepEqual(buildPlanningDataset(db),m);assert.equal(db.prepare('SELECT count(*) n FROM records').get().n,count);assert.equal(db.prepare('SELECT count(*) n FROM tasks').get().n,before);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});
test('CR38 planning installer refuses to invent business when transport dataset is absent',()=>{
 const db=database(':memory:');try{seed(db);installDataVisibility(db);const before=db.prepare('SELECT count(*) n FROM records').get().n;assert.throws(()=>buildPlanningDataset(db),/先安装运输/);assert.equal(db.prepare('SELECT count(*) n FROM records').get().n,before);}finally{db.close();}
});
