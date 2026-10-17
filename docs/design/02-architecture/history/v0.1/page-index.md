# D2 页面与路由索引

以下为D2结构索引，尚不是D4页面规格。共61个页面目的地：40个管理端业务入口、3个管理端通用入口、8个司机H5页面、10个管理端详情页。D5原型锚点仅为规划，文件尚未生成。

## 运营总览

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-001 | 运营工作台 | `/overview/workbench` | MOD-006 |
| PAGE-002 | 管理驾驶舱 | `/overview/cockpit` | MOD-006 |

## 运输调度

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-003 | 运输需求 | `/transport/demands` | MOD-001 |
| PAGE-004 | 运输订单 | `/transport/orders` | MOD-001 |
| PAGE-005 | 交能推演 | `/transport/simulation` | MOD-001 |
| PAGE-006 | 方案记录 | `/transport/solutions` | MOD-001 |
| PAGE-007 | 任务调度 | `/transport/tasks` | MOD-002 |
| PAGE-008 | 运输计划 | `/transport/schedules` | MOD-002 |
| PAGE-009 | 运力资源 | `/transport/resources` | MOD-002 |

## 充换电运营

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-010 | 场站管理 | `/charging/stations` | MOD-003 |
| PAGE-011 | 设备监测 | `/charging/devices` | MOD-003 |
| PAGE-012 | 补能计划 | `/charging/plans` | MOD-003 |
| PAGE-013 | 需求预测 | `/charging/forecasts` | MOD-003 |
| PAGE-014 | 时序优化 | `/charging/optimization` | MOD-003 |
| PAGE-015 | 作业记录 | `/charging/sessions` | MOD-003 |

## 能源协同

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-016 | 能源资源 | `/energy/resources` | MOD-004 |
| PAGE-017 | 负荷监测 | `/energy/loads` | MOD-004 |
| PAGE-018 | 负荷预测 | `/energy/forecasts` | MOD-004 |
| PAGE-019 | 策略优化 | `/energy/strategies` | MOD-004 |
| PAGE-020 | 协同计划 | `/energy/plans` | MOD-004 |

## 规划与经营

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-021 | 交通需求分析 | `/planning/traffic` | MOD-005 |
| PAGE-022 | 场站选址 | `/planning/locations` | MOD-005 |
| PAGE-023 | 容量测算 | `/planning/capacity` | MOD-005 |
| PAGE-024 | 投放测算 | `/planning/deployment` | MOD-005 |
| PAGE-025 | 规划方案 | `/planning/solutions` | MOD-005 |
| PAGE-026 | 运输成本 | `/management/transport-costs` | MOD-007 |
| PAGE-027 | 补能费用 | `/management/energy-costs` | MOD-007 |
| PAGE-028 | 资产管理 | `/management/assets` | MOD-007 |
| PAGE-029 | 置换与合作 | `/management/replacements` | MOD-007 |
| PAGE-030 | 经营报表 | `/management/reports` | MOD-007 |

## 安全保障

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-031 | 车辆监测 | `/safety/vehicles` | MOD-006 |
| PAGE-032 | 轨迹回溯 | `/safety/replay` | MOD-006 |
| PAGE-033 | 场站运行 | `/safety/stations` | MOD-006 |
| PAGE-034 | 告警处置 | `/safety/alerts` | MOD-006 |

## 基础管理

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-035 | 业务档案 | `/settings/entities` | MOD-009 |
| PAGE-036 | 数据接入 | `/settings/integrations` | MOD-009 |
| PAGE-037 | 数据质量 | `/settings/data-quality` | MOD-009 |
| PAGE-038 | 用户与权限 | `/settings/users` | MOD-009 |
| PAGE-039 | 操作日志 | `/settings/audit` | MOD-009 |
| PAGE-040 | 业务参数 | `/settings/parameters` | MOD-009 |

## 通用入口

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-041 | 管理端登录 | `/login` | MOD-009 |
| PAGE-042 | 个人信息 | `/account` | MOD-009 |
| PAGE-043 | 智能助手 | `/assistant` | MOD-008 |

## 司机H5

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-044 | 我的任务 | `/m/tasks` | MOD-002 |
| PAGE-045 | 补能安排 | `/m/energy-plans` | MOD-003 |
| PAGE-046 | 我的 | `/m/profile` | MOD-009 |
| PAGE-047 | 我的异常 | `/m/issues` | MOD-006 |
| PAGE-048 | 司机登录 | `/m/login` | MOD-009 |
| PAGE-049 | 司机任务详情 | `/m/tasks/:taskId` | MOD-002 |
| PAGE-050 | 司机异常详情 | `/m/issues/:issueId` | MOD-006 |
| PAGE-051 | 司机补能详情 | `/m/energy-plans/:planId` | MOD-003 |

## 详情下钻

| 页面 | 名称 | 路由 | 主模块 |
|---|---|---|---|
| PAGE-052 | 运输需求详情 | `/transport/demands/:demandId` | MOD-001 |
| PAGE-053 | 运输订单详情 | `/transport/orders/:orderId` | MOD-001 |
| PAGE-054 | 推演方案详情 | `/transport/solutions/:solutionId` | MOD-001 |
| PAGE-055 | 运输任务详情 | `/transport/tasks/:taskId` | MOD-002 |
| PAGE-056 | 场站详情 | `/charging/stations/:stationId` | MOD-003 |
| PAGE-057 | 运力车辆详情 | `/transport/resources/vehicles/:vehicleId` | MOD-002 |
| PAGE-058 | 规划方案详情 | `/planning/solutions/:solutionId` | MOD-005 |
| PAGE-059 | 告警详情 | `/safety/alerts/:alertId` | MOD-006 |
| PAGE-060 | 资产详情 | `/management/assets/:assetType/:assetId` | MOD-007 |
| PAGE-061 | 协同计划详情 | `/energy/plans/:planId` | MOD-004 |
