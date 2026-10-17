---
name: amap-design-skill
description: 以高德地图为底座设计企业级地图/GIS界面的专项技能。负责地图视觉层级、业务图层、缩放分级、交互、物流运输网络表达、性能与地图页面布局；不替代高德 API 文档。涉及 AMap JSAPI/Loca 实现时必须联动 amap-jsapi-skill。
license: MIT
version: 1.0.0
metadata:
  author: local-composition
---

# AMap Design Skill

## Purpose

本 Skill 负责回答“地图应该怎么设计”，而不是“某个高德 API 的参数是什么”。

适用于：

- 企业 SaaS / 政府监管系统中的地图页面
- 物流运输、供应链、运踪、枢纽、港口、铁路、公路、水运网络
- 运营驾驶舱中的地图主视图
- 区域分布、热力、OD、轨迹、通道、节点、异常态势
- 需要对地图视觉、层级、缩放、交互和性能进行重构的页面

实现 AMap JSAPI v2.0、覆盖物、图层、POI、路线规划、地理编码等代码时，必须继续加载 sibling Skill `amap-jsapi-skill`。不要凭记忆编造 API。

## Core rule: business map first, basemap second

地图不是装饰背景。业务对象必须形成清楚的视觉层级：

1. 当前任务 / 当前选中通道
2. 关键线路与关键枢纽
3. 业务区域（来源地、目的地、服务区、风险区）
4. 次级线路和节点
5. 行政边界与地理参照
6. 普通底图 POI / 道路 / 建筑

底图信息不得与业务图层争抢注意力。复杂业务地图默认做“底图减法”。

## Workflow

### 1. Classify the map role

先确定地图属于哪一类：

- **Overview map**：回答“整体分布与态势如何”
- **Operational tracking map**：回答“任务现在在哪里、状态如何、下一节点是什么”
- **Network/corridor map**：回答“节点与线路如何连接、主通道如何运行”
- **Planning map**：回答“路线、方案、资源如何比选”
- **Analytical map**：回答“哪里高、哪里低、哪里异常、趋势如何”

不要把不同目的的地图混成一个永远叠满所有图层的页面。

### 2. Inventory geographic objects

对每类对象明确：

- 业务含义
- 几何类型：点 / 线 / 面 / 栅格 / 轨迹
- 是否实时
- 是否可点击
- 是否参与筛选
- 是否需要标签
- 显示缩放级别
- 数据量级
- 优先级

输出 layer inventory 后再进入视觉设计。

### 3. Establish visual hierarchy

遵循 [map-visual-hierarchy.md](references/map-visual-hierarchy.md)。

必须明确：

- 图层 z-order
- 颜色语义
- 线宽 / 点大小
- 正常 / 繁忙 / 异常 / 选中状态
- 未选对象降噪策略
- 标签显示层级
- 缩放级别切换规则

### 4. Choose rendering pattern

根据数据类型和数据量选择高德能力，参见 [layer-selection.md](references/layer-selection.md)。

不要默认用大量 DOM Marker；不要为了“好看”给所有对象加持续动画。

### 5. Define map interaction

至少定义：

- hover / focus：轻量强调，不改变业务状态
- click / select：锁定对象并打开详情
- fit / focus：选中线路或区域时将镜头调整到合适范围
- filter：未选图层降低透明度或隐藏
- reset：一键回到业务默认视角
- drill-down：缩放后逐级显示更多节点和标签

### 6. Define page composition

地图页面仍属于系统信息架构的一部分：

- 一级/二级业务模块应使用真实导航和独立路由，不要用页面顶部一排 Tab 冒充系统二级菜单。
- 地图内的“综合 / 铁路 / 公路 / 水运”等只在它们是**同一地图任务的视图筛选**时才可使用轻量切换器或 Tab。
- 如果每个子项具有独立页面目标、独立 CRUD、独立权限、独立筛选/表格或独立 URL，则必须进入二级菜单，而不是地图页 Tab。

系统级导航判断以 `information-architecture` 为准。

### 7. Review performance and readability

使用 [map-performance.md](references/map-performance.md) 和 [map-review-checklist.md](references/map-review-checklist.md)。

## Logistics / transport maps

涉及物流运输网络时，加载 [logistics-map-patterns.md](references/logistics-map-patterns.md)。

核心原则：

- 运输方式必须通过线型、颜色、动画节奏至少两种手段区分，不能只靠颜色。
- 主通道与普通网络分层，不展示“全国所有道路/铁路”来制造复杂感。
- 节点分级；全国视角只显示一级节点，放大后再展开二三级节点。
- 运输工具动画只服务于任务状态表达，不能造成视觉噪声。
- 当前任务/当前线路要明显高于历史、背景和未选线路。

## AMap implementation handoff

交给 `amap-jsapi-skill` 前，至少形成以下 handoff：

```yaml
map_role: network | tracking | planning | analytical | overview
base_map_strategy: muted | standard | satellite | custom
layers:
  - id:
    business_meaning:
    geometry: point | line | polygon | raster
    priority: P1 | P2 | P3 | P4
    min_zoom:
    max_zoom:
    interaction:
    style_states: [default, hover, selected, warning, error]
labels:
  collision_strategy:
  zoom_rules:
filters:
  dimensions:
focus_behavior:
refresh_frequency:
performance_risk:
```

随后让 `amap-jsapi-skill` 根据已安装文档选择真实 API/图层，不得从本 Skill 猜测 API 参数。

## Anti-patterns

禁止：

- 所有线路同亮度、同线宽、同动画
- 一打开全国地图就显示所有城市、站点、车辆、标签
- 用几十/几百个 DOM 动画替代高性能地图图层
- 普通底图 POI 比业务节点更醒目
- 地图左右面板长期遮挡关键线路和交互区域
- 点击对象只有 tooltip，没有稳定的 selected state
- 同一状态在不同图层使用不同颜色语义
- 把系统二级业务模块都塞在一个地图页面的 Tab 中

## Quality checklist

- [ ] 地图角色明确，能回答一个主要业务问题
- [ ] 有明确 P1-P4 视觉层级
- [ ] 底图已降噪，业务图层占主导
- [ ] 点、线、面对象都有缩放显示规则
- [ ] 标签不会在默认视角堆成一团
- [ ] 选中态明显，未选对象会降噪
- [ ] 运输方式不只依赖颜色区分
- [ ] 动画有业务含义，数量受控
- [ ] 地图数据量与渲染方式匹配
- [ ] 二级业务模块使用导航/独立路由，Tab 仅用于同一任务上下文的视图切换
- [ ] 实现阶段会继续加载 `amap-jsapi-skill`
- [ ] 完成后通过真实浏览器检查遮挡、缩放、标签、弹窗和性能
