# 补能与能源三页设计图 V2

2026-10-16。用户要求按解释后的业务分工和关联重新生成三张设计图。状态：设计预览，待用户确认，非冻结规格或开发授权。内置 imagegen 生成，全部为仿真示意，未修改正式代码/API/数据库，V1保留。

- 01-charging-dispatch.png：补能前安排，来源任务/订单、运输时限、补能计划及作业结果入口。
- 02-station-operations.png：补能中作业，关联计划/任务、计划与实际、工位状态、核验入口。
- 03-energy-management.png：场站用能，负荷风险、受影响的补能计划/运输任务/订单及可调整时限。

人工自检：单独三页、顶部导航、同排查询、白底红色主操作、无重复大标题；关联入口与运输约束在列表可见。计划时段和实际作业区分，预测与实际负荷分开，工位占用与待核实区分。生成图中的部分标识、计数及跨图占位数据未完全统一；正式规格应统一同一仿真场景并修正，不能把图片当数据库事实。图内链接及按钮仅为视觉表达，非交互原型。司机执行、临时到站和工位安排等需另行详细设计与实施。此轮没有完成接口或浏览器交互验收。

场站页另做一次标识修正，尽量区分后续补能计划与已发生作业，使用内置 imagegen 编辑；最终文件以本目录为准。

## 生成提示词

### 补能调度

```text
Use case: ui-mockup. Create ONE polished pixel-sharp Chinese enterprise desktop web application screenshot, landscape 1920x1200 approximately 16:10, no browser/device frame, no collage. Product 交能融合, heavy-truck transport and charging platform. White horizontal navigation bar height72, pale cool gray canvas #f5f6f8, white panels with subtle borders #e5e7eb and8px radius, deep crimson #be1230 selected/primary actions, dark charcoal14px Chinese sans-serif, subdued secondary text, restrained blue green amber status pills. Dense and professional with breathing room. Header left red outlined lightning emblem and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源(active underline), 运行保障, 规划决策, 经营管理, 系统管理. Right 仿真 badge and 管理员 avatar. Slim breadcrumb below header. Outer margins28px. No sidebar, no giant page title, no explanatory paragraphs, no promotional illustration, no detached giant KPI cards, no shadows/gradients overload. Buttons compact and consistent; routine row actions text links, crimson filled button only for page primary action. Accurate readable simplified Chinese. All data are explicitly 仿真示意; no claim of live equipment integration. At bottom a small circle lightning launcher 交能AI. Show the core page unobscured, no drawer open. This is V2: reveal the connections from transport order to task to charging plan to actual session through compact clickable identifiers and context-specific actions, not through an explanatory flowchart plastered on screen. Keep one common exact design system across three pages. Include 10条/页 pagination where relevant.
Page1 补能调度. Breadcrumb 工作台 / 补能与能源 / 补能调度.
Top white horizontal query card: 关键词 [车牌 / 任务号 / 订单号], 场站 [全部场站 v], 计划日期 [2026-10-16], 状态 [全部 v], crimson 查询 and white 重置 on SAME row.
Main white worktable. Header tabs 全部24 / 待确认5 / 已安排12 / 需调整3 / 已结束4, right segmented 列表(selected)/排程. Toolbar subtle redoutlined 仅看风险(3) filter atleft; right secondary 优化补能, primary + 新增安排. No selected rows and no batch toolbar until selection.
Eight readable business rows, table columns: 车辆 / 司机 | 来源任务 / 订单 | 补能安排 | 到站 / 服务时段 | 补能需求 | 运输约束 | 状态 / 风险 | 操作.
Use8 consistent rows:
1 甘M·仿004 / 仿真司机04, clickable RW-2610-0104 and muted DD-2610-0021, 北区煤运补能站 / BN-2610-0104, 预计12:30 /12:40–13:20, 充电140kWh /预计等待10分钟, 14:00前离站, 已安排blue, actions 查看 / 调整 / 更多.
2 甘M·仿005 /仿真司机05, RW-2610-0105 /DD-2610-0021, 北区煤运补能站 / BN-2610-0105, 预计13:00 /13:10–13:50, 充电160kWh /等待10分钟, 14:10前离站, 需调整red /供电时段冲突, actions 比较调整 /查看.
3 甘M·仿006 /仿真司机06, RW-2610-0106 /DD-2610-0022, 北区煤运补能站 /BN-2610-0106, 预计13:10 /13:20–14:00, 充电150kWh /等待10分钟, 15:30前返场, 需调整red /可延后30分钟, actions 比较调整 /查看.
4 甘M·仿007 /仿真司机07, RW-2610-0107 /DD-2610-0022, 西区集运换电站 /BN-2610-0107, 预计11:00 /11:05–11:15, 换电 /513kWh规格, 12:00前离站, 待确认amber, 确认 /调整.
5 甘M·仿008 /仿真司机08, RW-2610-0108 /DD-2610-0023, 北区煤运补能站 /BN-2610-0108, 预计10:10 /10:20–11:00, 充电140kWh /等待10分钟, 12:00前离站, 已安排blue, 查看 /调整.
6 甘M·仿009 /仿真司机09, RW-2610-0109 /DD-2610-0023, 南区物流补能站 /BN-2610-0109, 预计15:00 /15:05–15:45, 充电120kWh /等待5分钟, 16:30前离站, 待确认amber, 确认 /调整.
7 甘M·仿002 /仿真司机02, RW-2610-0102 /DD-2610-0020, 北区煤运补能站 /BN-2610-0102, 预计09:00 /09:05–09:45, 充电130kWh /等待5分钟, 11:00前离站, 已结束green, 作业结果 /查看任务.
8 甘M·仿003 /仿真司机03, RW-2610-0103 /DD-2610-0020, 西区集运换电站 /BN-2610-0103, 预计09:30 /09:35–09:45, 换电 /513kWh规格, 11:30前离站, 已结束green, 作业结果 /查看任务.
Use condensed dual lines tofit, link taskcode crimson andordercode muted. All stationmode consistent. Small headerinfo 已关联运输任务20条 · 临时安排4条, notparagraph. Redrisk onlyon relevantrows; conflicts cannot show enabled确认. Bottom pagination 共24条 <1 2 3>10条/页. No charts. Main purpose show planning tied to transport, not terminal actual operation.
```

