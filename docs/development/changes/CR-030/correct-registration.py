# Correct copied registration metadata before source implementation; older baselines stay untouched.
from pathlib import Path
import json
root=Path(__file__).resolve().parents[4]
path=root/'docs/design/07-baseline/design-baseline-CR-030.json'
s=json.loads(path.read_text(encoding='utf-8'))
s['approved_by']='当前用户明确要求登录与入口调整'
s['evidence']='用户要求移除总览筛选刷新、登录标题和身份切换，增加背景、PC预填及密码可见切换，司机独立免登录入口；继承后续开发授权。'
path.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
