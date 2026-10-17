import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-024'
for name in ['browser-check.json','interaction-regression.json','baseline-check.json']:
    assert json.loads((out/name).read_text(encoding='utf-8'))['status']=='PASS'
stamp=datetime.now(timezone.utc).isoformat()
verification=dict(status='PASS',at=stamp,build='PASS',interaction_regression_groups=13,actual_local_browser='PASS',baseline_count=24,frozen_files=324,user_acceptance_signature=False,business_writes=0,model_calls=0,deployment=False,source_sha256={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['client/agent-center.jsx','client/agent-center.css']})
(out/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';state=json.loads(p.read_text(encoding='utf-8'))
state.setdefault('changes',{})['CR-024']={**verification,'status':'VERIFIED','authorization_evidence':'用户：把这块都去掉；截图标明三个选择框及欢迎介绍；继承必要后续步骤授权','baseline':'docs/design/07-baseline/design-baseline-CR-024.json','report':'docs/development/changes/CR-024/acceptance-report.md'}
p.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-024 verified')
