# E3 UI 对比与具体参考

对比依据：冻结V0.2-design-1 D5原型及辽粮只读源码。形式参考不引入辽粮的粮食贸易、供应商竞价或新增角色。

| 页面类型 | 辽粮参考 | 正式实现 |
| --- | --- | --- |
| 订单/任务/资源 | Transport.vue / Admin.vue | 紧凑筛选、表格、主体/状态筛选；记录抽屉和保存确认 |
| 经营分析 | Billing.vue | 指标与费用列表；预计/实际、核验状态、金额排序、原始依据 |
| 运行监测 | Tracking.vue | 地图关联业务对象、车辆选择和历史采样表 |
| 交能推演/规划 | Planning.vue | 上部条件，下部地图和候选方案/成果；调整后需重算 |
| 司机H5 | Driver.vue | 任务卡片、接收拒绝、车次执行、完工提交、补能与异常反馈 |

页面标题下不放解释性副标题；口径、限制和来源放来源按钮/详情。细节只在当前操作需要时展开。已检查1440桌面和1280/1024/768/390/320宽度，无横向页面溢出。高德保留供应商版权信息，业务示意图明确仿真。浅色与深色手机均已浏览器检查；simulation-dark-mobile.png在390宽度无页面横向溢出。

修复过的可复现问题：无效默认候选司机、规划InputNumber导入、规划车次数误当列表导致详情异常、候选车辆按车牌搜索、规划详情计量展示。修复后浏览器核心回归通过。截图：05-acceptance/evidence/simulation-result.png、reports.png、driver-task-submitted.png；实际高德04-integration/amap-live.png。

2026-10-14人工截图复核：energy-strategies.png的策略比较和确认嵌入详情；planning-comparison.png的布局和分期结果嵌入成果；assistant-prepared-simulation.png保留上条件下地图/时序和候选；simulation-dark-mobile.png按屏宽垂直排列。当前浏览器无JavaScript运行错误。对上述推荐呈现按用户明确委托确认，不登记为用户亲自视觉审查。
