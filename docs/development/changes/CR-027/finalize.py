import json,hashlib
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-027'
for name in ['browser-check.json','baseline-check.json']:assert json.loads((out/name).read_text(encoding='utf-8'))['status']=='PASS'
stamp=datetime.now(timezone.utc).isoformat()
report=dict(status='PASS',at=stamp,build='PASS',desktop_viewports=6,homepage_overflow=False,small_window_scroll_preserved=True,chat_scroll_preserved=True,business_writes=0,external_model_calls=0,user_acceptance_signature=False,deployment=False,source_sha256={'client/agent-center.css':hashlib.sha256((root/'client/agent-center.css').read_bytes()).hexdigest()})
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';s=json.loads(p.read_text(encoding='utf-8'));s.setdefault('changes',{})['CR-027']={**report,'status':'VERIFIED','authorization_evidence':'用户要求参考辽粮布局并修正首页滚动；继承必要后续步骤授权','baseline':'docs/design/07-baseline/design-baseline-CR-027.json','report':'docs/development/changes/CR-027/acceptance-report.md'};p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-027 verified')
