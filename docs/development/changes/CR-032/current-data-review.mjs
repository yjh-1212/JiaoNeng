import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const out='docs/development/changes/CR-032/',before=new DatabaseSync(out+'pre-restart.sqlite',{readOnly:true}),current=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true});
try {
 const tables=Object.keys(JSON.parse(fs.readFileSync(out+'data-before-restart.json','utf8'))),changes=[];
 for(const t of tables){
  const original=before.prepare('SELECT rowid AS _row,* FROM "'+t+'" ORDER BY rowid').all();
  const max=original.at(-1)?._row||0;
  const preserved=current.prepare('SELECT rowid AS _row,* FROM "'+t+'" WHERE rowid<=? ORDER BY rowid').all(max);
  assert.deepEqual(preserved,original,'Existing rows changed: '+t);
  const extra=current.prepare('SELECT count(*) n FROM "'+t+'" WHERE rowid>?').get(max).n;
  if(extra)changes.push({table:t,appended_rows:extra});
 }
 assert.equal(current.prepare('PRAGMA foreign_key_check').all().length,0);
 const report={status:'PASS',at:new Date().toISOString(),original_rows_preserved:true,table_count:tables.length,concurrent_appends:changes,note:'Initial post-restart exact snapshot passed. This review saved public regional route calculations as additional records; original rows remain preserved. No rollback or restoration performed.'};
 fs.writeFileSync(out+'current-data-review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{before.close();current.close();}

