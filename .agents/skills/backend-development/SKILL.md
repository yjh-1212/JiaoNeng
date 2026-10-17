---
name: backend-development
description: Node.js + SQLite 后端开发总控，读取冻结 PRD，按领域业务规则组织 API、数据库、迁移、接口测试与真实性校验；不包括部署。
---
# 后端开发主控 Skill
先确认 `product-development-stage` E0 已完成并允许正式开发。开发前阅读 `docs/design/07-baseline/design-baseline.json`、D3 PRD、状态权限和数据接口要求。
## 技能调度
1. 业务模型/字段→`database-schema-designer`，确定表、FK、约束、迁移与金额/单位/时区。
2. API 与业务服务→`nodejs-backend-patterns`，设计 Controller/Service/Repository、事务与错误处理。
3. SQL 瓶颈→`sql-optimization-patterns`，用 SQLite 查询计划和数据证据优化。
4. 原型与数据表映射→输出 `docs/development/02-backend/` 的契约、建表与数据验证记录。
## 硬性验收
- 重要实体字段与 PRD 一致（编号、状态、组织数据范围、运输节点、运价、单位）。
- 同一请求结果由真实数据库查询/业务计算得出，不允许硬编码数组/前端 mock 作为正式业务数据。
- 所有外部数据有来源、获取时间、是否实时、字段可信度和异常退化约定。
- 事务、唯一性、字段校验、权限及异常响应测试通过。
- 数据更新/删除符合业务状态机，不随意删除订单与追踪事件。
- 后端/前端/集成测试必须通过，Playwright 需要检查真实读写。
本 Skill 不涉及 Docker、Render、CI/CD、云服务器或正式部署。设计变更先走变更控制。
