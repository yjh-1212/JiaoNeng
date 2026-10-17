import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4]
def sha(p):return hashlib.sha256((root/p).read_bytes()).hexdigest()
parent="docs/design/07-baseline/design-baseline-CR-019.json"
spec="docs/design/08-change/CR-020-monitoring-floating-map.md"
manifest="docs/design/07-baseline/design-baseline-CR-020.json"
evidence="运行监控的地图两侧的还是要悬浮到地图上，地图铺满页面"
data=dict(schema_version=1,status="FROZEN",design_version="V0.2-design-1+CR-020",parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by="当前用户明确修订开发中的布局",evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)})
if not(root/manifest).exists():(root/manifest).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(root/"docs/development/changes/CR-020/authorization.json").write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope="继承已授权CR-019，修订本地地图及悬浮面板布局，无部署"),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
cursor=manifest;count=0;files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding="utf-8"))
 for p,h in b["sha256"].items():assert sha(p)==h;files+=1
 count+=1
 parent=b.get("parent_manifest")
 if parent:assert sha(parent)==b["parent_manifest_sha256"]
 cursor=parent
(root/"docs/development/changes/CR-020/baseline-check.json").write_text(json.dumps(dict(status="PASS",baselines=count,files=files),indent=2)+"\n",encoding="utf-8")
print("Baseline verified",count,files)
