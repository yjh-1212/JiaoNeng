# 规划决策页面设计图 v1

日期：2026-10-16

本目录为待用户确认的页面设计提案，不代表已实施或已冻结的产品需求。

## 两张设计图

- 01-station-planning.png：场站规划。地图展示运输走廊与候选站点，两侧悬浮候选方案和推荐结果，下方比较覆盖、绕行、等待、工位和供电条件。
- 02-fleet-planning.png：运力规划。建议将原“资源投放”改名为“运力规划”，展示建议总量、现有可用资源、新增缺口、约束校验及分期安排。

两页共享“北区煤运走廊规划（仿真）”、基准期及参考场站方案。用户确认参考方案后，仍需核实资源与建设条件，不自动采购、派单或启用。

## 示例数据口径

所有数字、地图路线、预测及计算结果均为仿真示意，不是工程可研结论、真实账单、审批结果或经过校准的预测。

- 日运量 2400 吨，有效载重 30 吨，作业窗口 8 小时。
- 建议车辆 30 辆（执行 27、备用 3），现有档案 32 辆，其中可用且适配 22 辆，缺口 8 辆；其余 10 辆被占用或不适配。
- 司机需求 30 人，现有可用 24 人，缺口 6 人。
- 随车电池跟随车辆配置，不重复计算车辆投资；纯充电方案不配置换电备用电池。
- 场站方案 A 从 4 个充电工位扩至 6 个，新增 2 个；充电功率 1440 kW，加其他负荷 160 kW，合计需求 1600 kW，可用供电 2000 kW。
- 一期车辆累计 16 辆，全部使用现有资源。二期累计 30 辆，本期再投入 14 辆，由现有剩余可用 6 辆及新增 8 辆组成。
- 设备价格、采购租赁预算及工程条件仍需核实，不依据示意费用宣称投资回报。

## 生成与边界

使用内置 image_gen 工具生成。视觉参考为同项目 prototypes/design-preview/energy-pages-v2/01-charging-dispatch.png，沿用简洁红白风格，顶部菜单使用当前“能源管理”。

此次仅新增本目录中的设计图片与说明，未修改正式源码、数据库、接口、部署配置或冻结文件。图中文字与交互为视觉提案，实际开发前需要确认细节。

## 场站规划生成提示词

