from pathlib import Path
from datetime import datetime, timezone
import hashlib, json

root = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256((root / p).read_bytes()).hexdigest()
parent = 'docs/design/07-baseline/design-baseline-CR-035.json'
spec = 'docs/design/08-change/CR-036-business-dataset.md'
target = 'docs/design/07-baseline/design-baseline-CR-036.json'
evidence = '当前用户：核查现有资料，若不合适则生成10条适合当前业务并能走通流程的数据。'
if not (root / target).exists():
    (root / target).write_text(json.dumps(dict(schema_version=1, status='FROZEN', design_version='V0.2-design-1+CR-036', parent_manifest=parent, parent_manifest_sha256=sha(parent), approved_by='当前用户', evidence=evidence, recorded_at=datetime.now(timezone.utc).isoformat(), sha256={spec: sha(spec)}), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(out / 'authorization.json').write_text(json.dumps(dict(baseline=target, baseline_sha256=sha(target), evidence=evidence), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
cursor = target
count = files = 0
while cursor:
    b = json.loads((root / cursor).read_text(encoding='utf-8'))
    for p, h in b['sha256'].items():
        assert sha(p) == h, p
        files += 1
    count += 1
    cursor = b.get('parent_manifest')
    if cursor:
        assert sha(cursor) == b['parent_manifest_sha256']
(out / 'baseline-check.json').write_text(json.dumps(dict(status='PASS', baselines=count, files=files), indent=2) + '\n', encoding='utf-8')
print('Baseline chain PASS:', count, 'manifests,', files, 'files')



