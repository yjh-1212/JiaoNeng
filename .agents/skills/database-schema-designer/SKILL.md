---
name: database-schema-designer
description: 基于已冻结业务对象设计数据库表、主外键、约束、索引及迁移脚本；针对 Node+SQLite 做方言校验和实际迁移测试。
---
# Database Schema Designer — 项目适配 Skill
参考 softaworks/agent-toolkit 的 MIT 同名技能，非原样拷贝。上游：https://github.com/softaworks/agent-toolkit/tree/main/skills/database-schema-designer
## 输入
已冻结业务模型、字段规则、状态机、数据来源、访问路径和既有数据库。任何迁移前先备份现有数据，不允许直接覆盖用户数据库。
## 设计步骤
1. 业务实体/主键/归属关系/业务唯一标识/生命周期清单；明确可删除与不可删除数据。
2. 实体关系及 1:N、N:M 映射，第三范式优先；有明确查询压力才适当反规范化。
3. 为字段规定类型、非空、唯一、CHECK、默认、敏感级别、保留期；状态字段必须匹配冻结 PRD。
4. 设计索引匹配真实筛选/排序/JOIN；避免索引泛滥。验证外键、删除策略、时间字段和金额精度。
5. 提供版本化迁移（up/验证/回滚或恢复方案），对历史数据进行兼容性评估；破坏性变更须明确用户同意。
## SQLite 专项硬性条件
- 每条 DB 连接启用 `PRAGMA foreign_keys=ON`，并测试外键约束生效。
- SQLite `DECIMAL` 不保证十进制定点运算精度；涉及费用金额应存整数最小单位或显式定点方案。
- SQLite 以 TEXT/INTEGER/REAL/BLOB 等存储类为基础；日期时间以已约定 ISO 文本或 epoch 整数存储，并保证格式一致。
- 不照抄 MySQL 的 `AUTO_INCREMENT`、`MODIFY`、`ON UPDATE` 或内联 `INDEX` 语法；迁移时复核 SQLite DDL 支持。
- 从数据库查询出来的业务数据必须可追溯；不把生成的示例订单伪装真实交易记录。
## 输出
`schema.sql` 或迁移 SQL、数据字典、ER 关系、查询索引说明、备份恢复说明、样本读写/外键完整性测试。
## 验收
空库初始化成功、历史库升级成功、约束有效、字段与 PRD 一致、回滚/备份恢复经过测试。
