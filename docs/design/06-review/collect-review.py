"""D6 trace, parameter proposal and review records. Does not edit upstream design."""
from pathlib import Path
import csv,json,re,hashlib
from collections import Counter
ROOT=Path(__file__).resolve().parents[3];OUT=Path(__file__).resolve().parent
def read(rel):
 with (ROOT/rel).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write(name,rows):
 with (OUT/name).open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def save(name,s):(OUT/name).write_text(s.strip()+'\n',encoding='utf-8')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
req=read('docs/design/01-discovery/requirements.csv');trace=read('docs/design/03-prd/traceability.csv');mods=read('docs/design/03-prd/module-index.csv');pages=read('docs/design/04-ux-ui/page-inventory.csv');features=read('docs/design/03-prd/feature-catalog.csv');fields=read('docs/design/03-prd/field-dictionary.csv');interfaces=read('docs/design/03-prd/interface-catalog.csv');acs=read('docs/design/03-prd/acceptance-catalog.csv');sources=read('docs/design/00-intake/source-register.csv');placements=read('docs/design/04-ux-ui/page-field-placement.csv');params=read('docs/design/03-prd/parameter-register.csv')
by_req={r['req_id']:r for r in req};by_trace={r['req_id']:r for r in trace};by_page={r['page_id']:r for r in pages};by_mod={r['module_id']:r for r in mods};field_ids={r['field_id'] for r in fields};source_ids={r['source_id'] for r in sources};ac_ids={r['acceptance_id'] for r in acs};interface_ids={r['interface_id'] for r in interfaces}
process=(ROOT/'docs/design/02-architecture/processes.md').read_text(encoding='utf-8');html=(ROOT/'prototypes/design-preview/index.html').read_text(encoding='utf-8');checks=[]
def check(name,condition):
 checks.append({'check':name,'result':'PASS' if condition else 'FAIL'})
check('57项需求唯一且追踪无缺失',len(by_req)==len(req)==57 and set(by_req)==set(by_trace))
check('9模块、26页面、47功能及接口独立可定位',len(by_mod)==9 and len(by_page)==26 and len(features)==len(interfaces)==47 and all((ROOT/m['spec_path']).is_file() for m in mods) and all((ROOT/p['spec_path']).is_file() for p in pages))
check('需求来源、流程、主模块、主页面与验收编号均存在',all(t['source_id'] in source_ids and t['flow_id'] in process and t['module_id'] in by_mod and t['page_id'] in by_page and t['acceptance_id'] in ac_ids for t in trace))
check('171项验收有正常、边界及权限条件',len(acs)==171 and all(len([a for a in acs if a['req_id']==r['req_id']])==3 for r in req) and all(all(a[k].strip() for k in ['given','when','then']) for a in acs))
check('功能输入输出字段及逻辑接口有效',all(f['interface_id'] in interface_ids and all(x in field_ids for k in ['input_field_ids','output_field_ids'] for x in f[k].split(';') if x) for f in features))
controls=read('docs/design/04-ux-ui/field-control-map.csv')
check('261字段有控件契约、页面放置引用有效',len(field_ids)==261 and field_ids=={p['field_id'] for p in controls} and {p['field_id'] for p in placements}<=field_ids)
common_missing=field_ids-{p['field_id'] for p in placements}
check('未逐页放置的21字段均为COM共用契约',len(common_missing)==21 and all(x.startswith('COM-') for x in common_missing))
write('common-field-review.csv',[dict(field_id=r['field_id'],name=r['name'],code=r['code'],design_coverage='D3 common-fields.md及D4 field-control-map.csv',presentation='由业务编号/状态/查询分页/反馈/依据等共用组件承载；版本和请求标识等不作为普通编辑项',prototype_evidence_boundary='部分字段仅逻辑契约，原型未证明真实请求、快照及审计联动') for r in fields if r['field_id'] in common_missing])
check('26原型文件和锚点可访问',all((ROOT/p['prototype_ref'].split('#')[0]).is_file() and 'id="'+p['prototype_ref'].split('#')[1]+'"' in html for p in pages))
check('所有辅助页面引用有效',all(all(x in by_page for x in t.get('supporting_page_ids','').split(';') if x) for t in trace))
coverage=[]
for r in req:
 t=by_trace[r['req_id']];own_ac=[a for a in acs if a['req_id']==r['req_id']]
 coverage.append(dict(req_id=r['req_id'],priority=r['priority'],requirement=r['requirement_name'],source_id=t['source_id'],flow_id=t['flow_id'],module_id=t['module_id'],prd=by_mod[t['module_id']]['spec_path'],page_id=t['page_id'],page_spec=by_page[t['page_id']]['spec_path'],prototype=t['prototype_ref'],acceptance_ids=';'.join(a['acceptance_id'] for a in own_ac),design_mapping='完整',evidence='evidence/test-results.json；evidence/module-tests.json；evidence/browser-review.json',evidence_boundary='已打开关联页面；具体动作以报告实际执行项为准，不宣称全部AC已执行',production_acceptance='未开发/未实测'))
