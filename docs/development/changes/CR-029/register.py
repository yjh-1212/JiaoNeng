import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-029'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-028.json';spec='docs/design/08-change/CR-029-header-navigation.md';manifest='docs/design/07-baseline/design-baseline-CR-029.json'
evidence='用户：交能融合帮我去掉，加上中国数联的logo，然后顶层导航栏帮我居中，然后设计的好看些，同时有二级菜单的加上下拉标志；使用用户所附Logo，继承必要后续步骤授权。'
if not(root/manifest).exists():
 (root/manifest).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-029',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户明确要求替换Logo及居中导航',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope='PC品牌及导航视觉；无业务或部署变更'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=manifest;count=files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8');print('Baseline verified',count,files)
