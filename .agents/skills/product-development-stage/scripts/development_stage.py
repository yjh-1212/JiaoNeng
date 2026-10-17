#!/usr/bin/env python3
"""E0-E5 local development gate and design baseline verifier. No deployment actions."""
from __future__ import annotations
import argparse, csv, hashlib, json, re, shutil, sys
from datetime import datetime, timezone
from pathlib import Path

BASELINE='docs/design/07-baseline/design-baseline.json'
DESIGN_STATE='docs/design/design-state.json'
DEV_STATE='docs/development/dev-state.json'
STAGES={
'E0':['docs/development/00-handoff/handoff.md'],
'E1':['docs/development/01-architecture/architecture.md','docs/development/01-architecture/tasks.csv'],
'E2':['docs/development/02-backend/backend-contract.md','docs/development/02-backend/db-verification.md'],
'E3':['docs/development/03-frontend/frontend-implementation.md','docs/development/03-frontend/ui-comparison.md'],
'E4':['docs/development/04-integration/integration-report.md'],
'E5':['docs/development/05-acceptance/acceptance-report.md','docs/development/05-acceptance/issues.csv']
}
TEMPLATES={
'E0':{'handoff.md':'# 设计基线交接\n\n- 基线版本：⟦待填写⟧\n- 项目范围与模块清单：⟦待填写⟧\n- 数据来源及假设：⟦待填写⟧\n- 用户开发授权凭证：⟦待填写⟧\n'},
'E1':{'architecture.md':'# 技术架构与约束\n\n- 技术栈/版本：⟦待填写⟧\n- 模块与依赖：⟦待填写⟧\n- 安全与异常：⟦待填写⟧\n', 'tasks.csv':'task_id,module_id,acceptance_id,description,owner,status\n'},
'E2':{'backend-contract.md':'# 后端接口与数据契约\n\n- API 端点清单：⟦待填写⟧\n- 输入/输出/状态与权限：⟦待填写⟧\n- 数据库实体/迁移：⟦待填写⟧\n','db-verification.md':'# 数据库和 API 验证\n\n- 真实数据来源与时间：⟦待填写⟧\n- 迁移验证/事务：⟦待填写⟧\n- 接口测试命令及输出：⟦待填写⟧\n'},
'E3':{'frontend-implementation.md':'# 前端页面实施记录\n\n- 页面与原型映射：⟦待填写⟧\n- API 数据绑定：⟦待填写⟧\n- 核心操作验证：⟦待填写⟧\n','ui-comparison.md':'# UI/交互一致性对比\n\n- 对比版本/截图路径：⟦待填写⟧\n- 差异与处理：⟦待填写⟧\n'},
'E4':{'integration-report.md':'# 业务流程联调\n\n- 端到端用例：⟦待填写⟧\n- 失败场景：⟦待填写⟧\n- GIS/动画专项结果：⟦待填写⟧\n'},
'E5':{'acceptance-report.md':'# Playwright 验收\n\n- 浏览器及运行环境：⟦待填写⟧\n- 测试命令、用例及截图：⟦待填写⟧\n- PRD AC 覆盖及结论：⟦待填写⟧\n','issues.csv':'issue_id,severity,description,status,evidence\n'}
}

def now():return datetime.now(timezone.utc).isoformat(timespec='seconds')
def safe(project, rel):
    p=(project/rel).resolve()
    if not p.is_relative_to(project.resolve()):raise ValueError('不允许越界路径：'+str(rel))
    return p

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def state_load(project):
    p=safe(project,DEV_STATE)
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'schema_version':1,'authorized':False,'approvals':{}}
def state_save(project,s):
    p=safe(project,DEV_STATE);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def baseline_check(project):
    issues=[]
    p=safe(project,BASELINE)
    if not p.is_file():return None,['不存在设计冻结基线：'+BASELINE]
    try:
        b=json.loads(p.read_text(encoding='utf-8'))
        s=safe(project,DESIGN_STATE)
        ds=json.loads(s.read_text(encoding='utf-8')) if s.is_file() else {}
    except (ValueError,OSError,json.JSONDecodeError) as e:return None,['基线无法读取：'+str(e)]
    if b.get('status')!='FROZEN' or ds.get('status')!='FROZEN':issues.append('设计状态不为 FROZEN')
    if ds.get('design_version') and ds.get('design_version')!=b.get('design_version'):issues.append('状态与基线版本不一致')
    if not b.get('design_version'):issues.append('基线缺少设计版本')
    if set(b.get('approvals',{}))!=set('D'+str(i) for i in range(7)):issues.append('冻结基线缺少 D0-D6 完整批准记录')
    manifests=b.get('sha256')
    if not isinstance(manifests,dict) or not manifests:issues.append('缺少冻结成果 SHA256 清单');manifests={}
    for rel,expected in manifests.items():
        try:
            f=safe(project,rel)
            if not f.is_file():issues.append('缺少冻结文件：'+rel)
            elif sha(f)!=expected:issues.append('冻结文件被修改：'+rel)
        except (OSError,ValueError) as e:issues.append(str(e))
    return b,issues

def stage_fingerprint(project,stage):
    return {f:sha(safe(project,f)) for f in STAGES[stage] if safe(project,f).is_file()}

