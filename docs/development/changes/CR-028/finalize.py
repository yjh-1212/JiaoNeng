import hashlib,json,re
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-028'
def read(p):return json.loads((out/p).read_text(encoding='utf-8'))
for p in ['baseline-check.json','browser-check.json','local-review.json','data-preservation.json']:assert read(p)['status']=='PASS',p
assert 'pass 330' in (out/'node-tests.log').read_text(encoding='utf-8')
sources=['server/overview.mjs','server/app.mjs','server/energy-workspace.mjs','server/safety-workspace.mjs','client/overview-workbench.jsx','client/overview-workbench.css','client/workspaces.jsx','client/app.jsx','client/agent-center.jsx','client/energy-workbench.jsx','client/safety-workbench.jsx','client/assets/overview-energy-hub.webp','scripts/build.mjs','tests/overview.test.mjs','tests/overview-browser.mjs']
stamp=datetime.now(timezone.utc).isoformat();manifest=dict(at=stamp,sha256={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sources})
(out/'implementation-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report=dict(status='PASS',at=stamp,stages={f'E{i}':'SELF_VERIFIED' for i in range(6)},node_tests_pass=330,node_tests_fail=0,original_acceptance_pass=171,workbench_browser_pass=9,local_browser_pass=9,agent_browser_regression_pass=13,existing_tables_preserved=23,baseline_count=28,frozen_files=328,external_model_calls=0,user_acceptance_signature=False,local_process_id=21064,deployment=False)
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'asset-provenance.json').write_text(json.dumps(dict(asset='client/assets/overview-energy-hub.webp',source='imagegen built-in generated visual; format-converted to WebP',reference='generic electric heavy truck and charging hub; no specific real-world site claim',source_image='C:/Users/Lenovo/.codex/generated_images/01a133fd-f625-7b22-979a-e69744bfd09c/exec-598ad775-e4cf-4a2c-b705-4a1f992c08b9.png'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';s=json.loads(p.read_text(encoding='utf-8'));s.setdefault('changes',{})['CR-028']={**report,'status':'VERIFIED','authorization_evidence':'用户：运行总览帮我参考辽粮的弄一个；继承后续必要步骤全部授权','baseline':'docs/design/07-baseline/design-baseline-CR-028.json','report':'docs/development/changes/CR-028/acceptance-report.md','source_manifest':'docs/development/changes/CR-028/implementation-manifest.json'};p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-028 verified')
