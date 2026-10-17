from pathlib import Path
from datetime import datetime,timezone
import hashlib,json
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-032'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-031.json';spec='docs/design/08-change/CR-032-regional-ai-and-operational-data.md';target='docs/design/07-baseline/design-baseline-CR-032.json'
evidence='用户要求全省及周边省域推演、路线及补能多选、当前页面AI会话、顶部AI入口、清理测试和厂商文案；明确选择正式页面隐藏前期测试资料并保留原库，仅推演测算使用；补充要求查找真实数据。继承后续开发授权。'
if not(root/target).exists():(root/target).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-032',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=target,baseline_sha256=sha(target),evidence=evidence),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=target;count=files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8');print('PASS',count,files)
