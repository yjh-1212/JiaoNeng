import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../server/db.mjs';
import {seed} from '../server/seed.mjs';
import {installDataVisibility} from '../server/data-visibility.mjs';
import {buildBusinessDataset,datasetActor} from '../server/business-dataset.mjs';
import {bootstrap,get} from '../server/repository.mjs';
const route=async([a,z])=>({coordinates:[a,[(a[0]+z[0])/2+.0001,(a[1]+z[1])/2],z],distance_m:1000,duration_s:120,source:'ISOLATED_TEST_DOUBLE'});
test('CR36 generated business chains conserve quantities, preserve original user credentials/scopes, remain visible and install idempotently',async()=>{
 const db=database(':memory:');try{seed(db);installDataVisibility(db);const original=db.prepare('SELECT id,username,password_hash,role,operations FROM users').all(),scopes=db.prepare('SELECT * FROM user_scopes ORDER BY user_id,owner_id').all();const m=await buildBusinessDataset(db,route);assert.equal(m.cases.length,10);assert.equal(m.drivers.length,15);assert.equal(m.vehicles.length,15);assert.equal(m.stations.length,6);
 for(const c of m.cases){const o=get(db,datasetActor(db),'orders',c.order_id),d=get(db,datasetActor(db),'demands',c.demand_id);assert.equal(o.quantity_kg,c.quantity*1000);assert.equal(o.demand_id,d.id);assert.equal(d.allocated_kg,o.status==='草稿'?0:o.quantity_kg);assert(c.start_at<c.finish_at);}
 const again=await buildBusinessDataset(db,route);assert.deepEqual(again.created,m.created);const userRows=db.prepare('SELECT id,username,password_hash,role,operations FROM users').all();for(const u of original)assert.deepEqual(userRows.find(x=>x.id===u.id),u);for(const s of scopes)assert(db.prepare('SELECT 1 FROM user_scopes WHERE user_id=? AND owner_id=?').get(s.user_id,s.owner_id));
 const driver=datasetActor(db,'driver05'),view=bootstrap(db,driver);assert(view.tasks.length>0);assert(view.tasks.every(t=>t.driver_id===driver.driver_id));assert(view.tasks.some(t=>t.status==='待接收'));assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert(m.created.orders.every(id=>db.prepare('SELECT source FROM orders WHERE id=?').get(id).source==='ESTIMATED'));
 }finally{db.close();}
});
test('CR37 installed dataset prevents startup from restoring retired legacy vehicles',async()=>{
 const db=database(':memory:');try{seed(db);installDataVisibility(db);await buildBusinessDataset(db,route);db.prepare('DELETE FROM telemetry WHERE vehicle_id=?').run('V018');db.prepare('DELETE FROM vehicles WHERE id=?').run('V018');const before=db.prepare('SELECT count(*) n FROM vehicles').get().n;seed(db);seed(db);assert.equal(db.prepare('SELECT count(*) n FROM vehicles').get().n,before);assert.equal(db.prepare('SELECT id FROM vehicles WHERE id=?').get('V018'),undefined);}finally{db.close();}
});
