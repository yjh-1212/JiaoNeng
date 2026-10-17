import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/development/changes/CR-023/',db=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true});
const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name).filter(t=>!['auth_sessions','agent_conversations','agent_turns'].includes(t));
const snapshot=()=>Object.fromEntries(tables.map(t=>{const rows=db.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all();return[t,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];}));
try{
  if(process.argv[2]==='before'){
    assert(!fs.existsSync(out+'pre-restart.sqlite'),'Do not overwrite previous snapshot');
    await backup(db,out+'pre-restart.sqlite');
    fs.writeFileSync(out+'data-before-restart.json',JSON.stringify(snapshot(),null,2));
    console.log('Current database backed up; '+tables.length+' existing tables fingerprinted');
  }else{
    const before=JSON.parse(fs.readFileSync(out+'data-before-restart.json','utf8')),after=snapshot();assert.deepEqual(after,before,'Existing data changed: inspect concurrent human activity before attributing it');
    const report={status:'PASS',at:new Date().toISOString(),existing_tables:tables.length,all_existing_rows_unchanged:true,new_agent_tables:db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'agent_%' ORDER BY name").all().map(r=>r.name),data:after};
    assert.equal(report.new_agent_tables.length,2);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    fs.writeFileSync(out+'data-preservation.json',JSON.stringify(report,null,2));console.log('PASS existing '+tables.length+' tables unchanged, two additive agent tables, foreign keys valid');
  }
}finally{db.close();}
