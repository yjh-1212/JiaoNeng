import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {database} from '../server/db.mjs';
import {buildPlanningDataset,verifyPlanningDataset,PLANNING_DATASET_KEY} from '../server/planning-dataset.mjs';
const out=path.resolve('docs/development/changes/CR-038');fs.mkdirSync(out,{recursive:true});
const apply=process.argv.includes('--apply'),main=path.resolve(process.env.DATABASE_PATH||'data/jiaoneng.sqlite'),saved=path.join(out,'before-planning-data.sqlite'),staging=path.join(out,'prepared.sqlite');
const dbRead=new DatabaseSync(main,{readOnly:true});
if(!fs.existsSync(saved))await backup(dbRead,saved);
if(!apply){for(const suffix of ['','-wal','-shm']){const target=staging+suffix;if(path.dirname(target)!==out)throw new Error('暂存路径越界');if(fs.existsSync(target))fs.unlinkSync(target);}await backup(dbRead,staging);}
dbRead.close();
if(apply){const v=JSON.parse(fs.readFileSync(path.join(out,'verification.json'),'utf8'));if(v.status!=='PASS')throw new Error('独立库验证未通过');}
const db=database(apply?main:staging);
try{
 const before=db.prepare('SELECT value FROM data_view_state WHERE key=?').get(PLANNING_DATASET_KEY),m=buildPlanningDataset(db),v=verifyPlanningDataset(db,m);
 fs.writeFileSync(path.join(out,apply?'applied.json':'verification.json'),JSON.stringify({...v,at:new Date().toISOString(),backup:saved,idempotent:!!before},null,2));
 if(!apply)fs.writeFileSync(path.join(out,'dataset-manifest.json'),JSON.stringify(m,null,2));
 console.log(JSON.stringify({applied:apply,...v},null,2));
}finally{db.close();}
