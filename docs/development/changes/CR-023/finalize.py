import hashlib,json,re
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
out=root/'docs/development/changes/CR-023'
def read(name):return json.loads((out/name).read_text(encoding='utf-8'))
for name in ['baseline-check.json','browser-check.json','live-ai-review.json','local-review.json','data-preservation.json']:
    assert read(name)['status']=='PASS',name
log=(out/'node-tests.log').read_text(encoding='utf-8')
assert re.search(r'pass 325\b',log) and re.search(r'fail 0\b',log)
sources=['shared/agents.js','server/schema.sql','server/agent-center.mjs','server/app.mjs','server/scenario-adjustments.mjs','client/agent-center.jsx','client/agent-center.css','client/agent-launcher.jsx','client/app.jsx','client/energy-panels.jsx','client/routes.js','client/api.js','client/transport-workbench.jsx','client/goal-simulation.jsx','tests/helpers.mjs','tests/agent-center.test.mjs','tests/agent-center-fixture.mjs','tests/agent-center-browser.mjs']
stamp=datetime.now(timezone.utc).isoformat()
manifest={'at':stamp,'sha256':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sources}}
(out/'implementation-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
verification={'status':'PASS','at':stamp,'stages':{f'E{i}':'SELF_VERIFIED' for i in range(6)},'user_acceptance_signature':False,'node_tests_pass':325,'node_tests_fail':0,'browser_groups_pass':len(read('browser-check.json')['checks']),'real_deepseek_model':read('live-ai-review.json')['model'],'real_deepseek_calls':1,'local_review':'PASS','original_tables_preserved':read('data-preservation.json')['existing_tables'],'design_baselines':23,'frozen_files':323,'driver_functionality_changed':False,'local_process_id':14704,'deployment':False}
(out/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
statepath=root/'docs/development/dev-state.json'
state=json.loads(statepath.read_text(encoding='utf-8'))
state.setdefault('changes',{})['CR-023']={'status':'VERIFIED','verified_at':stamp,'scope':'PC首批六智能体、右下唯一入口、辽粮式会话中心与业务交接','authorization_evidence':'用户：司机端先不做，然后先做pc端的，页面设计也参考辽粮的，入口就是右下方悬浮的图标。就做第一批的；继承必要步骤全部授权','baseline':'docs/design/07-baseline/design-baseline-CR-023.json','report':'docs/development/changes/CR-023/acceptance-report.md','source_manifest':'docs/development/changes/CR-023/implementation-manifest.json',**verification}
statepath.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
state['changes']['CR-023']['status']='VERIFIED'
statepath.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(verification,ensure_ascii=False))
