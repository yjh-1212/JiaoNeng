from pathlib import Path
from datetime import datetime, timezone
import json, hashlib
root=Path(__file__).resolve().parents[4]
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
spec='docs/design/08-change/CR-031-login-without-logo.md'
parent='docs/design/07-baseline/design-baseline-CR-030.json'
target='docs/design/07-baseline/design-baseline-CR-031.json'
evidence='当前用户：登录页不要加中国数联logo。直接实施，继承后续开发授权。'
manifest=dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-031',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)})
if not(root/target).exists(): (root/target).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'docs/development/changes/CR-030/supplement-authorization.json').write_text(json.dumps(dict(baseline=target,baseline_sha256=sha(target),evidence=evidence),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=target;files=count=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(root/'docs/development/changes/CR-030/supplement-baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8')
print('CR-031 authorized; baseline chain verified',count,files)
