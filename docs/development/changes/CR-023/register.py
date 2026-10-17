import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
def sha(p):return hashlib.sha256((root/p).read_bytes()).hexdigest()
parent="docs/design/07-baseline/design-baseline-CR-022.json"
spec="docs/design/08-change/CR-023-pc-agent-center.md"
manifest="docs/design/07-baseline/design-baseline-CR-023.json"
evidence="司机端先不做，然后先做pc端的，页面设计也参考辽粮的，入口就是右下方悬浮的图标。就做第一批的"
data=dict(schema_version=1,status="FROZEN",design_version="V0.2-design-1+CR-023",parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by="当前用户确认PC首批六智能体与入口并要求实施",evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)})
if not(root/manifest).exists():(root/manifest).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(root/"docs/development/changes/CR-023/authorization.json").write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope="PC六智能体中心、全局悬浮入口、领域分析与业务交接；无司机端、无部署"),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
cursor=manifest;count=0;files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding="utf-8"))
 for p,h in b["sha256"].items():assert sha(p)==h;files+=1
 count+=1
 parent=b.get("parent_manifest")
 if parent:assert sha(parent)==b["parent_manifest_sha256"]
 cursor=parent
(root/"docs/development/changes/CR-023/baseline-check.json").write_text(json.dumps(dict(status="PASS",baselines=count,files=files),indent=2)+"\n",encoding="utf-8")
print("Baseline verified",count,files)



