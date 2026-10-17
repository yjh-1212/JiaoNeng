# 补能与能源三页设计图 V1

日期：2026-10-16。状态：布局讨论稿，待用户确认；非冻结设计，不构成开发授权。

使用内置 imagegen 生成三张独立 PNG；未修改正式源码、接口或数据库。图内为仿真示意数据，视觉生成文字、指标、计数与状态仅用于布局讨论，后续详细规格需统一核对，不以图中生成细节覆盖业务规则。到站、排队、开工/结束过程属于待设计扩充能力，当前系统未被修改为支持这些动作。正式开发需另走设计变更和授权。

- 01-charging-dispatch.png：补能调度，查询、状态、计划列表与按状态操作。
- 02-station-operations.png：场站作业，车辆作业列表、工位状态及异常待办。
- 03-energy-management.png：用能管理，场站日期计量对象、负荷、风险与相关补能安排。

人工自检：三图均为独立横向桌面页面；顶部导航、红白配色、同排查询及默认10条每页；无左侧栏、重复大标题或说明性长段落。页面职责和布局符合本轮建议。未进行交互/接口验收；图内数值与状态不作为业务验收证据。

原始生成提示词如下。

## 补能调度

```text
Use case: ui-mockup. Create one pixel-sharp polished high-fidelity Chinese desktop enterprise SaaS screen, landscape 16:10 around 1920x1200, straight-on flat screenshot, no device frame. Product is 交能融合, a heavy-truck transportation and charging operations platform. Match a restrained Chinese logistics enterprise application: white horizontal top navigation, pale cool gray #f5f6f8 canvas, white panels with subtle #e5e7eb borders, deep crimson #be1230 primary buttons and selected underline, dark charcoal typography, fine gray secondary text, restrained blue/green/amber status pills, 8px radius, compact 14px Chinese sans-serif. Consistent header 72px: left small red outline lightning logo and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源 (active red underline), 运行保障, 规划决策, 经营管理, 系统管理; right compact 仿真 pill and administrator avatar. Below header a slim breadcrumb, then page content with 28px outer margins. No left sidebar, no giant page heading, no slogans or explanatory paragraphs, no KPI hero cards, no marketing illustrations, no excessive gradients/shadows, no open drawer obscuring the main screen. Clear readable simplified Chinese, accurate alignments, beautiful dense but breathable composition. Retain small 仿真 badge for sample business data. Each output must be a SINGLE FULL PAGE, never a collage or multi-screen sheet.
Screen 1: 补能调度. Breadcrumb 工作台 / 补能与能源 / 补能调度.
At top one white filter panel, all controls on ONE row: 关键词 [车牌 / 任务号 / 司机], 场站 [全部场站 v], 补能方式 [全部 v], 计划日期 [2026-10-16 至 2026-10-16], status dropdown, red 查询 and white 重置 buttons right.
Below a large white table panel. Header has tabs 全部 24, 待确认 5, 已安排 12, 需调整 3, 已结束 4; on right small segmented 列表 (selected red) / 排程. Next compact toolbar 已选 2 条 and 清除 on left, white 优化补能 button and primary + 新增安排 on right. Show checkboxes only eligible rows.
Table columns compact: 车辆 / 司机, 运输任务, 补能场站, 预计到站, 服务时段, 补能需求, 预计等待, 状态 / 提醒, 操作. Fill 8 coherent realistic sample rows with 甘M·仿001 …008 and 仿真司机01 etc, tasks RW-2610-0101 etc, stations 北区煤运补能站 / 西区集运换电站 / 南区物流补能站, arrivals 09:20 to14:30. Charge rows show 充电 · 140 kWh; swapping rows show 换电 · 513 kWh规格; waits 0 / 8 / 12 / 25 分钟. Service times actual planned intervals like09:30–10:05. Status includes 待确认 (amber), 已安排 (blue), 需调整 (red subtle), 已完成(green). Risk small second line 任务时窗冲突 / 设备待核验 only on2 rows. Readable station names not internal station IDs. Operations contextually 确认 / 调整 / 查看 / 更多 with crimson main action, no giant buttons.
Rows balanced and generous enough for 2 lines, thin separators, slight hover palegray one row. Footer left 批量确认 button, right 共24条 < 1 2 3 > and 10条/页 dropdown. Bottom-right unobtrusive round lightning AI launcher labeled 交能AI. No charts on this screen. This is a task-oriented transportation charging planning page.
```

## 场站作业

