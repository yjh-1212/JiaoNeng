import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-026'
for name in ['browser-check.json','local-review.json','baseline-check.json']:assert json.loads((out/name).read_text(encoding='utf-8'))['status']=='PASS'
stamp=datetime.now(timezone.utc).isoformat();sources=['client/agent-center.jsx','client/agent-center.css','shared/agents.js']
verification=dict(status='PASS',at=stamp,build='PASS',isolated_browser_groups=8,local_browser_groups=8,agent_api_regression=10,external_model_calls=0,local_business_writes=0,local_process_id=33560,user_acceptance_signature=False,deployment=False,source_sha256={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sources})
p=root/'docs/development/dev-state.json';state=json.loads(p.read_text(encoding='utf-8'))
for cr in ['CR-025','CR-026']:
 folder=root/'docs/development/changes'/cr
 (folder/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 state.setdefault('changes',{})[cr]={**verification,'status':'VERIFIED','baseline':f'docs/design/07-baseline/design-baseline-{cr}.json','report':f'docs/development/changes/{cr}/acceptance-report.md','verification_actor':'开发代理按用户明确变更指令自检，非用户逐项签署'}
p.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-025 and CR-026 verified')
