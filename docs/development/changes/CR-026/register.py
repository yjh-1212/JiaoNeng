import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-026'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-025.json';spec='docs/design/08-change/CR-026-agent-prompts.md';manifest='docs/design/07-baseline/design-baseline-CR-026.json'
evidence='用户：各智能体里面的预设词也要同步修改，类似这种；截图为整行问题卡片和右箭头。继承必要后续步骤授权。'
if not(root/manifest).exists():
 (root/manifest).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-026',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户明确要求同步预设提问',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope='六智能体预设提问及展示；无业务规则或部署变更'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=manifest;count=files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8');print('Baseline verified',count,files)
