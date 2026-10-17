# D5 原型导航索引

状态：已制作待用户确认。独立HTML内嵌真实组件运行时，可直接双击打开，无后端，无正式源码改动。所有业务数据/计算/身份/操作为模拟。

入口：`prototypes/design-preview/index.html`；浏览器地址hash选择具体页面；默认总览。交能推演为辽粮上下布局。建议先按[演示路径](walkthrough.md)走运输闭环，再审阅其余模块。

| 页面ID | 页面 | 导航位置 | 独立原型入口 |
|---|---|---|---|
| PAGE-001 | 运营总览 | 运营总览 | [打开](../../../prototypes/design-preview/index.html#page-001) |
| PAGE-004 | 运输订单 | 运输调度 | [打开](../../../prototypes/design-preview/index.html#page-004) |
| PAGE-005 | 交能推演 | 运输调度 | [打开](../../../prototypes/design-preview/index.html#page-005) |
| PAGE-007 | 运输任务 | 运输调度 | [打开](../../../prototypes/design-preview/index.html#page-007) |
| PAGE-009 | 运力管理 | 运输调度 | [打开](../../../prototypes/design-preview/index.html#page-009) |
| PAGE-010 | 场站运营 | 补能与能源 | [打开](../../../prototypes/design-preview/index.html#page-010) |
| PAGE-012 | 补能调度 | 补能与能源 | [打开](../../../prototypes/design-preview/index.html#page-012) |
| PAGE-016 | 能源管理 | 补能与能源 | [打开](../../../prototypes/design-preview/index.html#page-016) |
| PAGE-031 | 运行监测 | 运行保障 | [打开](../../../prototypes/design-preview/index.html#page-031) |
| PAGE-034 | 预警处置 | 运行保障 | [打开](../../../prototypes/design-preview/index.html#page-034) |
| PAGE-022 | 场站规划 | 规划决策 | [打开](../../../prototypes/design-preview/index.html#page-022) |
| PAGE-024 | 资源投放 | 规划决策 | [打开](../../../prototypes/design-preview/index.html#page-024) |
| PAGE-030 | 经营分析 | 经营管理 | [打开](../../../prototypes/design-preview/index.html#page-030) |
| PAGE-028 | 资产管理 | 经营管理 | [打开](../../../prototypes/design-preview/index.html#page-028) |
| PAGE-029 | 运力合作 | 经营管理 | [打开](../../../prototypes/design-preview/index.html#page-029) |
| PAGE-035 | 基础资料 | 系统管理 | [打开](../../../prototypes/design-preview/index.html#page-035) |
| PAGE-036 | 数据管理 | 系统管理 | [打开](../../../prototypes/design-preview/index.html#page-036) |
| PAGE-038 | 用户权限 | 系统管理 | [打开](../../../prototypes/design-preview/index.html#page-038) |
| PAGE-040 | 系统设置 | 系统管理 | [打开](../../../prototypes/design-preview/index.html#page-040) |
| PAGE-041 | 管理端登录 | 通用入口 | [打开](../../../prototypes/design-preview/index.html#page-041) |
| PAGE-042 | 个人信息 | 通用入口 | [打开](../../../prototypes/design-preview/index.html#page-042) |
| PAGE-043 | 智能助手 | 通用入口 | [打开](../../../prototypes/design-preview/index.html#page-043) |
| PAGE-044 | 我的任务 | 司机H5 | [打开](../../../prototypes/design-preview/index.html#page-044) |
| PAGE-045 | 补能安排 | 司机H5 | [打开](../../../prototypes/design-preview/index.html#page-045) |
| PAGE-046 | 我的 | 司机H5 | [打开](../../../prototypes/design-preview/index.html#page-046) |
| PAGE-048 | 司机登录 | 司机H5 | [打开](../../../prototypes/design-preview/index.html#page-048) |

7个管理端一级入口、18个二级菜单；运营总览直接进入。详情/记录/核验/车次均为内部交互，不添加菜单。司机底部任务/补能/我的，登录及个人信息为通用入口。

顶部“演示”入口收纳状态、权限、主题、司机H5和重置评审工具；正常页面不展示解释横条。导航采用顶部一级菜单及下拉二级菜单，下方为业务内容。表格搜索/状态筛选/分页、表单必填/边界提示、模态关闭保护、详情面板、地图图层/选中/缩放、同一数据的跨页状态均可演示。

高德底图仅在选择本地配置后请求官方JSAPI，本轮外部加载失败；默认示意图可离线。DeepSeek未连接。真实接口、数据库、权限安全、事务原子性和算法精度不由本原型证明。
