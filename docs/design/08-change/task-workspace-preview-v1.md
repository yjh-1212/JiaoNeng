# 运输任务页面设计图 V1（待评审）

2026-10-16。用户请求先生成页面设计图。本稿为独立设计预览，未修改正式前后端、数据库、接口或冻结基线，不构成开发授权。

设计图：task-workspace-preview-v1.png。使用内置 image_gen 工具，非CLI，非透明背景。以当前顶部导航及上一轮运输任务文字建议为依据，展示上方同排查询、状态快捷筛选、列表/排程切换、批量派发操作区、状态相关行操作、明确区分上报与核验量、默认10条每页。图中为示例数据，最终状态计数、勾选规则及详细交互以评审后的规格为准。

## 最终生成提示词

```text
Use case: product UI design mockup. Generate ONE polished high-fidelity desktop web application screen for a Chinese enterprise electric heavy-truck transport-and-energy platform named “交能融合”. This is a proposed “运输任务” page for user review, not a screenshot of an implemented system. A wide landscape screen, approximately 1680 by 1050 proportions, straight-on flat UI, no device frame, no perspective, no annotations outside the application. Render exceptionally crisp, legible simplified Chinese typography like Microsoft YaHei / PingFang, precise grid alignment, realistic restrained Ant Design enterprise controls.

Visual direction: clean, compact, calm, professional, generous useful space without oversized gaps. White panels on very pale cool gray #F5F6F8, fine gray #E4E7EC borders, subtle 8px corner radius, dark graphite text, secondary slate gray. Muted burgundy red #B42336 for selected state and primary actions, tiny soft green/blue/amber status badges. No large page title, no explanatory paragraphs, no KPI cards, no illustrations, no map, no charts, no left sidebar. Thin line icons only.

Top bar: 64px white horizontal navigation. Left small burgundy lightning symbol and bold “交能融合”. Nav items with small thin icons: “运营总览”, “订单管理”, “任务调度”, “补能与能源”, “运行保障”, “规划决策”, “经营管理”, “系统管理”. “任务调度” selected with a thin burgundy underline. Right small “仿真” badge and user icon. Under it a slim white breadcrumb bar: “工作台  ›  任务调度  ›  运输任务”; right “平台管理员”. No duplicate title below the breadcrumb.

Main content margins about 28px. First a compact white query panel, every label, input, and action on ONE aligned horizontal row. Fields: label “关键词”, input placeholder “任务号 / 订单号 / 车牌 / 司机”; label “状态”, select “全部状态”; label “计划日期”, date range “2026-10-16 — 2026-10-16”; label “主体”, select “全部主体”; burgundy outline “查询” and neutral “重置”. Comfortable 36px control heights. Do not create a large search heading.

Below, separated by 18px, one large white table panel. First row of this panel contains compact state navigation: “全部 18” selected with burgundy text and underline, then “待派发 4”, “待执行 5”, “执行中 4”, “待核验 2”, “已结束 3”. Right a small two-button view toggle “列表” selected / “排程”. Next a subtle low-height selection toolbar reading “已选 2 项” and link “清除选择” on the left, solid burgundy button “批量派发（2）” aligned far right. Avoid a floating or detached action button.

Table uses a pale gray header, fine horizontal dividers, six readable rows with comfortable 82–94px row height. No vertical grid lines. Columns: checkbox; “任务 / 订单”; “线路 / 货物”; “车辆 / 司机”; “计划时间”; “执行进度”; “状态 / 待办”; “操作”. Allocate generous space to route and progress. Task and order as primary/secondary lines. Vehicle plate and REALISTIC HUMAN DRIVER NAME as primary/secondary lines, never internal driver codes. Route is origin → destination; cargo in smaller gray text. Time uses two lines. Progress uses clear names and units rather than three unlabeled numbers: first “上报 60 / 180 吨”, thin progress bar, then “已核验 0 吨” in small muted text. Zero completed rows display zero progress. Never imply driver-reported delivery is already verified.

Six sample rows, business-consistent:
1. checked burgundy checkbox. Task “RW-261016-021”, order “DD-261016-091”; route “北区煤场 → 煤炭集运中心”, cargo “原煤”; plate “甘M·16821”, driver “张伟”; planned “10/16 16:00” and “至 20:00”; progress “上报 0 / 120 吨”, “已核验 0 吨”; soft slate badge “待派发”; actions burgundy text “派发”, neutral text “调整”, ellipsis.
2. checked burgundy checkbox. “RW-261016-022”, “DD-261016-092”; “西区堆场 → 华能电厂”, “煤炭”; “甘M·16638”, “王强”; “10/16 16:00” “至 21:00”; “上报 0 / 180 吨”, “已核验 0 吨”; badge “待派发”; actions “派发”, “调整”, ellipsis.
3. no active selection checkbox. “RW-261016-019”, “DD-261016-089”; “北区煤场 → 煤炭集运中心”, “原煤”; “甘M·16906”, “刘洋”; “10/16 12:00” “至 18:00”; “上报 60 / 180 吨”, 33% thin burgundy progress, “已核验 0 吨”; blue “执行中” badge and small amber “补能等待” below; actions “查看执行”, “处理异常”.
4. no active selection checkbox. “RW-261016-020”, “DD-261016-090”; “南区料场 → 城北搅拌站”, “砂石骨料”; “甘M·16732”, “李明”; “10/16 15:30” “至 19:30”; “上报 0 / 150 吨”, “已核验 0 吨”; pale amber “待接单”; actions “查看”, “调整”, ellipsis.
5. no active selection checkbox. “RW-261016-017”, “DD-261016-087”; “矿区装载点 → 铁路货场”, “矿石”; “甘M·16518”, “赵鹏”; “10/16 08:00” “至 14:00”; “上报 120 / 120 吨”, full thin progress, “已核验 0 吨”; purple “待核验” badge; prominent burgundy TEXT action “核验完工”, “查看”.
6. no active selection checkbox. “RW-261016-016”, “DD-261016-086”; “西区堆场 → 华能电厂”, “煤炭”; “甘M·16385”, “陈涛”; “10/16 07:00” “至 13:00”; “上报 120 / 120 吨”, full thin progress, “已核验 120 吨”; soft green “已完成”; action “查看”.

Footer of table: right-aligned compact pagination “共 18 条”, previous arrow, pages 1 and 2, next arrow, dropdown “10 条/页”. Use 10 per page even though only six sample rows are pictured in this design proposal. Very small muted “设计预览 · 示例数据” in the page bottom left, outside the table. This identifies the proposal without occupying business UI space.

Make the screen look coherent, production-ready, beautifully aligned and plausible as the next iteration of a real logistics admin product. Chinese text fidelity and orderly restrained layout are critical. No watermark, no English marketing text, no decorative gradients, no hero section, no thick outlines, no drawer open in this first main-page design.
```

