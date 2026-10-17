import json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
path=root/'docs/development/dev-state.json'
state=json.loads(path.read_text(encoding='utf-8'))
state.setdefault('changes',{})['CR-021']={
  'status':'VERIFIED','verified_at':datetime.now(timezone.utc).isoformat(),
  'scope':'场站规划、运力规划、共享规划项目与显式推演交接；仅本地',
  'authorization_evidence':'2026-10-17 用户：按这个来进行开发，后面的不用询问我是否同意授权，全部授权，直接完成',
  'baseline':'docs/design/07-baseline/design-baseline-CR-021.json',
  'report':'docs/development/changes/CR-021/acceptance-report.md',
  'stages':{f'E{i}':'SELF_VERIFIED' for i in range(6)},
  'user_acceptance_signature':False,'deployment':False,
}
path.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('CR-021 development self-verification recorded; no user signature asserted')
