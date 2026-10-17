# CR-017 开发验收记录

2026-10-16。运输任务按用户批准的设计图完成本地前后端实施。冻结规格、授权、实现结构分别见 CR-017 基线、authorization.json、architecture.md。本记录为开发代理自检，不代表用户逐项签署。

## 结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 前端构建 | 通过 | npm run build |
| 全量 Node 业务/接口测试 | 286通过、0失败 | node-tests.txt |
| 原产品验收点 | 171/171通过 | ac-results.json |
| 运输任务浏览器流程 | 9组通过、运行错误0 | browser-check.json |
| 本地服务基础接口 | 6项通过 | local-smoke.json |
| 业务记录保护 | 7类表逐条与备份一致 | local-before.json、local-after.json |

新增 tests/task-workspace.test.mjs 覆盖关联搜索、固定状态、时间区间重叠、超过100条的计数与分页、主体/角色隔离、实际凭证关联、预检只读、重复任务、资源版本竞争、事务回滚、幂等、HTTP/CSRF及取消释放边界。tests/task-workbench-browser.mjs 通过真实页面/API/SQLite 验证查询、详情、整批派发冲突修正、成功响应丢失后的结果核查、调整后取消重推演、核验409保留输入、通过/退回及只读角色。

## 界面与数据

参考批准图实现上查下表、状态快捷项、列表/排程切换、右侧业务抽屉，默认10条/页。390、768、1024、1280、1440、1680px布局检查无页面横向溢出；窄屏表格在容器内横向滚动。

图示见 task-list.png、task-detail.png、dispatch-preview.png、dispatch-conflict.png、verification.png、replan-handoff.png、schedule.png、mobile.png。browser-failure.png 为排查过程中旧失败截图，不是最终结果；最终结论以 browser-check.json 为准。

现有数据保留：8需求、25订单、18任务、27车次、4补能计划、12补能作业、12费用。SQLite只读逐行比较修改前备份，没有写入测试业务。页面继续显示仿真及来源属性；本次常规测试外部模型调用为0，没有新增真实车队/现场数据，也不把计划补能称作实际预约。

## 运行与限制

本地服务 http://127.0.0.1:3100/#tasks。排程范围是当前查询页；现场全车队运力约束仍以既有派发服务最终校验为准。既有 DeepSeek 和高德能力未在本次重新做真实外部服务测试。本次无新增数据库结构，无生产发布或部署。