### 场站作业

```text
Use case: ui-mockup. Create ONE polished pixel-sharp Chinese enterprise desktop web application screenshot, landscape 1920x1200 approximately 16:10, no browser/device frame, no collage. Product 交能融合, heavy-truck transport and charging platform. White horizontal navigation bar height72, pale cool gray canvas #f5f6f8, white panels with subtle borders #e5e7eb and8px radius, deep crimson #be1230 selected/primary actions, dark charcoal14px Chinese sans-serif, subdued secondary text, restrained blue green amber status pills. Dense and professional with breathing room. Header left red outlined lightning emblem and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源(active underline), 运行保障, 规划决策, 经营管理, 系统管理. Right 仿真 badge and 管理员 avatar. Slim breadcrumb below header. Outer margins28px. No sidebar, no giant page title, no explanatory paragraphs, no promotional illustration, no detached giant KPI cards, no shadows/gradients overload. Buttons compact and consistent; routine row actions text links, crimson filled button only for page primary action. Accurate readable simplified Chinese. All data are explicitly 仿真示意; no claim of live equipment integration. At bottom a small circle lightning launcher 交能AI. Show the core page unobscured, no drawer open. This is V2: reveal the connections from transport order to task to charging plan to actual session through compact clickable identifiers and context-specific actions, not through an explanatory flowchart plastered on screen. Keep one common exact design system across three pages. Include 10条/页 pagination where relevant.
Page2 场站作业. Breadcrumb 工作台 / 补能与能源 / 场站作业.
Top same-row query card: 场站 [北区煤运补能站 v], 作业日期 [2026-10-16], 关键词 [车牌 / 计划号 / 任务号], crimson 查询 white 重置.
White panelheader tabs 现场作业(selected) /作业记录; right secondary 临时到站 primary + 登记作业. Thin summary in one strip (no cards) 待到站2 |待服务2 |补能中2 |待核验2 | small 时点10:32 ·仿真示意.
Main area left75% tasktable andright25% workstationstatus. Lefttitle 当前作业, smalltabs 全部8 /待到站2 /待服务2 /补能中2 /待核验2. Tablecolumns 车辆/司机 |关联计划/任务 |到站/开始 |工位/方式 |计划/实际 |状态 |操作. Eight rows arrangedbyactualstatus with all boundrecords:
1 甘M·仿004 司机04, BN-2610-0104 /RW-2610-0104 clickable, 预计12:30, 尚未分配 /充电, 计划140kWh /14:00前离站, 待到站, 查看安排.
2 甘M·仿005 司机05, BN-2610-0105 /RW-2610-0105,预计13:00, 尚未分配/充电,计划160kWh/14:10前离站,待到站,查看安排.
3 甘M·仿001 司机01,BN-2610-0101 /RW-2610-0101,到站10:20 /等待12分钟,未分配/充电,计划140kWh/12:30前离站,待服务blue,安排工位.
4 甘M·仿003 司机03,BN-2610-0103 /RW-2610-0103,到站10:25 /等待7分钟,未分配/充电,计划120kWh/13:00前离站,待服务blue,安排工位.
5 甘M·仿007 司机07,BN-2610-0107 /RW-2610-0107,到站09:40/开始09:46,01号/充电,计划140kWh/已计量86kWh thinprogress,补能中green,登记结束.
6 甘M·仿008 司机08,BN-2610-0108 /RW-2610-0108,到站10:10/开始10:20,02号/充电,计划140kWh/已计量28kWh thinprogress,补能中green,登记结束.
7 甘M·仿002 司机02,BN-2610-0102 /RW-2610-0102,开始09:05/结束09:45,03号/充电,计划130kWh/实际132kWh,待核验amber,核验 /作业凭证.
8 甘M·仿006 司机06,BN-2610-0106 /RW-2610-0106,开始09:15/结束10:00,03号/充电,计划120kWh/实际118kWh,待核验amber,核验 /作业凭证.
Avoid hugeperrowbuttons, primaryrowaction crimsontextlinks. Two measured complete jobs have no progressbars pretendingongoing.
Right工位状态4compacttiles:01号充电位 占用 /甘M·仿007 /预计11:05释放;02号充电位占用/甘M·仿008/预计11:20释放;03号充电位空闲/有效功率240kW;04号充电位待核实/数据延迟. State accuratelydistinguishconnectionandoperation. Beneath onecompact异常待办1row 04号工位数据延迟 核查. Bottomleft共8条andright10条/页. Show actualoperationalworkflowwith visibleplan/tasklinkage, notfilesandregistration. This is proposedUIwithsimulatedevents, notliveintegration.
```