```text
Use case: ui-mockup. Create one pixel-sharp polished high-fidelity Chinese desktop enterprise SaaS screen, landscape 16:10 around 1920x1200, straight-on flat screenshot, no device frame. Product is 交能融合, a heavy-truck transportation and charging operations platform. Match a restrained Chinese logistics enterprise application: white horizontal top navigation, pale cool gray #f5f6f8 canvas, white panels with subtle #e5e7eb borders, deep crimson #be1230 primary buttons and selected underline, dark charcoal typography, fine gray secondary text, restrained blue/green/amber status pills, 8px radius, compact 14px Chinese sans-serif. Consistent header 72px: left small red outline lightning logo and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源 (active red underline), 运行保障, 规划决策, 经营管理, 系统管理; right compact 仿真 pill and administrator avatar. Below header a slim breadcrumb, then page content with 28px outer margins. No left sidebar, no giant page heading, no slogans or explanatory paragraphs, no KPI hero cards, no marketing illustrations, no excessive gradients/shadows, no open drawer obscuring the main screen. Clear readable simplified Chinese, accurate alignments, beautiful dense but breathable composition. Retain small 仿真 badge for sample business data. Each output must be a SINGLE FULL PAGE, never a collage or multi-screen sheet.
Screen 2: 场站作业. Breadcrumb 工作台 / 补能与能源 / 场站作业.
Top white same-line query panel: 场站 [北区煤运补能站 v], 作业日期 [2026-10-16], 关键词 [车牌 / 计划号], 补能方式 [全部 v], red 查询 and white 重置.
Main white card with tabs 现场作业(selected) / 作业记录 and on right white 临时到站 and red + 登记作业. Immediately below one slim horizontal summary bar (not KPI cards): 待到站 6 | 待服务 3 | 补能中 2 | 待核验 2, tiny timestamp 数据更新 10:32 · 仿真.
Main content split 72% left worklist and28% right station workstations. Left clean table with section title 当班车辆 and statuschips 全部 / 待到站 / 待服务 / 补能中 / 待核验. Columns 车辆/司机, 关联计划, 到站/开始, 工位/方式, 作业进展, 状态, 操作.
7 rows heavy truck plates 甘M·仿004 etc, 仿真司机04 etc, plans BN-2610-0101, times 09:40,10:05,10:18. Include one待到站 with ETA10:45 and action查看安排; two待服务 with真实登记到站时间 and等待12分钟, action安排工位; two充电中with进展 86/140 kWh and thinredprogressline, 工位01/02, action登记结束; two待核验 with actual132/118kWh and source amount¥168.96/¥151.04 and main 核验 button. Distinguish actual recorded progress from planned quantities; no fake liveclaims. Worklist cells concise and readable.
Right column title 工位状态 then vertically four neat compact workstation tiles: 01号充电位 占用 with甘M·仿004, 当前160kW, 预计11:05释放; 02号充电位 占用 with甘M·仿008, 当前180kW, 预计11:20释放;03号充电位 空闲 with有效功率240kW;04号充电位 待核实 with gray 数据延迟. Colored mini statusdots, thinborders, cleanwhite. Beneath tiles compact 异常待办 1 row: 04号工位数据延迟 · 核查. Avoid full map or heavy illustration.
Footer table shows 共13条 1 2 10条/页. Bottom right small AI lightning bubble. Calm precise clean operations screen. Arrival/start/end event workflow is a proposed design, render no annotation claiming current system support.
```

## 用能管理

```text
Use case: ui-mockup. Create one pixel-sharp polished high-fidelity Chinese desktop enterprise SaaS screen, landscape 16:10 around 1920x1200, straight-on flat screenshot, no device frame. Product is 交能融合, a heavy-truck transportation and charging operations platform. Match a restrained Chinese logistics enterprise application: white horizontal top navigation, pale cool gray #f5f6f8 canvas, white panels with subtle #e5e7eb borders, deep crimson #be1230 primary buttons and selected underline, dark charcoal typography, fine gray secondary text, restrained blue/green/amber status pills, 8px radius, compact 14px Chinese sans-serif. Consistent header 72px: left small red outline lightning logo and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源 (active red underline), 运行保障, 规划决策, 经营管理, 系统管理; right compact 仿真 pill and administrator avatar. Below header a slim breadcrumb, then page content with 28px outer margins. No left sidebar, no giant page heading, no slogans or explanatory paragraphs, no KPI hero cards, no marketing illustrations, no excessive gradients/shadows, no open drawer obscuring the main screen. Clear readable simplified Chinese, accurate alignments, beautiful dense but breathable composition. Retain small 仿真 badge for sample business data. Each output must be a SINGLE FULL PAGE, never a collage or multi-screen sheet.
Screen 3: 用能管理. Breadcrumb 工作台 / 补能与能源 / 用能管理.
One horizontal white filter card: 场站 [北区煤运补能站 v], 日期 [2026-10-16], 计量对象 [场站总表 v], red 查询 and white 重置 at right.
Main workspace whitepanel header tabs 用能分析(selected) / 优化计划, right subtle button 生成优化建议.
A narrow horizontal metric strip of four restrained inline text groups separated by hairlines, no detachedcards: 当日用电 1,286 kWh; 已知用能费用 ¥1,646.08; 已测峰值 612 kW; 供电上限 720 kW. Actual quantities only from measured periods.
Below clean large time-series chart occupies left70% width, right30% a white contextual risk/action panel separatedbyhairline. Chart title 分时负荷, tiny legend 实际负荷 blue solid / 预测负荷 crimson dashed / 供电上限 graydashed. Xaxis 00:00 04:00 08:00 12:00 16:00 20:00 24:00. Yaxis 功率(kW) 0,200,400,600,800. Actualblue solid curve ends at10:30 near530, missingsection breaks visible notzero. Forecast red dashed from10:30 rises to780 near14:00 then650 at16 and380night. Horizontal720supplylimit, paleamber shaded12:30–14:00riskband. Markrisk tooltip nearpeak 预计超限60kW. Finelines andreadableaxis nofancy3D.
Right panel title 用能提醒, amber smallbadge 1项需处理. Content short operational facts: 12:30–14:00预计供电紧张; 关联补能安排4辆; 其中1辆可调整时段. Primaryoutlined 查看相关安排 and red 比较错峰方案. Small neutralcaption 预测 · 仿真数据, not explanationparagraph.
Bottom section title 需关注的补能安排, compact table4rows columns 车辆, 场站/工位, 计划时段, 预计电量, 任务约束, 操作. Threeplates 甘M·仿005/006/009, intervals 12:30–13:10,13:00–13:45,13:10–13:55, quantities140,160,150kWh. Constraints 需15:30前返场, 可延后30分钟, 有任务时窗. Links 查看 / 比较调整. Small pagination10条/页. Keep plain workflow not financialtradingdashboard.
Bottom-right unobtrusive 交能AI launcher. Wholepage crisp,white,structured withone chartandactionabletable.
```

