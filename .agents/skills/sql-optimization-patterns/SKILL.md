---
name: sql-optimization-patterns
description: 面向 SQLite 的 SQL 查询剖析、索引优化、分页与 N+1 消除；基于真实负载和 EXPLAIN QUERY PLAN 提供证据。
---
# SQL Optimization Patterns — SQLite 项目适配 Skill
参考 wshobson/agents 的 MIT 同名技能，非上游原样拷贝。上游：https://github.com/wshobson/agents/tree/main/plugins/developer-essentials/skills/sql-optimization-patterns
## 触发时机
真实业务列表响应慢、条件组合多、地图轨迹查询频繁、JOIN 或批量写入性能差时使用。
## 工作流程
1. 记录现有 SQL、参数、行数与样本执行时间，保留优化前基线。
2. 用 `EXPLAIN QUERY PLAN`（SQLite）检查 SCAN/SEARCH、索引是否命中；勿使用 PostgreSQL 专属 `EXPLAIN (ANALYZE, BUFFERS)` 或不存在的系统表。
3. 优先修正 N+1、无界扫描、重复检索、字段选择、动态排序及缺少分页；再设计组合索引。
4. 使用真实数据分布/可安全生成的性能测试数据验证；不要将性能测试数据冒充业务真实数据。
5. 再次测量延迟、rows、查询计划与写入开销；提供回归测试，解释为何保留/删除某索引。
## SQLite 重点
- 使用 `EXPLAIN QUERY PLAN SELECT ...`，按查询场景评估覆盖索引；可用 `ANALYZE` 更新统计信息，注意环境影响。
- 组合索引的列序依据过滤选择性和查询方式决定，验证实际计划而不是机械地总以选择性优先。
- 大页偏移 OFFSET 成本高时可采用游标翻页；明确业务排序稳定性。
- WAL、连接管理与事务是性能相关选项，但配置前要理解部署和并发读写模式。
## 输出
优化前/后 SQL、参数、执行计划、采样规模、性能证据、索引变更、风险与回归测试结果。