```text
Use case: ui-mockup. Create ONE pixel-sharp high-fidelity Chinese enterprise desktop application screenshot, landscape 1920x1200 about16:10, no browser/device frame and no collage. Reference image is STYLE ONLY: keep its white horizontal navigation, pale coolgray #f5f6f8 canvas, thin #e5e7eb borders, compact white panels, 8px corners, charcoal Chinese sans-serif text, crimson #be1230 selected controls and restrained blue/amber/green status tags. Clean, spacious, practical, professionally aligned with dense readable business content. Brand left outlined lightning icon and bold交能融合; top navigation exact 运营总览、订单管理、任务调度、能源管理、运行保障、规划决策(active red underline)、经营管理、系统管理. Right small仿真示意 badge and管理员avatar. Below slim breadcrumb and two secondarytabs 场站规划、运力规划 (oneactive). NO leftsidebar, oversizedpageheading, promotionalillustrations, darkdashboard, decorativecharts, detachedgiantKPIcards, explanatoryparagraphs or giantworkflowdiagram. Red buttons limited to primaryaction; routine actions compact link/outline. Accurate Simplified Chinese, careful text spacing and hierarchy. This is a proposed design review with ILLUSTRATIVE DATA, not real operations, calibratedengineering, or confirmed procurement. Image1 style reference contains an outdated menu name 补能与能源; ALWAYS replace that menu with能源管理.
Both pages share planningproject 北区煤运走廊规划（仿真）, baseline10/01–10/15, schemeV3, target2400吨/日, three transportcorridors, effectivepayload30吨, referenceoneway40km,8hour dailyoperation08:00–16:00. Stockvehicles32, fitavailable22, otheroccupied/incompatible10. Requiredfleet30 = operating27 + reserve3;新增车辆缺口8. Driversrequired30, currentavailable24, gap6. Chargeonly350kWhvehiclefleet, onboardbattery30sets associatedwithfleet, current22 gap8 carried WITH vehicles not doublecounted standalonecost; no swapspares. Adopted stationdesign A北区站扩容＋既有站协同, subjecttohumanreferenceadoption notengineeringapproval. A existingchargers4×240kW=960, proposed6×240kW=1440,新增2; supply2000kW, totalplanningpower1600kW includes160kWotherload. PhaseI1200吨/日 usesexisting16vehicles and4chargers, adds0. PhaseII2400吨/日 cumul30vehicles, adds投入14vehicles = existingremaining6 + new8; cumul6chargers,add2. DriversphaseI16 thenphaseII30:extra14=existing8+new6. All stock/required/gap and phaseincrements must be consistent. Planningresults neverauto dispatch,purchase,activatevehiclesorcontrolhardware. No invented ROI,totalcost or approvals; economicunknowns stay待补齐. Small circle交能AIlauncher, unobtrusive lower right. One complete page, not a poster.
PAGE1场站规划, breadcrumb工作台 /规划决策 /场站规划, secondarytab场站规划active.
Underbreadcrumb fullwidth compact whiteprojecttoolbar: 项目[北区煤运走廊规划（仿真）v] |基准期[2026-10-01 至2026-10-15] |方案[V3] rightbuttons 引用业务数据,调整条件, red重新测算. Smallinlinefactsstrip 日运输需求2400吨 /线路3条 /作业窗08:00–16:00 /数据来源订单＋执行样本. NOT extra large explanatorycopy.
Insideworkbenchtop tabs 需求分析 /选址比选(active) /容量配置 /规划成果. Mainmap occupies widebackground almostentireworkbench fromy300toend; roadmap resembleslightAMap around甘肃庆阳西峰区/庆城县, curvedroads and realistic town labels, threetransportcorridors thinblue road-followingcurves, origin矿区装载点 and destination北区集运中心. NO straight diagonal arbitrarylines. Existingstation symbols gray/blue and candidateA red,Camber,Bblue, candidatelabels clear; maplegend既有站/候选点/运输走廊·仿真路径, zoomcontrols positionedawayfromcards. A selected北区煤运补能站 扩容;B物流园候选点 新建;C东区矿口候选点 新建. Do not pretend cartography is authoritative, keep small仿真图层 badge.
Float left~310px panel overmap, x28 y320 to850, title候选方案3; 3 verticalcandidatecards:
A 北区站扩容＋既有站协同 selectedlightredborder withsmall推荐badge, 扩容 · 本站需求覆盖86%, 绕行2.6km ·预计等待9分钟, 新增充电位2个.
B 南区物流园新建 whitecard, 新建 ·本站需求覆盖78%, 绕行5.4km ·预计等待11分钟, 新增充电位6个.
C 东区矿口新建 whitecard, 新建 ·本站需求覆盖91%, 绕行1.8km ·预计等待8分钟, amber需核实接电. Bottom +添加候选点 and候选资料link. No actual construction buttons.
Floatright~380px panel x1500 y320to850, title推荐布局A withbadge条件测算. Subheading 北区站扩容＋既有站协同. Compactkeyvalues 充电位 4→6个;单机额定功率240kW;装机功率1440kW;总供电需求1600kW;可用供电容量2000kW;预计等待9分钟. Thin separators. Shortcheckrows 用地样例已核对; 接电样例已核对; 重卡通行样例已核对. No realapproval stamp. Smallcomparison insightonlyone concise phrase 利用既有设施，减少新增工位. Actions 查看依据 outline, 进入运力规划 red. Avoid hugeparagraphs.
Bottom mapoverlaywidewhitecomparisonpanel y890to1160, title方案对比 withsubtle button收起. Exact tablecolumns 方案 |建设方式/工位增量 |本站需求覆盖 |参考绕行/预计等待 |供电需求/可用容量 |测算结论 |操作.
Rows:
A北区站扩容＋既有站协同 |4→6个 /新增2个 |86% |2.6km /9分钟 |1600/2000kW |条件可行green|采用为参考方案
B南区物流园新建 |0→6个 /新增6个 |78% |5.4km /11分钟 |1600/2000kW |条件可行blue|查看
C东区矿口新建 |0→6个 /新增6个 |91% |1.8km /8分钟 |1600/800kW |供电不足amber|核实条件
SelectedArowpaletint. Underfooter just小字3个方案 · 仿真测算， no paginationneedbecauseexplicit3selectedcomparisonnotwholeprojectlist. Show sharedproject and realbusinesslinkage through controls, notfreefloatingexplanation. Mapcontinuesbehindalloverlaypanels. Crispandbeautiful.
```

## 运力规划生成提示词