write('requirement-audit.csv',coverage)
source_values=[
 ('PUB-001','三一350kWh 4x2产品页','厂商产品资料','页面未标发布日期','https://www.sanyglobal.com/cn/product/truck/semi-trailer_tractor/138/1448/','350kWh；SOC20%至80%≤40min','出口4x2样本；实际选型、桩功率和工况须核验'),
 ('PUB-002','三一云南350度换电重卡案例','厂商案例自述','2023-09-14','https://www.sanygroup.com/activity/12924.html','平均1.58kWh/km；单趟110km','云南矿石等运输；非庆阳实测'),
 ('PUB-003','宁德时代百威重卡换电案例','厂商案例自述','2024-05-24','https://www.catl.com/news/7942.html','513kWh；换电5min；满载高速能耗<1.5kWh/km','特定干线案例，不是所有重卡保证值'),
 ('PUB-004','三一2026重卡新品资料','厂商产品资料','2026-02-25','https://www.sanygroup.com/activity/15977.html','SE882：882kWh；SOC20%至80%50min','对应车型及测试条件，不覆盖其他车型'),
 ('PUB-005','宁德时代骐骥模块化换电方案','厂商技术说明','2023-06-12','https://www.catl.com/news/7214.html','171kWh/块，可选1至3块','须匹配车型及换电接口'),
 ('PUB-006','甘肃能源监管办创新市场机制推动高比例新能源发展','国家能源局公开资料','2026-08-28','https://www.nea.gov.cn/20260828/f4ec97126c5f4d7e8ac8f38c100f221b/c.html','甘肃中长期市场由市场自主形成分时价格','不是具体用户电费账单，不推断所有用户适用同一合同'),
 ('PUB-007','甘肃2025版政府定价经营服务收费目录','地方发改委历史目录','2025版','https://fzgg.gansu.gov.cn/fzgg/zfdj/202502/174079896/files/6c95115ab29a4f47ae2a867114b5a366.pdf','历史充换电服务费0.50至0.70元/kWh，不含电费','仅历史敏感性参考，不是2026庆阳合同价格'),
 ('PUB-008','高德货车路径规划基础版','官方API文档','2026-10-13核对','https://lbs.amap.com/api/logistic-service/guide/wagon_path/truck-route-plan-basis','货车尺寸重量轴数和限行信息契约','须确认账户权限、路网覆盖与字段含义，不能承诺矿区通行'),
 ('PUB-009','高德货车未来时间路径规划','官方API文档','2022-08-26页面更新','https://lbs.amap.com/api/webservice/guide/logistics-api/routeplan','出发时间支持当前至未来6天','账户可用能力和未来路况预测需实测'),
 ('PUB-010','高德其他坐标转高德坐标示例','官方示例','2026-10-13核对','https://developer.amap.com/demo/javascript-api-v2/example/other-gaode/othertoamap-more','支持按来源类型转换坐标','来源坐标未知不能盲转或重复转换'),
 ('PUB-011','DeepSeek首次调用与错误码','官方API文档','2026-10-13核对','https://api-docs.deepseek.com/','API基址与可配置模型；错误码另见官方quick_start/error_codes/','文档可读不等于账户模型额度或服务已联通'),
]
write('public-source-register.csv',[dict(source_id=a,title=b,type=c,published=d,url=e,facts=f,limits=g,retrieved='2026-10-13') for a,b,c,d,e,f,g in source_values])
proposals=[
 ('P-001','到站余量20%，敏感性15/20/25%；初始SOC情景80%','设计建议','无通用行业安全阈值证据；充电测试区间不等于安全下限','参考测算；不可自动真实派单','项目车型BMS、安全审定、SOH和温度'),
 ('P-002','参考容量350kWh、能耗1.58kWh/km；另设1.90/2.20压力档','公开样本＋压力假设','PUB-001;PUB-002；后两档为设计提出','不同样本组合仅条件测算','实际车辆配置、空重载路段及历史标定'),
 ('P-003','保留成本/等待两维并列，不设综合权重','用户已确认','用户此前明确选择硬约束后比较成本与等待','当前设计适用','新增唯一最优分数时另行批准'),
 ('P-004','数量显示0.001t，源精度保留；不自动放行交付差异','设计建议','无取得项目磅单/合同容差；公开资料不能确定','报告量与核验量分离','磅秤分度、合同允许差异、实际凭证'),
 ('P-005','一车一有效司机；在途变更需交接确认，余量建替代任务','已确认原则＋设计建议','用户已确认组织方式；责任交接细则非公开','保留事实和原指派历史','换班制度和在途责任签认'),
 ('P-006','充电参考20至80%≤40min；换电机械5min＋5min缓冲','公开样本＋设计建议','PUB-001;PUB-003；缓冲为设计假设','按车型SOC桩功率建模，不含排队','工位并发、有效功率、库存、接口适配'),
 ('P-007','按合同日期/时段导入价格；历史服务费0.50至0.70仅参照','公开机制/历史参考','PUB-006;PUB-007','不设庆阳统一真实电价','当月购电账单及对外收费合同'),
 ('P-008','分项归集，费用缺项不算完整总成本；不默认税率或分摊','已设计规则','D3 metrics/business-rules','已知费用可以复核','租赁、人工、维保、税费和成本中心依据'),
 ('P-009','预测未来4h，15min粒度，5min刷新','设计建议','产品调度窗口提案，不是公开项目事实','原型/试点候选','到站规律和站点数据覆盖'),
 ('P-010','资源参考30s刷新、90s过期；查询重试2/4/8s最多3次','设计建议','PUB-011仅支持错误分类，不支持上述时长事实','写入未知先核查，不盲重试','设备采样协议及接口SLA'),
 ('P-011','100车/10站/20管理员/100司机；查询p95≤2s、限定任务推演p95≤30s','设计候选验收目标','工作负载及耗时由本次设计提出','开发需实际压测，不是已有实绩','实际规模与技术成本评估'),
 ('P-012','≥30天有效样本；WAPE≤20%、等待MAE≤10min候选','设计候选验收目标','无项目历史误差数据；禁止拿样例证明精度','分母为0不算百分比','真实训练/验证分割及样本覆盖'),
 ('P-013','月可用性99.5%；RPO≤1h、RTO≤4h','设计候选验收目标','是业务连续性建议，不是云服务合同事实','真实备份恢复演练验收','业务容损、值守和实际基础设施'),
 ('P-014','H5前台操作；通知投递/司机接收分开；离线保留输入后先核查','用户已确认形态＋设计建议','H5身份与推送由实际系统决定','不承诺手机后台持续定位/推送','身份源、通知渠道和设备权限'),
 ('P-015','严重故障5min未受理升级、一般异常30min提醒','设计建议','不是现场安全SLA或供应商承诺','依业务责任配置；关闭需证据','安全预案、分级条件和值班表'),
 ('P-016','公开规格支持容量比较；用地/接电/通行缺一仍条件推荐','公开参考＋既定边界','PUB-001;PUB-004;PUB-005','不借全国参考值虚构庆阳可研结论','场站坐标、用地、接电及投资报价'),
 ('P-017','DeepSeek官方基址、可配置模型；工具调用仍回业务页确认','公开文档＋既定规则','PUB-011；官方error_codes区分401/402/429/5xx','不连接真实AI，不硬编码旧模型或价格','获准资料、额度、模型目录及工具权限'),
 ('P-018','备注2000字、单附件20MB/JPG PNG PDF、审计候选6自然月','设计建议','输入及留存规则不是项目已批准制度','凭证类型和敏感保留策略另审','业务凭证、隐私和档案政策'),
 ('P-019','按源坐标转换、货车专用能力；未来路径参考上限6天','官方接口范围','PUB-008;PUB-009;PUB-010','缺授权或路网不认定真实可达','账户授权、矿区路网与车辆尺寸重量'),
 ('P-020','source_id＋源事件ID去重；缺源ID先隔离核对，迟到不覆盖已核验事实','设计契约','项目来源唯一键无法从公共互联网获得','不拿时间戳拼接替代事件唯一键','真实事件样本、补传和撤销协议'),
]
write('parameter-proposals.csv',[dict(parameter_id=a,topic=next(p['topic'] for p in params if p['parameter_id']==a),candidate=b,evidence_type=c,basis=d,usage_boundary=e,project_evidence_needed=f,production_auto_enabled='否',approval='D6候选待评审') for a,b,c,d,e,f in proposals])
module_notes={
 'MOD-001':('需求拆单—订单—推演—全批派单','一项冲突整批未生效；SOC越界/缺边界不推演','P-001/002/006/007/019'),
 'MOD-002':('一任务一车一司机、多车次执行与管理员核验','司机报告不是已核验交付；余量不算完成','P-004/005/014/018'),
 'MOD-003':('场站/工位/实际作业、补能预测与计划调整','离线不当空闲；计划不当实际作业','P-006/009/010/020'),
 'MOD-004':('实际/预测负荷、策略与协同计划','缺SOC容量功率不下发储能策略；无设备控制','P-007/009/012/016'),
 'MOD-005':('候选站点与车辆电池分阶段投放','用地/接电缺项不确认为可实施工程','P-002/006/016/019'),
 'MOD-006':('运行监测、预警闭环、同口径总览','关预警不改任务完工；遥测中断不补0','P-010/015/020'),
 'MOD-007':('费用核验、更正版、资产与运力合作','只汇总有效费用；置换方案不当实际投运','P-007/008/016/018'),
 'MOD-008':('问答、整理条件、回业务工作区核对','工具/回答为模拟；对话不能直接派单或控制设备','P-010/017/018'),
 'MOD-009':('主档、质量纠正、主体操作授权、参数与审计','司机绑定本人；未知参数不能启用；原始依据保留','P-010/011/013/014/018/020')}
