import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
out=root/'docs/development/changes/CR-024'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-023.json'
spec='docs/design/08-change/CR-024-agent-center-simplify.md'
manifest='docs/design/07-baseline/design-baseline-CR-024.json'
evidence='用户2026-10-17：把这块都去掉；截图明确包含三个选择框及欢迎介绍区。继承后续必要步骤全部授权。'
if not(root/manifest).exists():
    (root/manifest).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-024',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户明确删除截图区域',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope='仅智能体中心界面精简；无业务数据变更、无部署'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=manifest;count=files=0
while cursor:
    b=json.loads((root/cursor).read_text(encoding='utf-8'))
    for p,h in b['sha256'].items():assert sha(p)==h;files+=1
    count+=1;cursor=b.get('parent_manifest')
    if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8')
print('Baseline verified',count,files)