```text
Use case: ui-mockup. Create ONE pixel-sharp high-fidelity Chinese enterprise desktop application screenshot, landscape 1920x1200 about16:10, no browser/device frame and no collage. Reference image is STYLE ONLY: keep its white horizontal navigation, pale coolgray #f5f6f8 canvas, thin #e5e7eb borders, compact white panels, 8px corners, charcoal Chinese sans-serif text, crimson #be1230 selected controls and restrained blue/amber/green status tags. Clean, spacious, practical, professionally aligned with dense readable business content. Brand left outlined lightning icon and bold交能融合; top navigation exact 运营总览、订单管理、任务调度、能源管理、运行保障、规划决策(active red underline)、经营管理、系统管理. Right small仿真示意 badge and管理员avatar. Below slim breadcrumb and two secondarytabs 场站规划、运力规划 (oneactive). NO leftsidebar, oversizedpageheading, promotionalillustrations, darkdashboard, decorativecharts, detachedgiantKPIcards, explanatoryparagraphs or giantworkflowdiagram. Red buttons limited to primaryaction; routine actions compact link/outline. Accurate Simplified Chinese, careful text spacing and hierarchy. This is a proposed design review with ILLUSTRATIVE DATA, not real operations, calibratedengineering, or confirmed procurement. Image1 style reference contains an outdated menu name 补能与能源; ALWAYS replace that menu with能源管理.
Both pages share planningproject 北区煤运走廊规划（仿真）, baseline10/01–10/15, schemeV3, target2400吨/日, three transportcorridors, effectivepayload30吨, referenceoneway40km,8hour dailyoperation08:00–16:00. Stockvehicles32, fitavailable22, otheroccupied/incompatible10. Requiredfleet30 = operating27 + reserve3;新增车辆缺口8. Driversrequired30, currentavailable24, gap6. Chargeonly350kWhvehiclefleet, onboardbattery30sets associatedwithfleet, current22 gap8 carried WITH vehicles not doublecounted standalonecost; no swapspares. Adopted stationdesign A北区站扩容＋既有站协同, subjecttohumanreferenceadoption notengineeringapproval. A existingchargers4×240kW=960, proposed6×240kW=1440,新增2; supply2000kW, totalplanningpower1600kW includes160kWotherload. PhaseI1200吨/日 usesexisting16vehicles and4chargers, adds0. PhaseII2400吨/日 cumul30vehicles, adds投入14vehicles = existingremaining6 + new8; cumul6chargers,add2. DriversphaseI16 thenphaseII30:extra14=existing8+new6. All stock/required/gap and phaseincrements must be consistent. Planningresults neverauto dispatch,purchase,activatevehiclesorcontrolhardware. No invented ROI,totalcost or approvals; economicunknowns stay待补齐. Small circle交能AIlauncher, unobtrusive lower right. One complete page, not a poster.
PAGE2运力规划 breadcrumb工作台 /规划决策 /运力规划, secondarytab运力规划active. Sameprojecttoolbarandtypography aspage1, compact singleline 项目[北区煤运走廊规划（仿真）v] 基准期[2026-10-01 至2026-10-15] 方案[V3] withbuttons 引用现有资源、调整条件、red重新测算. Thin contextline 关联场站方案 A ·北区站扩容＋既有站协同 [查看场站规划 link]. Do not use map, do not duplicate siteplanninglayout.
White maincontent fillsremainingpage generousmargins28. Header tabs 测算结果(active) /方案比较 /历史方案, right outline保存方案 andred采用为参考方案.
One compact horizontalmetricsstrip withinpanel (NOT detached cards): 建议车辆30辆 |现有适配22辆 |新增车辆缺口8辆(red) |充电工位4→6个.
Maincontentgrid left70%, right30%, two adjacentwhitepanels withinsharedworkspace.
LEFT titled资源配置, subtitleonecompactline 日运量2400吨 ·有效载重30吨 ·作业窗8小时. Tablecolumns 资源类别/适配条件 |建议总量 |现有可用 |新增缺口 |配置说明 |操作.
5 meaningful rows, arithmeticcoherent:
电动重卡 /350kWh适配车型 |30辆 |22辆 |8辆(red) |执行27辆＋备用3辆 |查看匹配
司机 /匹配班次与资质 |30人 |24人 |6人(red) |按实际排班核对 |查看班次
随车电池 /350kWh |30组 |22组 |8组 |随新增车辆配置 |查看规格
充电工位 /240kW |6个 |4个 |2个(red) |采用场站方案A |查看场站
换电备用电池 |不配置 |— |— |纯充电方案 |—
Small footertext档案车辆32辆 ·可用22辆 ·其他占用或不适配10辆 (single compactline) with查看资源明细 link. No confusingdoublecountinvestment ononboardbattery.
RIGHT title约束校验, listfourcompactrows icons+labels:
运输能力 条件满足 /基准场景下覆盖2400吨/日
场站服务 条件满足 /6个充电位协同
供电容量 条件满足 /需求1600kW≤可用2000kW
资源到位 待补齐 /车辆8辆、司机6人、充电位2个.
No contradictory overall已具备投运 badge; top tag 有资源缺口 amber. Lower shortsection预算口径 displays 设备价格待补齐;车辆采购/租赁待补齐;已知用能费用可单独比较; Full cost/ROI absent, no invented numbers. One outlinebutton查看测算依据; below optionalblue link带入交能推演, indicatesuserinitiatedcomparisonnotautodispatch.
BOTTOM fullwidthwhitepanel titled分期安排, smallbutton调整阶段. Tablecolumns 阶段 |目标日运量 |车辆累计/本期投入 |本期车辆来源 |充电工位累计/本期新增 |启用条件.
一期 /1200吨 /16辆·投入16辆 /现有16辆，新增0辆 /4个·新增0个 /班次与现有资源核实
二期 /2400吨 /30辆·再投入14辆 /现有6辆＋新增8辆 /6个·新增2个 /新增车辆、司机及扩容工位到位
Usecalendaricons ormutedphasebadges, no rainbowgantt orbigchart. Phasevalues cumulative andincrementdistinct; donotclaim14procuredwhenonly8new. Bottomsmall status待负责人确认, right查看历史版本 link. Plentyof whitespace yetinformationdensity appropriate. Lower-right unobtrusive交能AIlauncherdoesnotcoverphaseactions. This pageanswerscurrentfitstock/gaps/phasing andcapacityconstraints, notdaily taskdispatch.
```

