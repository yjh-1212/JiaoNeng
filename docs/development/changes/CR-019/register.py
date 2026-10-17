import hashlib, json, sqlite3
from pathlib import Path
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[4]
out = root / "docs/development/changes/CR-019"
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p, data):
    (root / p).write_text(json.dumps(data, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
parent = "docs/design/07-baseline/design-baseline-CR-018.json"
manifest = "docs/design/07-baseline/design-baseline-CR-019.json"
files = ["docs/design/08-change/CR-019-operational-assurance.md",
         "prototypes/design-preview/operations-pages-v1/01-operation-monitoring.png",
         "prototypes/design-preview/operations-pages-v1/02-incident-handling.png",
         "prototypes/design-preview/operations-pages-v1/README.md"]
if not (root / manifest).exists():
    write(manifest, dict(schema_version=1, status="FROZEN", design_version="V0.2-design-1+CR-019",
          parent_manifest=parent, parent_manifest_sha256=sha(root/parent),
          approved_by="当前用户", evidence="按这个来帮我开发",
          recorded_at=datetime.now(timezone.utc).isoformat(), sha256={p:sha(root/p) for p in files}))
cursor = manifest
checked = 0
chain = []
while cursor:
    data = json.loads((root/cursor).read_text(encoding="utf-8"))
    for p,h in data["sha256"].items():
        assert sha(root/p)==h, p
        checked += 1
    chain.append(cursor)
    p = data.get("parent_manifest")
    if p: assert sha(root/p)==data["parent_manifest_sha256"]
    cursor = p
write("docs/development/changes/CR-019/baseline-check.json", dict(status="PASS", baselines=len(chain), files=checked))
write("docs/development/changes/CR-019/authorization.json", dict(baseline=manifest, baseline_sha256=sha(root/manifest), evidence="按这个来帮我开发", scope="运行保障本地前后端、司机关联及真实接口测试，无部署"))
backup = root/"data/backups/jiaoneng-pre-cr019.sqlite"
if not backup.exists():
    backup.parent.mkdir(parents=True, exist_ok=True)
    source=sqlite3.connect(root/"data/jiaoneng.sqlite")
    target=sqlite3.connect(backup)
    source.backup(target)
    target.close()
    source.close()
print(json.dumps(dict(baselines=len(chain), files=checked, backup=str(backup)),ensure_ascii=False))
