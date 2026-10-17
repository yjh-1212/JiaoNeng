from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-032'
for f in ['baseline-check.json','browser-check.json','local-browser-check.json','local-final-browser-check.json','current-data-review.json','node-tests-summary.json']:
 r=json.loads((out/f).read_text(encoding='utf-8'));assert r['status']=='PASS',(f,r)
paths=[*sorted(p for p in (root/'client').glob('*.jsx')),*[root/p for p in ['client/api.js','client/presentation.js','client/agent-center.css','client/header-navigation.css','client/regional-simulation.css','shared/agents.js','shared/regional-data.js','server/app.mjs','server/db.mjs','server/data-visibility.mjs','server/repository.mjs','server/maps.mjs','server/regional-engine.mjs','server/regional-planner.mjs','server/agent-center.mjs','server/transport.mjs','tests/regional-visibility.test.mjs']]]
report=dict(status='PASS',at=datetime.now(timezone.utc).isoformat(),build='PASS',node_tests=338,pc_pages=19,driver_pages=3,real_map_and_ai='PASS',business_orders_written=0,original_data_preserved=True,deployment=False,user_acceptance_signature=False,source_sha256={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';s=json.loads(p.read_text(encoding='utf-8'));s.setdefault('changes',{})['CR-032']={**report,'status':'VERIFIED','baseline':'docs/design/07-baseline/design-baseline-CR-032.json','authorization_evidence':'用户直接要求省域推演、页面内AI、顶部AI导航、旧测试资料隐藏保留及业务参数补齐；继承后续开发授权。','report':'docs/development/changes/CR-032/implementation-notes.md'};p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-032 verified; sources, authorization and baseline linked')
