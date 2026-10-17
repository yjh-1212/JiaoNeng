import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-027'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-026.json';spec='docs/design/08-change/CR-027-agent-viewport-layout.md';manifest='docs/design/07-baseline/design-baseline-CR-027.json'
evidence='用户：参考一下辽粮的布局，现在交能的为啥页面还有滑动；要求按参考布局消除首页不必要滚动。继承必要后续步骤授权。'
if not(root/manifest).exists():
 (root/manifest).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-027',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户明确要求按辽粮修正布局滚动',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope='仅智能体中心布局；无业务规则或部署变更'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=manifest;count=files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8');print('Baseline verified',count,files)
