# 运行保障页面设计图 V1

日期：2026-10-16。状态：设计评审草案，待用户确认；不是已实现功能或已冻结设计。

## 交付文件

- `01-operation-monitoring.png`：运行监控。查询、关注对象列表、地图、选中车辆关联任务/订单/补能与异常。
- `02-incident-handling.png`：异常处置。列表与右侧详情抽屉，体现业务影响、处理人、处理进展、业务调整入口和提交核验。

全部业务数据为仿真示意，地图为视觉设计示意，不代表真实定位、道路规划或设备连接。设计采用顶部导航与当前红白风格，一级菜单使用“能源管理”。保留运行保障一级菜单，建议两个二级菜单为“运行监控”“异常处置”。正式代码、数据库及冻结文件均未修改。

## 业务边界

同一异常可关联订单、任务、车辆、场站、设备与补能计划；业务调整在原业务模块中由管理员确认，已发生记录保留。任务计划运量不等于损失运量。异常关闭不自动完成运输任务。AI不自动派单或操作设备。待新设计获批及开发授权后再实施真实联动。

## 生成方式与提示词

使用内置 image_gen 工具，原能源页面图仅作为视觉风格参考；两张独立图片分别生成。

### 运行监控

```text
Use case ui-mockup. Generate ONE polished pixel-sharp Chinese enterprise web app screenshot, landscape 1920x1200 about16:10, no browser frame, no device, no collage. Reference image is STYLE ONLY, not edit target: match its clean compact white panels, pale cool gray #f5f6f8 page, subtle #e5e7eb borders, 8px radius, dark charcoal readable Chinese sans-serif, deep crimson #be1230 selectednav and primaryactions, muted secondarytext and restrained blue green amber pills. Product 交能融合 heavy electrictruck transport platform. White top horizontalnav72px with left lightning emblem and bold交能融合, exactnav运营总览、订单管理、任务调度、能源管理、运行保障(active crimson underline)、规划决策、经营管理、系统管理. Right 仿真示意 badge and管理员avatar. Below slim breadcrumb and onlytwo subtabs 运行监控、异常处置. No sidebar, giantpageheading, explanatoryparagraphs, promotionalillustration, detachedKPIcards, glassmorphism, darkmode, gradients, exaggeratedshadows. Condensed functional UI with substantial map/table area and good whitespace. All Chinese accurate legible SimplifiedChinese. Badge仿真示意 mandatory, timestamp2026-10-16 10:32. No claims of liveintegration. No visible giant explanatory business flowchart. Task/order/charging references show compact actionable linkage instead. Station names 北区煤运补能站、西区集运换电站、南区物流补能站. Fake plates 甘M·仿004 etc make simulationobvious. Shared incidentYJ-261016-003: 北区煤运补能站04号充电位故障, affectsBN-2610-0105 andRW-2610-0105 andDD-2610-0021, vehicle甘M·仿005,司机05; assignee王调度; status处理中; driverconfirmedreported09:58. Do not invent actualrepairoutcome, arrival confirmation, routeprecision or automatic dispatch. 10条/页 pagination for lists. Bottomright tiny circular交能AI launcher. Deliver entire screenshot in one image.
PAGE1运行监控: breadcrumb工作台 /运行保障 /运行监控; 运行监控tabactive.
Top single white querycard one horizontalrow:关键词[车牌 /任务号 /订单号],主体[全部主体v],运输阶段[全部v],风险[全部v],数据状态[全部v],crimson查询 and white重置. Narrow secondlineonlycompact chips 全部18 |需关注4(selectedsubtlered) |运输中8 |补能中3 |待反馈2; rightclock 10:32 and刷新.
Main huge singlewhiteworkarea underfilters: left300px objectlist, centerflexible map~800px, right350px objectsummary, alignedheight~740px. Internalleftheader 需关注车辆 4 and searchicon. Fourreadableverticalvehicle rows, selectedsecond:
甘M·仿004 仿真司机04, RW-2610-0104, 节点反馈超时 amber, 计划10:20装货,更新10:31.
甘M·仿005 仿真司机05, RW-2610-0105, 补能安排受影响 crimson, 北区煤运补能站,更新10:31.
甘M·仿006 仿真司机06, RW-2610-0106, 电量待核实 amber, SOC18%·09:40, 数据延迟.
甘M·仿009 仿真司机09, RW-2610-0109, 定位数据延迟 gray, 最后定位09:50,运行状态未知.
Listfooter 共4辆 <1>10条/页.
Center light credible roadmap style around甘肃庆阳西峰区/庆城县, realistic curved roads/highways/rivers/labels, no fabricated straight trajectory connectingrandompoints. Show origin矿区装载点, destination北区集运中心, three smallchargingstationpins plus truck markers. Selectedtruckblue marker甘M·仿005 near北区煤运补能站. Small station04号充电位故障 redpill. Road-following BLUE DASHED plannedroute exists selectedtask only, clearly legend计划路线, no actual drivenroute asserted. Small map legend车辆 /补能站 /异常, show selecteddata最近采集10:31 notfake livegreen. Mapcontrols +,-, layers in unobtrusiveleftbottom. Center top minitoggle 车辆(selected) 场站. No future animatedpoints or longparagraphs.
Right summary whitepanelheader 甘M·仿005, redsmall需关注; second 仿真司机05·运输中. Section当前任务 includes linkRW-2610-0105, sourceorderlinkDD-2610-0021, 煤炭·任务计划100吨, 矿区装载点→北区集运中心, 要求到达15:00, 当前节点前往补能站, 下一节点补能. Buttons查看任务 and轨迹回放. Nextsection车辆信息 SOC42%·10:31,最近位置庆城县G211附近, last采集10:31 and仿真采样badge. Nextsection补能安排 clickableBN-2610-0105,北区煤运补能站,预计13:10–13:50,充电160kWh, 14:10前离站, text red04号充电位故障·安排需核实. Link查看补能安排.
Nextcompactsection关联异常1: YJ-261016-003 故障影响补能;处理中 王调度. Primary处理异常 and secondary登记异常 inbottomstickyrightpanel. No enabledconfirmrepair button. Everything clear and notovercrowded. Core visual prioritymapandselectedtaskcontext.
```

