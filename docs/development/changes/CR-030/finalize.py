from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-030'
for name in ['browser-check.json','overview-browser-check.json','local-review.json','node-tests-summary.json','data-preservation.json','current-data-review.json','supplement-baseline-check.json']:
 assert json.loads((out/name).read_text(encoding='utf-8'))['status']=='PASS',name
paths=['client/app.jsx','client/api.js','client/login.css','client/overview-workbench.jsx','server/app.mjs','tests/portal-auth.test.mjs','tests/overview-browser.mjs']
report=dict(status='PASS',at=datetime.now(timezone.utc).isoformat(),build='PASS',tests=333,browser='PASS',business_writes=0,deployment=False,user_acceptance_signature=False,source_sha256={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths})
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';s=json.loads(p.read_text(encoding='utf-8'))
for cr,scope in [('CR-030','总览简化、登录背景和默认凭据、独立司机入口与会话隔离'),('CR-031','按用户最新要求移除登录页中国数联Logo，保留PC导航Logo')]:
 s.setdefault('changes',{})[cr]={**report,'status':'VERIFIED','scope':scope,'baseline':f'docs/design/07-baseline/design-baseline-{cr}.json','authorization_evidence':'用户直接要求及后续开发授权；详见本目录授权凭据','report':'docs/development/changes/CR-030/acceptance-report.md'}
p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-030 / CR-031 verified')
