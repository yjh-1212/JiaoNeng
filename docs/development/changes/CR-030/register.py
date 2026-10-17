import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-030'
sha=lambda p:hashlib.sha256((root/p).read_bytes()).hexdigest()
parent='docs/design/07-baseline/design-baseline-CR-029.json';spec='docs/design/08-change/CR-030-login-and-driver-entry.md';manifest='docs/design/07-baseline/design-baseline-CR-030.json'
evidence='用户：运营总览中的这个帮我去掉，登录页左侧帮我增加一个背景图片弄的好看些，同时去掉司机端登录，以及第三张截图这个内容，司机端单独给我一个连接，不用登录默认登录进去一个，同时pc端的登录密码账号帮我默认写进去，同时登录密码可以查看。继承必要后续开发步骤授权。'
if not(root/manifest).exists():
 (root/manifest).write_text(json.dumps(dict(schema_version=1,status='FROZEN',design_version='V0.2-design-1+CR-030',parent_manifest=parent,parent_manifest_sha256=sha(parent),approved_by='当前用户明确要求登录与入口调整',evidence=evidence,recorded_at=datetime.now(timezone.utc).isoformat(),sha256={spec:sha(spec)}),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'authorization.json').write_text(json.dumps(dict(baseline=manifest,baseline_sha256=sha(manifest),evidence=evidence,scope='登录页与总览简化、独立本地司机入口及会话隔离；不变更业务数据或部署'),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cursor=manifest;count=files=0
while cursor:
 b=json.loads((root/cursor).read_text(encoding='utf-8'))
 for p,h in b['sha256'].items():assert sha(p)==h;files+=1
 count+=1;cursor=b.get('parent_manifest')
 if cursor:assert sha(cursor)==b['parent_manifest_sha256']
(out/'baseline-check.json').write_text(json.dumps(dict(status='PASS',baselines=count,files=files),indent=2)+'\n',encoding='utf-8');print('Baseline verified',count,files)

