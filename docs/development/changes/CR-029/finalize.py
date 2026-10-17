from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
root=Path(__file__).resolve().parents[4];out=root/'docs/development/changes/CR-029'
assert json.loads((out/'browser-check.json').read_text(encoding='utf-8'))['status']=='PASS'
assert json.loads((out/'baseline-check.json').read_text(encoding='utf-8'))['status']=='PASS'
src=Path('C:/Users/Lenovo/AppData/Local/Temp/codex-clipboard-22b015b9-266b-4424-be35-de461636e88d.png')
assert src.read_bytes()==(root/'client/assets/china-data-union-logo.png').read_bytes()
report=dict(status='PASS',at=datetime.now(timezone.utc).isoformat(),build='PASS',local_browser='PASS',desktop_widths=[1920,1366,1280],narrow_widths=[1024,390],unchanged_user_logo=True,user_acceptance_signature=False,business_writes=0,deployment=False,source_sha256={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['client/app.jsx','client/header-navigation.css','client/assets/china-data-union-logo.png','tests/scenario-workbench-browser.mjs']})
(out/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/development/dev-state.json';s=json.loads(p.read_text(encoding='utf-8'));s.setdefault('changes',{})['CR-029']={**report,'status':'VERIFIED','authorization_evidence':'用户要求替换中国数联Logo、顶层导航居中美化、二级菜单加下拉标志；继承必要后续步骤授权','baseline':'docs/design/07-baseline/design-baseline-CR-029.json','report':'docs/development/changes/CR-029/acceptance-report.md'};p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('CR-029 verified')
