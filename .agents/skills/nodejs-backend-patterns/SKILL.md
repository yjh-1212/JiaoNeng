---
name: nodejs-backend-patterns
description: 使用 Node.js/Express/Fastify 实现可维护的后端服务、REST API、参数校验、鉴权和错误处理。含 SQLite 专项差异。仅产品开发阶段使用。
---
# Node.js Backend Patterns — 项目适配 Skill
基于 wshobson/agents 同名 MIT Skill 的方法论整理，非上游原样拷贝。上游： https://github.com/wshobson/agents/tree/main/plugins/javascript-typescript/skills/nodejs-backend-patterns
## 必须先做
1. 读取冻结 PRD、数据对象、状态机及 AC，不自行增加业务逻辑。
2. 确认现有栈（Node.js JS/TS、Express/Fastify、SQLite 驱动）；优先沿用项目已有技术栈，不强加 TypeScript 或 ORM。
3. 划清 Controller（验证/响应）→ Service（业务规则/事务）→ Repository（参数化 SQL）三层。
## 实施标准
- 按资源设计 REST 路由，列表提供统一分页、过滤、排序白名单、错误码及响应结构；接口契约追溯 PRD。
- 所有 body/query/param 校验；角色权限在服务端强制执行；鉴权仅在 PRD 要求时启用，不擅自增加登录。
- 参数化查询，禁止拼接用户输入形成 SQL；动态排序只能映射受控字段白名单。
- 数据写入须在事务里保障业务一致性；针对并发执行乐观锁/唯一约束/幂等键（按需）。
- 未知错误统一日志及 500，生产日志不得泄露凭据/个人信息；合理使用 400/401/403/404/409/422。
- 必须实际在数据库落地；禁止以本地数组、临时 mock、硬编码列表冒充正式 API。
- 用 `node:test` / Jest / Vitest（按项目已有工具）覆盖 Service、API 和数据访问；包含失败路径与边界。
## SQLite 注意
- SQLite 非 PostgreSQL：勿套用 Pool/RETURNING/DECIMAL 精度/表 ALTER 特性而不验证所用版本；`PRAGMA foreign_keys=ON`；检查 WAL 与 busy_timeout 是否适用。
- 金额/运价优先整数分或定点库，吨公里等单位统一；明确时间存储格式/时区/单位。
- 读多写少可分页与索引；单实例写入能力有限，按真实负载评估，不在未经测试时承诺高并发性能。
## 完成条件
API 需求→端点→数据库表→测试 ID 可追踪；所有端点有真实可复现请求与数据记录；失败响应/权限/校验可验证。不得部署。
