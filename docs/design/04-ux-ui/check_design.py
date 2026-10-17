"""D4 design coverage, reference integrity and token contrast; not browser tests."""
import csv,json,hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/design/04-ux-ui'
def rows(path):
    with (ROOT/path).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
errors=[]; checks=[]
def check(name,condition):
    checks.append(dict(check=name,result='PASS' if condition else 'FAIL'))
    if not condition:errors.append(name)
p=rows('docs/design/04-ux-ui/page-inventory.csv')
r=rows('docs/design/02-architecture/route-index.csv')
req=rows('docs/design/01-discovery/requirements.csv')
f=rows('docs/design/03-prd/feature-catalog.csv')
fd=rows('docs/design/03-prd/field-dictionary.csv')
fc=rows('docs/design/04-ux-ui/field-control-map.csv')
pl=rows('docs/design/04-ux-ui/page-field-placement.csv')
check('26个页面ID、路由、菜单归属保持D2不变',len(p)==26 and {x['page_id'] for x in p}=={x['page_id'] for x in r} and all(next(a for a in r if a['page_id']==x['page_id'])['route']==x['route'] for x in p))
check('管理端7个一级入口、19工作区/18二级；司机3个入口',len([x for x in p if x['role_id']=='ROLE-001' and x['menu_visible']=='是'])==19 and len({x['nav_group'] for x in p if x['role_id']=='ROLE-001' and x['menu_visible']=='是'})==7 and len([x for x in p if x['role_id']=='ROLE-002' and x['menu_visible']=='是'])==3)
check('57项需求在页面规格均可追踪',{x['req_id'] for x in req} <= {rid for x in p for rid in x['related_requirements'].split(';')})
check('47个功能都有指定主工作区且不重复',{x['feature_id'] for x in f}=={fid for x in p for fid in x['feature_ids'].split(';') if fid} and sum(len(x['feature_ids'].split(';')) if x['feature_ids'] else 0 for x in p)==47)
check('261字段全部有基础控件与校验映射',{x['field_id'] for x in fd}=={x['field_id'] for x in fc} and len(fc)==261)
check('所有页面字段引用存在且有明确控件与可编辑性',all(x['field_id'] in {z['field_id'] for z in fd} and x['control'] and x['access'] for x in pl))
for x in p:
    path=ROOT/x['spec_path']; t=path.read_text(encoding='utf-8') if path.exists() else ''
    check(x['page_id']+'包含10节、具体查询/字段/异常/权限/响应式/验收',all(f'## {i} ' in t for i in range(1,11)) and 'UIAC-' in t and '## 5 动作、可见性与确认' in t and x['prototype_ref'] in t)
    check(x['page_id']+'所有PAGE跳转ID有效',all(a in {z['page_id'] for z in p} for a in re.findall(r'PAGE-\d{3}',t)))
check('司机不能编辑管理员核验量',all('只读' in x['access'] for x in pl if x['page_id']=='PAGE-044' and x['field_id']=='M002-F023'))
check('司机不填管理员处置措施',not any(x['page_id']=='PAGE-044' and x['field_id']=='M006-F017' and '只读' not in x['access'] for x in pl))
check('车辆指派能选择已有引用而不修改档案',any(x['page_id']=='PAGE-007' and x['field_id']=='M002-F001' and '选择' in x['access'] for x in pl))
check('仅两类业务角色',set(x['role_id'] for x in p)=={'ROLE-001','ROLE-002'})
simulation=(OUT/'pages/PAGE-005.md').read_text(encoding='utf-8')
check('交能推演遵从用户指定辽粮上下布局',all(s in simulation for s in ['上方通栏条件表单','下方结果区左地图','上条件、下结果','输入变更立即标记下方旧结果需重算']) and '≥1440三栏' not in simulation)
state=json.loads((ROOT/'docs/design/design-state.json').read_text(encoding='utf-8'))
for s,a in state['approvals'].items():
    if s>'D3':continue
    check(s+'已批准文件哈希保持不变',all((ROOT/path).is_file() and hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==h for path,h in a['file_hashes'].items()))
check('D4没有擅自登记批准/开发授权',state['status']=='DESIGN' and state['current_stage']=='D4' and 'D4' not in state['approvals'])

# Relative luminance, normal text 4.5:1 and essential control boundary 3:1.
def lum(c):
    z=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    z=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in z]
    return sum(a*b for a,b in zip(z,[.2126,.7152,.0722]))
tokens={}
for line in (OUT/'ui-system.md').read_text(encoding='utf-8').splitlines():
    match=re.match(r'\| ([\w.]+) \| (#[0-9A-Fa-f]{6}) \| (#[0-9A-Fa-f]{6}) \|',line)
    if match:tokens[match[1]]={'light':match[2],'dark':match[3]}
cr=[]
for theme in ['light','dark']:
    pairs=[]
    for fg in ['text.primary','text.secondary','text.tertiary','semantic.success','semantic.warning','semantic.danger','semantic.info']:
        for bg in ['surface.canvas','surface.panel','surface.subtle']:pairs.append((fg,bg,4.5))
    pairs += [('brand.onPrimary','brand.primary',4.5),('brand.primary','brand.soft',4.5)]
    for bg in ['control.background','surface.canvas','surface.subtle']:
        pairs += [('control.border',bg,3),('focus.ring',bg,3)]
    for fg,bg,threshold in pairs:
        a,b=tokens[fg][theme],tokens[bg][theme]; l=sorted([lum(a),lum(b)])
        ratio=(l[1]+.05)/(l[0]+.05)
        cr.append(dict(theme=theme,foreground_token=fg,background_token=bg,foreground=a,background=b,ratio=round(ratio,3),minimum=threshold,result='PASS' if ratio>=threshold else 'FAIL'))
with (OUT/'contrast-report.csv').open('w',encoding='utf-8-sig',newline='') as out:
    w=csv.DictWriter(out,fieldnames=list(cr[0]));w.writeheader();w.writerows(cr)
check('所有正文、语义、主要按钮与必要控件对比度达设计门槛',all(x['result']=='PASS' for x in cr))
result=dict(stage='D4',scope='文档结构/覆盖/哈希/颜色计算；不含浏览器交互或模型效果验收',pages=len(p),requirements=len(req),features=len(f),field_mappings=len(fc),page_field_placements=len(pl),contrast_pairs=len(cr),checks=checks,errors=errors)
(OUT/'self-check-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
if errors:raise SystemExit(1)
