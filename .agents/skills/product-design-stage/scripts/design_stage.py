#!/usr/bin/env python3
"""产品设计阶段独立管理器，Python 3.10+，无外部依赖。只修改 docs/design 与 prototypes/design-preview。"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import sys

HERE = Path(__file__).resolve().parents[1]
SCAFFOLD = HERE / 'templates' / 'scaffold'
STAGES = {
    'D0': ['docs/design/00-intake/project-brief.md', 'docs/design/00-intake/source-register.csv'],
    'D1': ['docs/design/01-discovery/discovery.md', 'docs/design/01-discovery/personas.md', 'docs/design/01-discovery/requirements.csv'],
    'D2': ['docs/design/02-architecture/processes.md', 'docs/design/02-architecture/information-architecture.md', 'docs/design/02-architecture/state-permission.csv'],
    'D3': ['docs/design/03-prd/prd-overview.md', 'docs/design/03-prd/module-index.csv', 'docs/design/03-prd/data-interface-requirements.md', 'docs/design/03-prd/traceability.csv'],
    'D4': ['docs/design/04-ux-ui/page-inventory.csv', 'docs/design/04-ux-ui/ui-system.md', 'docs/design/04-ux-ui/interaction-states.md'],
    'D5': ['docs/design/05-prototype/navigation.md', 'docs/design/05-prototype/walkthrough.md', 'prototypes/design-preview/index.html'],
    'D6': ['docs/design/06-review/review-report.md', 'docs/design/06-review/coverage-report.md', 'docs/design/06-review/issue-closure.csv', 'docs/design/06-review/approval.md'],
}
CSV_COLUMNS = {
    '00-intake/source-register.csv': ['source_id', 'source_name', 'source_type', 'date', 'path_or_url'],
    '01-discovery/requirements.csv': ['req_id', 'requirement', 'source_id', 'role_id', 'acceptance_target'],
    '02-architecture/state-permission.csv': ['object_id', 'state_before', 'event', 'state_after', 'role_id'],
    '03-prd/module-index.csv': ['module_id', 'module_name', 'spec_path'],
    '03-prd/traceability.csv': ['req_id', 'source_id', 'role_id', 'flow_id', 'module_id', 'page_id', 'prototype_ref', 'acceptance_id'],
    '04-ux-ui/page-inventory.csv': ['page_id', 'page_name', 'module_id', 'spec_path', 'prototype_ref'],
    '06-review/issue-closure.csv': ['issue_id', 'severity', 'description', 'status'],
}
PLACEHOLDERS = ('⟦待填写⟧', '⟦编号⟧', '⟦功能名称⟧', '⟦页面名称⟧', '<!-- TODO', '【待补充】')
STATE_REL = 'docs/design/design-state.json'
BASELINE_REL = 'docs/design/07-baseline/design-baseline.json'


def relfile(project: Path, rel: str) -> Path:
    # CSV references must not escape root or use absolute paths
    path = (project / rel).resolve()
    if not path.is_relative_to(project.resolve()):
        raise ValueError(f'引用路径越过项目目录：{rel}')
    return path


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def get_state(project: Path) -> dict:
    p = relfile(project, STATE_REL)
    if not p.is_file():
        return {'schema_version': 1, 'status': 'DESIGN', 'approvals': {}}
    return json.loads(p.read_text(encoding='utf-8'))


def save_state(project: Path, state: dict) -> None:
    p = relfile(project, STATE_REL)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def required_paths(project: Path, stage: str) -> list[str]:
    paths = list(STAGES[stage])
    if stage == 'D3':
        paths += linked_paths(project, 'docs/design/03-prd/module-index.csv', 'spec_path')
    elif stage == 'D4':
        paths += linked_paths(project, 'docs/design/04-ux-ui/page-inventory.csv', 'spec_path')
    return list(dict.fromkeys(paths))


def csv_rows(project: Path, rel: str) -> tuple[list[str], list[dict]]:
    p = relfile(project, rel)
    if not p.exists():
        return [], []
    with p.open(encoding='utf-8-sig', newline='') as f:
        dr = csv.DictReader(f)
        return list(dr.fieldnames or []), list(dr)


def linked_paths(project: Path, csv_rel: str, col: str) -> list[str]:
    _, rows = csv_rows(project, csv_rel)
    return [str(row.get(col, '')).strip() for row in rows if str(row.get(col, '')).strip() and '⟦' not in str(row.get(col))]


def stage_fingerprints(project: Path, stage: str) -> dict:
    files = {rel: sha(relfile(project, rel)) for rel in required_paths(project, stage) if relfile(project, rel).is_file()}
    if stage == 'D5':
        # 原型样式、交互脚本及本地资源也属于经审批的设计成果
        base = project / 'prototypes/design-preview'
        if base.exists():
            for f in base.rglob('*'):
                if f.is_file():
                    files[f.relative_to(project).as_posix()] = sha(f)
    return files


def file_check(project: Path, rel: str) -> list[str]:
    issues = []
    try:
        file = relfile(project, rel)
    except ValueError as exc:
        return [str(exc)]
    if not file.is_file():
        return [f'缺少必需成果：{rel}']
    if file.stat().st_size < 40:
        issues.append(f'文档内容过少：{rel}')
    content = file.read_text(encoding='utf-8-sig')
    for ph in PLACEHOLDERS:
        if ph in content:
            issues.append(f'仍有模板占位符：{rel}（{ph}）')
            break
    if file.suffix.lower() == '.csv':
        columns, rows = csv_rows(project, rel)
        spec = next((columns_req for tail, columns_req in CSV_COLUMNS.items() if rel.endswith(tail)), None)
        if spec:
            for missing in set(spec).difference(columns):
                issues.append(f'CSV 缺少列：{rel} / {missing}')
        if not rows:
            issues.append(f'CSV 无业务数据行：{rel}')
        for i, row in enumerate(rows, 2):
            if not any(str(v or '').strip() for v in row.values()):
                issues.append(f'CSV 空白行：{rel}:{i}')
    return issues


def check_stage(project: Path, stage: str) -> list[str]:
    issues = []
    try:
        for rel in required_paths(project, stage):
            issues.extend(file_check(project, rel))
    except ValueError as exc:
        issues.append(str(exc))
        return issues
    if stage == 'D3':
        _, srcrows = csv_rows(project, 'docs/design/00-intake/source-register.csv')
        valid_sources = {r.get('source_id','') for r in srcrows}
        _, mod = csv_rows(project, 'docs/design/03-prd/module-index.csv')
        _, req = csv_rows(project, 'docs/design/01-discovery/requirements.csv')
        _, trace = csv_rows(project, 'docs/design/03-prd/traceability.csv')
        module_ids = {r.get('module_id', '').strip() for r in mod}
        req_ids = {r.get('req_id', '').strip() for r in req}
        traced_ids = {r.get('req_id', '').strip() for r in trace}
        for reqid in req_ids - traced_ids:
            issues.append(f'需求未纳入追踪矩阵：{reqid}')
        for r in req:
            if r.get('source_id','') not in valid_sources:
                issues.append(f'需求引用未登记来源：{r.get("req_id","")} / {r.get("source_id","")}')
        for r in trace:
            rid = r.get('req_id', '')
            if r.get('source_id','') not in valid_sources:
                issues.append(f'追踪矩阵来源未登记：{rid}')
            if rid not in req_ids:
                issues.append(f'追踪矩阵引用不存在需求：{rid}')
            if r.get('module_id', '') not in module_ids:
                issues.append(f'追踪矩阵引用不存在模块：{r.get("module_id", "")}')
            for key in ('source_id','role_id','flow_id','page_id','prototype_ref','acceptance_id'):
                if not r.get(key, '').strip():
                    issues.append(f'需求 {rid} 未映射 {key}')
        for r in mod:
            path = r.get('spec_path','').strip()
            try:
                if path and relfile(project, path).is_file():
                    t=relfile(project,path).read_text(encoding='utf-8')
                    if not re.search(r'AC-\d+', t):
                        issues.append(f'模块 PRD 缺少具体验收编号：{path}')
            except ValueError as exc:
                issues.append(str(exc))
    if stage in ('D4','D5','D6'):
        _, pages = csv_rows(project, 'docs/design/04-ux-ui/page-inventory.csv')
        _, trace_rows = csv_rows(project, 'docs/design/03-prd/traceability.csv')
        known_page_ids={row.get('page_id','') for row in pages}
        for row in trace_rows:
            if row.get('page_id','') not in known_page_ids:
                issues.append(f'需求映射页面不在页面清单中：{row.get("req_id","")} → {row.get("page_id","")}')
        _, mods = csv_rows(project, 'docs/design/03-prd/module-index.csv')
        modids = {r.get('module_id','') for r in mods}
        if not pages:
            issues.append('缺少页面清单')
        for page in pages:
            pid=page.get('page_id','')
            if not page.get('prototype_ref','').strip():
                issues.append(f'页面 {pid} 未规划原型路径')
            if page.get('module_id','') not in modids:
                issues.append(f'页面 {pid} 关联模块不存在')
            try:
                src=page.get('prototype_ref','').split('#')[0]
                if stage in ('D5', 'D6') and (not src or not relfile(project, src).is_file()):
                    issues.append(f'页面 {pid} 无有效原型文件：{src}')
                elif stage in ('D5', 'D6') and '#' in page.get('prototype_ref',''):
                    anchor=page['prototype_ref'].split('#',1)[1]
                    html=relfile(project,src).read_text(encoding='utf-8')
                    if f'id="{anchor}"' not in html and f"id='{anchor}'" not in html:
                        issues.append(f'页面 {pid} 原型锚点不存在：#{anchor}')
            except ValueError as exc:
                issues.append(str(exc))
    if stage == 'D6':
        approved_file=relfile(project, 'docs/design/06-review/approval.md')
        if approved_file.is_file():
            approval_text=approved_file.read_text(encoding='utf-8')
            if not re.search(r'通过结论[^\n]*[：:]\s*(明确同意|通过)',approval_text):
                issues.append('D6 审批记录未明确填写「通过结论：明确同意」')
            if not re.search(r'同意设计冻结[^\n]*[：:]\s*是\b',approval_text):
                issues.append('D6 审批记录未明确填写「同意设计冻结（是/否）：是」')
        _, req = csv_rows(project, 'docs/design/01-discovery/requirements.csv')
        _, trace = csv_rows(project, 'docs/design/03-prd/traceability.csv')
        _, pages = csv_rows(project, 'docs/design/04-ux-ui/page-inventory.csv')
        known_pages = {p.get('page_id','') for p in pages}
        traced_reqs = {r.get('req_id','') for r in trace}
        for r in req:
            if r.get('req_id','') not in traced_reqs:
                issues.append(f'最终覆盖缺失需求：{r.get("req_id","")}')
        for r in trace:
            if r.get('page_id','') not in known_pages:
                issues.append(f'追踪矩阵中的页面不存在：{r.get("page_id","")}')
        _, rows = csv_rows(project, 'docs/design/06-review/issue-closure.csv')
        for r in rows:
            if r.get('severity','').strip().upper() in ('P0','P1') and r.get('status','').strip() not in ('已关闭','已解决','已验收'):
                issues.append(f'P0/P1 问题未关闭：{r.get("issue_id", "")}')
    return list(dict.fromkeys(issues))


def current_approval_issues(project: Path, state: dict, stage: str) -> list[str]:
    a=state.get('approvals',{}).get(stage)
    if not a:
        return [f'{stage} 未批准']
    now=stage_fingerprints(project, stage)
    if a.get('file_hashes') != now:
        return [f'{stage} 审批后文件发生变化，必须重新评审']
    return []


def cmd_init(project: Path) -> int:
    if not SCAFFOLD.exists():
        print('模板目录缺失，安装包不完整'); return 2
    created=0; skipped=0
    for src in sorted(SCAFFOLD.rglob('*')):
        if not src.is_file(): continue
        relative=src.relative_to(SCAFFOLD)
        dst=relfile(project,str(relative))
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists(): skipped+=1; continue
        shutil.copy2(src, dst); created+=1
    if not relfile(project,STATE_REL).exists():
        save_state(project, {'schema_version':1,'status':'DESIGN','approvals':{},'created_at':utcnow()})
    print(f'已初始化设计目录：新增 {created} 个文件，保留原有 {skipped} 个文件。不会改动正式业务代码。')
    print('下一步：填写 docs/design/00-intake 文档 → check --stage D0 → 用户确认 → approve --stage D0。')
    return 0


def cmd_status(project: Path) -> int:
    s=get_state(project)
    print(f'设计阶段状态：{s.get("status", "DESIGN")}')
    for st in STAGES:
        problems=check_stage(project,st)
        approval=current_approval_issues(project,s,st)
        state='已批准' if not approval else ('审批失效' if s.get('approvals',{}).get(st) else '待审批')
        print(f'  {st}: {state}; 文件检查 {"通过" if not problems else str(len(problems))+"项待处理"}')
    print('下阶段不自动进入开发；设计基线须单独冻结与授权。')
    return 0


def cmd_check(project: Path, stage: str | None) -> int:
    stages=[stage] if stage else list(STAGES)
    problems=[]
    for st in stages:
        errs=check_stage(project,st)
        print(f'[{st}] ' + ('结构检查通过（仍需人工审查）' if not errs else f'发现 {len(errs)} 项问题'))
        for e in errs: print('  - '+e)
        problems.extend(errs)
    return 1 if problems else 0


def cmd_approve(project: Path, args) -> int:
    stage=args.stage
    state=get_state(project)
    if state.get('status')=='FROZEN':
        print('已冻结基线不可直接登记新审批；请先提交设计变更并建立新版本。'); return 2
    steps=list(STAGES)
    for prev in steps[:steps.index(stage)]:
        failures=current_approval_issues(project,state,prev)
        if failures:
            print('上游闸门未通过：'+ '；'.join(failures)); return 2
    errs=check_stage(project,stage)
    if errs:
        print(f'当前 {stage} 结构检查未通过；请先修复：')
        for e in errs: print(' - '+e)
        return 2
    if not args.by.strip() or len(args.evidence.strip())<8:
        print('必须填写实际确认人和可核对的确认原文/会议记录，禁止自动推断批准。');return 2
    approvals=state.setdefault('approvals',{})
    later=steps[steps.index(stage)+1:]
    revoked=[x for x in later if x in approvals]
    for x in revoked:del approvals[x]
    approvals[stage]={'approved_at_utc':utcnow(),'approved_by':args.by.strip(),'evidence':args.evidence.strip(),'file_hashes':stage_fingerprints(project,stage)}
    save_state(project,state)
    print(f'{stage} 已登记人工批准记录。'+(f'上游变更引发 {revoked} 审批失效。' if revoked else ''))
    print('注意：脚本不能核实真实世界的确认行为；必须保留实际用户明确批准凭证。')
    return 0


def cmd_freeze(project: Path, version: str) -> int:
    out=relfile(project,BASELINE_REL)
    if out.exists():
        print('设计基线已存在，禁止覆盖。变更需走 CR 并新建版本/保留历史基线。');return 2
    state=get_state(project)
    if state.get('status')=='FROZEN':print('已被冻结');return 2
    errors=[]
    for st in STAGES:
        errors+=check_stage(project,st)
        errors+=current_approval_issues(project,state,st)
    if errors:
        print('无法冻结，尚有未完成项：')
        for e in list(dict.fromkeys(errors)):print(' - '+e)
        return 2
    filemap={}
    for st in STAGES:
        filemap.update(stage_fingerprints(project,st))
    # 同步封存设计目录中所有补充成果（截图、附图、评审附件等），但不包含运行状态和基线自身。
    for root in ('docs/design', 'prototypes/design-preview'):
        for file in (project/root).rglob('*'):
            if file.is_file():
                relative=file.relative_to(project).as_posix()
                if relative not in (STATE_REL, BASELINE_REL):
                    filemap[relative]=sha(file)
    out.parent.mkdir(parents=True,exist_ok=True)
    baseline={'schema_version':1,'design_version':version,'frozen_at_utc':utcnow(),'status':'FROZEN',
              'development_authorized':False,'approvals':state['approvals'],'sha256':filemap,
              'boundary':'仅产品设计成果，冻结不意味着批准进入产品开发'}
    out.write_text(json.dumps(baseline,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    state['status']='FROZEN';state['design_version']=version;state['frozen_at_utc']=baseline['frozen_at_utc']
    save_state(project,state)
    print(f'设计基线冻结成功：{out} / {version} / {len(filemap)} 个文件')
    print('尚未授权进入开发。执行 verify 可检查冻结文件是否被修改。')
    return 0


def cmd_verify(project: Path) -> int:
    p=relfile(project,BASELINE_REL)
    if not p.is_file():
        print('尚未生成设计基线');return 2
    baseline=json.loads(p.read_text(encoding='utf-8'))
    problems=[]
    for rel,expected in baseline.get('sha256',{}).items():
        try:
            f=relfile(project,rel)
            if not f.is_file():problems.append(f'文件被删除：{rel}')
            elif sha(f)!=expected:problems.append(f'冻结后内容发生变化：{rel}')
        except ValueError as exc:problems.append(str(exc))
    if problems:
        print('设计基线不一致：')
        for x in problems:print(' - '+x)
        return 1
    print(f'设计基线校验通过：{baseline.get("design_version")}，{len(baseline.get("sha256",{}))} 个文件未变化。')
    print('注意：基线的完整性检验不等于用户已批准正式开发。')
    return 0


def main() -> int:
    p=argparse.ArgumentParser(description='产品设计 D0-D6 工作流工具（只处理 docs/design 和 prototypes/design-preview）')
    p.add_argument('--project', type=Path, default=Path.cwd(),help='项目根目录，默认当前目录')
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('init');sub.add_parser('status')
    c=sub.add_parser('check');c.add_argument('--stage',choices=STAGES)
    a=sub.add_parser('approve');a.add_argument('--stage',choices=STAGES,required=True)
    a.add_argument('--by',required=True);a.add_argument('--evidence',required=True)
    f=sub.add_parser('freeze');f.add_argument('--version',required=True)
    sub.add_parser('verify')
    args=p.parse_args()
    proj=args.project.resolve()
    if not proj.is_dir():print(f'项目目录不存在：{proj}');return 2
    try:
        if args.command=='init':return cmd_init(proj)
        if args.command=='status':return cmd_status(proj)
        if args.command=='check':return cmd_check(proj,args.stage)
        if args.command=='approve':return cmd_approve(proj,args)
        if args.command=='freeze':return cmd_freeze(proj,args.version)
        if args.command=='verify':return cmd_verify(proj)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f'发生错误：{exc}');return 2
    return 2

if __name__=='__main__':
    sys.exit(main())
