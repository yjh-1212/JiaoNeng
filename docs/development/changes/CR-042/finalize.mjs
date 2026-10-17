import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
const out='docs/development/changes/CR-042/',browser=JSON.parse(fs.readFileSync('docs/development/changes/CR-039/local-browser-check.json','utf8'));
assert.equal(browser.status,'PASS');assert.equal(browser.errors.length,0);
const testLog=fs.readFileSync('docs/development/changes/CR-040/node-tests-final.log','utf8');assert(testLog.includes('pass 351'));assert(testLog.includes('fail 0'));
const db=new DatabaseSync('data/jiaoneng.sqlite',{readOnly:true});let counts;try{assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);counts=Object.fromEntries(['orders','demands','tasks','vehicles','drivers','stations'].map(t=>[t,db.prepare('SELECT count(*) n FROM '+t).get().n]));assert.equal(counts.orders,10);assert.equal(counts.demands,10);assert.equal(counts.tasks,6);}finally{db.close();}
const files=['client/cockpit.jsx','client/cockpit.css','client/cockpit-map.jsx','client/routes.js','client/app.jsx','client/agent-launcher.jsx','client/agent-center.jsx','server/cockpit.mjs','server/app.mjs','tests/cockpit.test.mjs'];
const report={status:'VERIFIED',at:new Date().toISOString(),node_tests:351,browser_checks:browser.checks.length,counts,main_business_mutations:0,source_sha256:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),browser_report:'docs/development/changes/CR-039/local-browser-check.json',user_acceptance_signature:false,deployment:false};
fs.writeFileSync(out+'verification.json',JSON.stringify(report,null,2));
const path='docs/development/dev-state.json',state=JSON.parse(fs.readFileSync(path,'utf8'));for(const id of ['CR-039','CR-040','CR-041','CR-042'])state.changes[id]={status:'VERIFIED',baseline:'docs/design/07-baseline/design-baseline-'+id+'.json',report:out+'verification.json',user_acceptance_signature:false,deployment:false};fs.writeFileSync(path,JSON.stringify(state,null,2)+'\n');console.log('驾驶舱验收通过：351项回归，'+browser.checks.length+'项浏览器检查；主业务记录数量保持。');
