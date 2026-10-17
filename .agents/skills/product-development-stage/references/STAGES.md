# E0-E5 开发阶段闸门
| 节点 | 主要内容 | 必须交付 | 质量闸门 |
|---|---|---|---|
| E0 | 设计基线接收与明确授权 | handoff.md / state | 冻结 SHA 全过、用户授权原文有记录 |
| E1 | 技术方案与任务拆分 | architecture.md / tasks.csv | 关键技术/依赖/任务对应需求 AC |
| E2 | 数据库、后端与接口 | backend-contract.md / db-verification.md | 迁移和 API 接口测试通过、数据源可追踪 |
| E3 | 页面开发 | frontend-implementation.md / ui-comparison.md | 页面与冻结原型一致、关键表单与状态可操作 |
| E4 | 系统联调 | integration-report.md | 实际数据流走通、地图/动画符合需求、失败分支验证 |
| E5 | Playwright 验收 | acceptance-report.md / issues.csv | 真实浏览器测试、业务 AC 全覆盖、P0/P1 关闭 |

所有验收必须保留执行命令、环境、时间、结果或截图/日志证据；脚本只做结构与哈希检查，不能替代用户验收。
