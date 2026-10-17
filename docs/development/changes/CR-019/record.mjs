import fs from "node:fs";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const root="docs/development/changes/",a=root+"CR-019/",b=root+"CR-020/";
const read=p=>JSON.parse(fs.readFileSync(p,"utf8")),sha=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const ac=read(a+"ac-results.json"),safety=read(b+"browser-check.json"),tasks=read(a+"task-regression/browser-check.json"),energy=read(a+"energy-regression/browser-check.json"),local=read(b+"local-browser.json"),preservation=read(b+"local-preservation.json");
for(const r of [ac,safety,tasks,energy,local,preservation])assert.equal(r.status,"PASS");
assert.equal(ac.executed,171);assert.equal(safety.checks.length,12);assert.equal(tasks.checks.length,9);assert.equal(energy.checks.length,13);
assert.equal(local.map_ready,true);assert.equal(local.layout.map.height,local.layout.workspace.height);assert.equal(Object.keys(preservation.tables).length,17);
const log=fs.readFileSync(a+"node-tests.txt","utf8");assert(/pass 306/.test(log)&&/fail 0/.test(log));
const files=["server/safety-workspace.mjs","server/safety-commands.mjs","server/app.mjs","server/repository.mjs","server/task-workspace.mjs",
"client/safety-workbench.jsx","client/safety-panels.jsx","client/safety-map.jsx","client/safety-workbench.css","client/driver-incidents.jsx",
"client/app.jsx","client/routes.js","client/driver.jsx","client/energy-panels.jsx","client/energy-workbench.jsx","client/task-workbench.jsx","client/task-drawers.jsx","client/transport-workbench.jsx","client/goal-simulation.jsx",
"tests/safety-workspace.test.mjs","tests/safety-workspace-browser.mjs","tests/scenarios.test.mjs","tests/energy-workspace-browser.mjs","package.json",
a+"architecture.md",a+"acceptance-report.md",b+"acceptance-report.md"];
fs.writeFileSync(a+"implementation-manifest.json",JSON.stringify({changes:["CR-019","CR-020"],created_at:new Date().toISOString(),source_sha256:Object.fromEntries(files.map(p=>[p,sha(p)])),evidence:{node_tests:306,original_ac:171,browser_checks:34,business_tables_unchanged:17}},null,2)+"\n");
const path="docs/development/dev-state.json",state=read(path);
state.changes??={};
for(const id of ["CR-019","CR-020"])state.changes[id]={
 status:"VERIFIED",verified_at:new Date().toISOString(),baseline_file:"docs/design/07-baseline/design-baseline-"+id+".json",
 authorization_file:root+id+"/authorization.json",acceptance_report:root+id+"/acceptance-report.md",
 source_manifest:a+"implementation-manifest.json",verification_actor:"开发代理依据用户明确批准及开发中布局修订自检，非用户逐节点签署",
 build:"PASS",node_tests_pass:306,original_acceptance_pass:171,browser_checks_pass:12,task_browser_regression_pass:9,energy_browser_regression_pass:13,
 external_model_calls:0,real_map_verified:true,existing_business_rows_preserved:true,local_business_mutations:false,deployment:false
};
fs.writeFileSync(path,JSON.stringify(state,null,2)+"\n");
console.log("Verified: 306 tests, 171 AC, 34 browser checks, 17 business tables preserved.");