def stage_check(project,stage):
    issues=[]
    s=state_load(project)
    if not s.get('authorized'):issues.append('缺少用户正式开发授权（authorize）')
    b,problems=baseline_check(project);issues+=problems
    if b and s.get('baseline_version') and b.get('design_version')!=s['baseline_version']:
        issues.append('开发授权绑定的设计版本与当前冻结版本不一致')
    for rel in STAGES[stage]:
        f=safe(project,rel)
        if not f.is_file():issues.append('缺少文档：'+rel);continue
        content=f.read_text(encoding='utf-8-sig')
        if len(content.strip())<60:issues.append('文档过短：'+rel)
        if '⟦待填写⟧' in content:issues.append('尚有模板占位符：'+rel)
        if rel.endswith('.csv'):
            with f.open(encoding='utf-8-sig',newline='') as ff:
                rd=csv.DictReader(ff);rows=list(rd)
            if not rows:issues.append('CSV 缺少数据：'+rel)
            if stage=='E1' and not {'task_id','module_id','acceptance_id','description','status'}.issubset(set(rd.fieldnames or [])):
                issues.append('任务 CSV 缺字段')
            if stage=='E5':
                for r in rows:
                    if r.get('severity','').upper() in ('P0','P1') and r.get('status','') not in ('已关闭','已解决','已验收'):
                        issues.append('尚有 P0/P1：'+r.get('issue_id',''))
    return list(dict.fromkeys(issues))

def approved_issues(project,stage):
    s=state_load(project);record=s.get('approvals',{}).get(stage)
    if not record:return [stage+' 尚未审批']
    return [] if record.get('hashes')==stage_fingerprint(project,stage) else [stage+' 已审批成果后续被修改']

def main():
    p=argparse.ArgumentParser(description='产品开发 E0-E5（不含部署）')
    p.add_argument('--project',type=Path,default=Path.cwd())
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('init');sub.add_parser('status');sub.add_parser('verify-baseline')
    au=sub.add_parser('authorize');au.add_argument('--by',required=True);au.add_argument('--evidence',required=True)
    ck=sub.add_parser('check');ck.add_argument('--stage',choices=STAGES)
    app=sub.add_parser('approve');app.add_argument('--stage',choices=STAGES,required=True);app.add_argument('--by',required=True);app.add_argument('--evidence',required=True)
    args=p.parse_args(); project=args.project.resolve()
    if not project.is_dir():print('项目目录不存在');return 2
    try:
        baseline,issues=baseline_check(project)
        if issues:
            print('冻结设计基线校验未通过：')
            for e in issues:print(' -',e)
            return 2
        if args.command=='verify-baseline':
            print('设计基线校验通过：'+baseline['design_version']+'；但这不等于已获开发授权');return 0
        state=state_load(project)
        if args.command=='init':
            created=0
            for st,files in TEMPLATES.items():
                for filename,contents in files.items():
                    rel=STAGES[st][list(files).index(filename)]
                    f=safe(project,rel);f.parent.mkdir(parents=True,exist_ok=True)
                    if f.exists():continue
                    f.write_text(contents,encoding='utf-8');created+=1
            if not safe(project,DEV_STATE).exists():state_save(project,state)
            print(f'初始化完成，新建 {created} 个开发文档模板；保留原有文件。用户授权需要单独执行 authorize。')
            return 0
        if args.command=='authorize':
            if not args.by.strip() or len(args.evidence.strip())<8:
                print('授权需真实确认人和可核对的明确开发授权凭据');return 2
            if state.get('authorized') and state.get('baseline_version')!=baseline['design_version']:
                print('已有其他设计基线的开发授权，需走版本变更，禁止覆盖');return 2
            state['authorized']=True;state['authorized_by']=args.by.strip();state['evidence']=args.evidence.strip()
            state['authorized_at']=now();state['baseline_version']=baseline['design_version'];state_save(project,state)
            print('开发授权已登记；程序仅保存用户提供的凭据，不能验证其真实性。');return 0
        if args.command=='status':
            print('开发阶段基线',baseline['design_version'],'授权',state.get('authorized',False))
            for st in STAGES:
                issues=stage_check(project,st);approval=approved_issues(project,st)
                print(st,'文档校验', '通过' if not issues else str(len(issues))+'项缺失','审批','有效' if not approval else approval[0])
            return 0
        if args.command=='check':
            probs=[]
            for st in ([args.stage] if args.stage else STAGES):
                errs=stage_check(project,st);probs.extend(errs)
                print(st, '结构检查通过（需人工审查）' if not errs else '\n - '+'\n - '.join(errs))
            return 1 if probs else 0
        if args.command=='approve':
            if not state.get('authorized'):print('未获得开发授权');return 2
            for prev in list(STAGES)[:list(STAGES).index(args.stage)]:
                if approved_issues(project,prev):print('前一节点未有效批准：'+prev);return 2
            errs=stage_check(project,args.stage)
            if errs:
                print('节点结构检查未通过：\n - '+'\n - '.join(errs));return 2
            if not args.by.strip() or len(args.evidence.strip())<8:
                print('必须提供用户明确批准的凭据');return 2
            state.setdefault('approvals',{})[args.stage]={'at':now(),'by':args.by,'evidence':args.evidence,'hashes':stage_fingerprint(project,args.stage)}
            for after in list(STAGES)[list(STAGES).index(args.stage)+1:]:state['approvals'].pop(after,None)
            state_save(project,state)
            print(args.stage+' 人工批准已登记；不等于自动执行测试或用户实际签字。');return 0
        return 2
    except (OSError,ValueError,json.JSONDecodeError) as e:
        print('执行失败：'+str(e));return 2
if __name__=='__main__':sys.exit(main())
