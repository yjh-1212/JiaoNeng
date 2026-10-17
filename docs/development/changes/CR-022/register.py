import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
def sha(p):return hashlib.sha256((root/p).read_bytes()).hexdigest()
parent="docs/design/07-baseline/design-baseline-CR-021.json"
spec="docs/design/08-change/CR-022-hide-business-management.md"
manifest="docs/design/07-baseline/design-baseline-CR-022.json"
evidence="经营管理这里全部先去掉"
data=dict(schema_version=1,status="FROZEN",design_version="V0.2-design-1+CR-022",parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by="当前用户明确要求暂时移除经营管理",evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)})
if not(root/manifest).exists():(root/manifest).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(root/"docs/development/changes/CR-022/authorization.json").write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope="暂时关闭经营管理独立前端模块，保留业务数据，无部署"),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
cursor=manifest;count=0;files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding="utf-8"))
 for p,h in b["sha256"].items():assert sha(p)==h;files+=1
 count+=1
 parent=b.get("parent_manifest")
 if parent:assert sha(parent)==b["parent_manifest_sha256"]
 cursor=parent
(root/"docs/development/changes/CR-022/baseline-check.json").write_text(json.dumps(dict(status="PASS",baselines=count,files=files),indent=2)+"\n",encoding="utf-8")
print("Baseline verified",count,files)


