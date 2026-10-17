import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
def sha(p):return hashlib.sha256((root/p).read_bytes()).hexdigest()
parent="docs/design/07-baseline/design-baseline-CR-020.json"
spec="docs/design/08-change/CR-021-planning-workspaces.md"
manifest="docs/design/07-baseline/design-baseline-CR-021.json"
evidence="按这个来进行开发，后面的不用询问我是否同意授权，全部授权，直接完成"
data=dict(schema_version=1,status="FROZEN",design_version="V0.2-design-1+CR-021",parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by="当前用户批准设计图并授权开发",evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)})
if not(root/manifest).exists():(root/manifest).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(root/"docs/development/changes/CR-021/authorization.json").write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope="按已批准规划页面设计开发，本地实施与自检，无部署"),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
cursor=manifest;count=0;files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding="utf-8"))
 for p,h in b["sha256"].items():assert sha(p)==h;files+=1
 count+=1
 parent=b.get("parent_manifest")
 if parent:assert sha(parent)==b["parent_manifest_sha256"]
 cursor=parent
(root/"docs/development/changes/CR-021/baseline-check.json").write_text(json.dumps(dict(status="PASS",baselines=count,files=files),indent=2)+"\n",encoding="utf-8")
print("Baseline verified",count,files)