### 用能管理

```text
Use case: ui-mockup. Create ONE polished pixel-sharp Chinese enterprise desktop web application screenshot, landscape 1920x1200 approximately 16:10, no browser/device frame, no collage. Product 交能融合, heavy-truck transport and charging platform. White horizontal navigation bar height72, pale cool gray canvas #f5f6f8, white panels with subtle borders #e5e7eb and8px radius, deep crimson #be1230 selected/primary actions, dark charcoal14px Chinese sans-serif, subdued secondary text, restrained blue green amber status pills. Dense and professional with breathing room. Header left red outlined lightning emblem and bold 交能融合; nav 运营总览, 订单管理, 任务调度, 补能与能源(active underline), 运行保障, 规划决策, 经营管理, 系统管理. Right 仿真 badge and 管理员 avatar. Slim breadcrumb below header. Outer margins28px. No sidebar, no giant page title, no explanatory paragraphs, no promotional illustration, no detached giant KPI cards, no shadows/gradients overload. Buttons compact and consistent; routine row actions text links, crimson filled button only for page primary action. Accurate readable simplified Chinese. All data are explicitly 仿真示意; no claim of live equipment integration. At bottom a small circle lightning launcher 交能AI. Show the core page unobscured, no drawer open. This is V2: reveal the connections from transport order to task to charging plan to actual session through compact clickable identifiers and context-specific actions, not through an explanatory flowchart plastered on screen. Keep one common exact design system across three pages. Include 10条/页 pagination where relevant.
Page3 用能管理. Breadcrumb 工作台 /补能与能源 /用能管理.
Top white queryone row: 场站[北区煤运补能站 v],日期[2026-10-16],计量对象[场站总表 v],crimson查询 white重置.
Main whitepaneltabs 用能分析(selected)/优化计划, right secondary生成优化建议.
Sliminline metricsseparatorstrip 当日用电1,286kWh |已知用能费用¥1,646.08 |已测峰值612kW |供电上限720kW; notdetachedKPIcards.
Middlechart65%left andrisk/actionpanel35%right. Charttitle分时负荷, tinylegend实际blue solid/预测red dashed/供电上限graydashed. xaxis00:00,04:00,08:00,12:00,16:00,20:00,24:00 yaxis功率(kW)0,200,400,600,800. Realbluecurve ends10:30at530kW, historicalpeak612kWaround08:30 andthenfalls; predictedred starts10:30 risesaboveline720peaking780at13:20 andfallsbelow720by14:00then650at16:00and380night. Shade12:30–14:00paleyellowriskband; tooltip预计峰值780kW. Horizontal720kW clearlylabel. No fakeactualdatafuture.
Righttitle供电风险 smallamberbadge需处理. Concisefacts 12:30–14:00预计超限60kW,关联4个补能计划,影响3个运输订单. Withinpanel threecompactfactsrows:运输时效优先;可调整1辆;其他3辆需保留时窗. Twoactions 查看关联任务 (outline) 比较错峰方案(crimson). Small仿真预测 notlongexplanation.
Bottomfullwidthtable title受影响的补能安排, clearlyshowslineageandtransportdeadline. Columns车辆 |补能计划/运输任务 |来源订单 |计划时段/预计电量 |运输约束 |调整空间 |操作.
4 rows:
甘M·仿004 BN-2610-0104/RW-2610-0104 DD-2610-0021 12:40–13:20 /140kWh 14:00前离站 保留当前时窗 查看任务
甘M·仿005 BN-2610-0105/RW-2610-0105 DD-2610-0021 13:10–13:50 /160kWh 14:10前离站 保留当前时窗 查看任务
甘M·仿006 BN-2610-0106/RW-2610-0106 DD-2610-0022 13:20–14:00 /150kWh 15:30前返场 可延后30分钟(greensubtle) 比较调整
甘M·仿010 BN-2610-0110/RW-2610-0110 DD-2610-0024 12:50–13:30 /140kWh 14:00前离站 保留当前时窗 查看任务
Taskcodes clickablecrimson;ordercodesmuted. Beneath compactpagination共4条10条/页.
Criticalprimarypurpose: stationenergyconstraints tiedtospecificchargingplans andtransporttasktimelimits. Optimizationis proposalrequiringhumanconfirmation, no autonomousdispatch ordevicecontrolbuttons. Cleanbeautifulcoherent enterpriseUI.
```