### 异常处置

```text
Use case ui-mockup. Generate ONE polished pixel-sharp Chinese enterprise web app screenshot, landscape 1920x1200 about16:10, no browser frame, no device, no collage. Reference image is STYLE ONLY, not edit target: match its clean compact white panels, pale cool gray #f5f6f8 page, subtle #e5e7eb borders, 8px radius, dark charcoal readable Chinese sans-serif, deep crimson #be1230 selectednav and primaryactions, muted secondarytext and restrained blue green amber pills. Product 交能融合 heavy electrictruck transport platform. White top horizontalnav72px with left lightning emblem and bold交能融合, exactnav运营总览、订单管理、任务调度、能源管理、运行保障(active crimson underline)、规划决策、经营管理、系统管理. Right 仿真示意 badge and管理员avatar. Below slim breadcrumb and onlytwo subtabs 运行监控、异常处置. No sidebar, giantpageheading, explanatoryparagraphs, promotionalillustration, detachedKPIcards, glassmorphism, darkmode, gradients, exaggeratedshadows. Condensed functional UI with substantial map/table area and good whitespace. All Chinese accurate legible SimplifiedChinese. Badge仿真示意 mandatory, timestamp2026-10-16 10:32. No claims of liveintegration. No visible giant explanatory business flowchart. Task/order/charging references show compact actionable linkage instead. Station names 北区煤运补能站、西区集运换电站、南区物流补能站. Fake plates 甘M·仿004 etc make simulationobvious. Shared incidentYJ-261016-003: 北区煤运补能站04号充电位故障, affectsBN-2610-0105 andRW-2610-0105 andDD-2610-0021, vehicle甘M·仿005,司机05; assignee王调度; status处理中; driverconfirmedreported09:58. Do not invent actualrepairoutcome, arrival confirmation, routeprecision or automatic dispatch. 10条/页 pagination for lists. Bottomright tiny circular交能AI launcher. Deliver entire screenshot in one image.
PAGE2异常处置 breadcrumb工作台 /运行保障 /异常处置;异常处置tabactive.
Show mainlist and an OPEN rightdetaildrawer toshow interaction, no generic helptext. White drawer~650px (34%width), anchoredrightbelowtopnavigation, no darkfullpage veil, leftlist~1200px visible;subtledividerandshadow. Lefttop filtercard two compactrows ifrequiredbydrawerwidth:关键词[异常号 /车牌 /任务号]、类型[全部v]、处理人[全部v]、发生日期[2026-10-16]、查询 重置. Belowwhitepaneltabs 待受理3、处理中4(activecrimson)、待核验2、已关闭6、全部15; rightprimary+登记异常.
Tablecolumns 异常 /发生时间 |关联对象 /任务 |业务影响 |处理人 /要求反馈 |状态 |操作. 7clearlyreadable rows nottoo cramped:
YJ-261016-003 充电位故障,10-16 09:58,甘M·仿005 /RW-2610-0105,补能安排受影响 /交付影响待核实,王调度 /11:00前反馈,处理中,查看(crimson). Selectedpaleredbackground.
YJ-261016-004 车辆故障,10-16 10:06,甘M·仿008 /RW-2610-0108,当前运输受阻 /涉及计划80吨,李调度 /10:45前反馈,处理中,查看.
YJ-261016-005 装货等待,10-16 10:12,甘M·仿004 /RW-2610-0104,节点反馈超时 /到达影响待核实,王调度 /11:20前反馈,处理中,查看.
YJ-261016-006 定位数据延迟,10-16 10:20,甘M·仿009 /RW-2610-0109,当前位置待核实,陈调度 /11:00前反馈,处理中,查看.
Only4rows forselected处理中4! Spacebelowtableblanklightwhite notinvent7. Tablefooter共4条 <1>10条/页. No selectioncheckboxes unlessrealbulkactions. Generalstatus tabs counts sum3+4+2+6=15.
Rightdrawer header异常详情, closeX. YJ-261016-003, redseverity较高 andblue处理中. Title 北区煤运补能站04号充电位故障. tabs 处置详情(selected) /处理记录. Compact read-onlyfacts 来源司机反馈·09:58;处理人王调度;要求反馈11:00;对象04号充电位.
Section异常情况: onebriefactualreport “司机反馈04号充电位无法启动，现场情况待核实。” Use 2linesmaximum, notexplanation.
Section受影响业务: threecompact linkedrows:
运输订单 DD-2610-0021
运输任务 RW-2610-0105 ·甘M·仿005
补能计划 BN-2610-0105 ·13:10–13:50
pluschips涉及任务1个 /任务计划100吨 /交付影响待核实. Do notclaim100tonslost/totalorderlate.
Section处理安排: currentactualaction 王调度正在核实可用工位和替代场站. Three outlined smallbuttons 调整补能、查看任务、重新推演 withappropriateicons. These navigaterelevantmodules, notautodispatch.
Section处置进展 narrowvertical timeline:
09:58司机上报 故障无法启动
10:05管理员受理 王调度负责
10:18核实现场 已联系场站，等待确认
10:25司机补充 当前任务继续按原安排待命
No fabricatedresetorrepaircompletion.
Section处理结果: textarea placeholder填写实际采取的措施及恢复情况; two smalloptionalcontrols补充凭证 and司机反馈link. No automaticrepair orcloseall.
Drawerfixedbottom left次操作转交处理 andrightcrimson提交核验 (not直接关闭because处理中). Small readonlydriverreceipt status 调整安排尚未确认, only if fits. Make this screen visuallybalanced denseprofessionallistplusclear businessimpact and actiondrawer.
```