save('module-review.md','# 九模块评审记录\n\n日期：2026-10-13。表中结论是设计与模拟交互审查，不是生产验收。\n\n| 模块 | 需求数 | 关键业务链 | 必须保持的反例/边界 | 实际运行依赖 |\n|---|---:|---|---|---|\n'+'\n'.join(f"| {m['module_id']} {m['module_name']} | {sum(r['module_id']==m['module_id'] for r in req)} | {module_notes[m['module_id']][0]} | {module_notes[m['module_id']][1]} | {module_notes[m['module_id']][2]} |" for m in mods))
save('coverage-report.md',f'''# D6 需求覆盖与交付物核查

版本：V0.2-D6-RC1；日期：2026-10-13。统计对象为本期57项需求（37项P0、20项P1）、9模块、47项功能、26页面。P0/P1为需求优先级，不代表同数量未关闭问题。

## REQ→FLOW→MOD→PAGE→原型→AC 覆盖统计与计算口径

57/57需求具备来源、流程、模块、主页面、原型路径与验收编号；171条Given/When/Then验收设计覆盖每项正常、边界/异常、权限/隔离三类。47/47功能有输入输出字段、规则、异常、权限代码与逻辑接口。261/261字段有控件契约，319处页面放置覆盖240个不同字段；其余21项为COM共用契约，处理与展示边界见common-field-review.csv，不冒称所有261字段已在原型逐项上屏。来源和引用的结构核对见structural-review.json，逐项见requirement-audit.csv。

“100%”仅指设计映射存在且引用有效，不表示171条验收已逐条执行，更不表示真实业务、模型、接口、数据库、性能和权限安全已通过。

## 页面清单与实际原型路由检查

26/26目的地实际打开并检查主内容；7一级、18二级及总览直接入口，另有3司机入口与4通用入口；详情、历史、车次和核验不增菜单。壳层以用户确认的D5修订002顶部横向导航为准。D4原稿的侧边导航文字是历史设计，不作为最终壳层要求。

## 关键状态、权限、异常路径检查

复核运输全批冲突/成功、司机本人执行、必填、退回及核验，另核对查询失败、过期、版本冲突、未知结果、离线拒写、SOC边界、无可行和计算失败。D6专项包含键盘菜单、面板Tab/Shift+Tab/Escape、焦点返回、表单错误关联、深链接、320px与图表数据表。实际执行记录以evidence各JSON为准；没有完成读屏器或所有浏览器组合测试。

## 数据/指标来源及风险检查

新增11条公开资料登记，20组参数均有参考、候选或项目资料门槛。真实公开样本、厂商自述、算术推算和设计建议分开，全部production_auto_enabled=否。甘肃2026市场分时价格资料支持版本化价格曲线，历史峰谷表不设通用默认；具体合同价仍需实际账单。详见public-reference-parameters.md和parameter-proposals.csv。

## 需要回到上游改动的条目

CR-001已获用户同意执行，只修正来源面板内容和错误文本关联；修改后的D5需重新确认，旧审批哈希不静默更新。D0—D4原件保持不变。旧文档的“待批准/尚未制作”按历史阶段理解，审批事实以design-state.json为准；当前候选优先规则见design-resolution.md。公开数据和候选性能目标作为D6补充提交，不代替用户批准。
''')
save('design-resolution.md','''# 设计候选合并与解释规则

状态：D6候选，随本轮成果待确认；不改写D0—D4历史批准原件。

1. 用户直接决定优先于参考项目、厂商案例或通用模板。建设从零、运营与汇报并重、两角色、需求→订单→任务→车次和完工核验等决定继续生效。
2. 审批状态以design-state.json与真实聊天证据为准。各阶段文件中保留的历史“待批准”“D5规划”不是当前审批事实。
3. 最终壳层以D5修订002及用户“包括：顶部导航＋下方内容”决定为准；覆盖D4左侧导航表述。业务菜单项目不变，依据按需查看，标题无副文案。
4. CR-001修正不改变业务字段、状态或权限；已批准执行不等于修订成果已复审。
5. D6公共参数档案为新增参考；公开样本不自动取代项目资料，设计候选数值待本轮确认。历史模拟SOC、费用或队列不是项目实绩或生产默认。
6. 电价按适用合同/时间曲线，能耗按车型/路段/工况，充电按SOC/有效功率，换电按适配/电池周转。来源缺失时保留缺项，不用参考值自动宣告可执行。
7. 已核验有效事实进入统计；预计、司机报告、取消/终止量、置换建议、计划和资产投运证明分别处理。工程和设备控制不在原型授权范围。
8. 冻结只在用户明确批准D6和D5修订成果后执行。冻结不授权正式开发，也不证明算法、外部接入、性能、安全或灾备可用。
''')
save('approval.md','''# D6 产品设计评审与冻结审批记录

- 设计候选版本：V0.2-D6-RC1。
- 设计范围：全部九模块PRD、26页面规格及独立HTML；D5修订002＋CR-001修正；D6公开依据、候选参数、覆盖与风险记录。
- 审批人/角色：当前用户；本轮最终批准尚未收到。
- 当前评审状态：已完成审查及授权修订，待D5修订稿复审和D6候选确认。
- 通过结论：待用户明确确认，不登记通过。
- 同意设计冻结（是/否）：否；当前不生成冻结文件。
- 已有授权证据：用户在D5修订002交付后答“继续”；D6问题提出后答“同意修订并重新自检”；参数处理答“你自己从网上找一些较为真实的数据补上这块内容”。这些不扩展为D6冻结批准。
- 本次待确认：CR-001后的D5原型；新增公开参考及设计候选值、项目真实启用门槛；D6综合评审结论。确认后才重新登记D5并批准D6。
- 不能从互联网代填的内容：项目实时SOC、实际资源状态、车型/BMS安全审定、当月合同电价、用地接电证明、身份与数据权限、源事件唯一键。
- 启动开发：不在本审批范围，必须另行明确授权并通过冻结校验。
''')
write('issue-closure.csv',[
 dict(issue_id='D6-001',severity='P2',source='R05/共用Source组件',affected_req_or_page='REQ-004;REQ-045;PAGE-005',description='来源入口未显示传入的方案专属说明',owner='设计代理',resolution='CR-001授权后将text纳入当前依据面板；不恢复常驻解释',evidence='evidence/browser-review.json R05',status='已解决'),
 dict(issue_id='D6-002',severity='P2',source='R10/共用表单',affected_req_or_page='PAGE-004及共用表单',description='可见错误未关联输入框，缺aria-invalid',owner='设计代理',resolution='CR-001授权后加入错误ID、aria-invalid与aria-describedby；编辑时清除旧错误',evidence='evidence/browser-review.json R10',status='已解决'),
 dict(issue_id='D6-003',severity='P2',source='D4壳层与D5修订002',affected_req_or_page='全部管理端页面',description='D4历史文档侧导航与用户后续顶部导航决定冲突',owner='设计代理/当前用户',resolution='不改历史原件；design-resolution.md明确D5修订002优先',evidence='design-resolution.md；D5 UI-REVISION-002.md；本轮待确认',status='待候选确认'),
 dict(issue_id='D6-004',severity='P1',source='D3 parameter-register及冻结门槛',affected_req_or_page='P-001至020；真实运行与非功能验收',description='公开参考不能证明项目专属参数已核实；候选量化值和实际启用门槛尚待本轮确认',owner='当前用户/业务数据责任人',resolution='已新增11条公开来源及20组参数候选；待用户确认设计基线边界，实际运行仍须对应项目证据',evidence='public-reference-parameters.md；parameter-proposals.csv；approval.md',status='待确认'),
])
state=json.loads((ROOT/'docs/design/design-state.json').read_text(encoding='utf-8'));hashes=[]
for stage,a in state['approvals'].items():
 changed=[p for p,h in a['file_hashes'].items() if not (ROOT/p).is_file() or digest(ROOT/p)!=h]
 hashes.append({'stage':stage,'matches':not changed,'changed_files':changed,'note':'D5变更仅CR-001授权修订，等待重新审查批准' if stage=='D5' and changed else ''})
check('D0—D4已批准原件哈希一致',all(h['matches'] for h in hashes if h['stage']!='D5'))
check('二十组参数候选与上游登记一一对应',{p['parameter_id'] for p in params}=={p[0] for p in proposals})
result=dict(stage='D6',candidate='V0.2-D6-RC1',status='REVIEW_READY_PENDING_APPROVAL',checks=checks,approved_hashes=hashes,counts=dict(requirements=len(req),priorities=dict(Counter(r['priority'] for r in req)),modules=len(mods),features=len(features),pages=len(pages),fields=len(fields),field_placements=len(placements),interfaces=len(interfaces),acceptance_designs=len(acs),public_sources=len(source_values),parameter_groups=len(proposals)),html_sha256=digest(ROOT/'prototypes/design-preview/index.html'),frozen=False,development_authorized=False)
(OUT/'structural-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert all(c['result']=='PASS' for c in checks),[c for c in checks if c['result']!='PASS']
print(json.dumps({'status':result['status'],'counts':result['counts'],'checks':len(checks)},ensure_ascii=False))
