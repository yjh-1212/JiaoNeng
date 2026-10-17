---
name: enterprise-saas-implementation
description: 企业 SaaS 产品开发专项，读取冻结设计基线、映射模块任务，并实现前后端/权限/业务流程；不得擅自改设计。
---
# 企业 SaaS 实施阶段专项
仅当 `product-development-stage` 的 E0 设计基线验证通过且用户明确同意开发后使用。
- 以页面清单、字段规则、状态转换、业务验收 AC 为事实基线，保持菜单与流程一致。
- 用 `backend-development` + `database-schema-designer` + `nodejs-backend-patterns` 建立真实业务数据链。
- 前端按冻结原型实现；设计差异记录进开发日志并先报用户确认。
- 使用 `playwright-skill` 在真实运行系统做端到端测试，检查数据读写而不是只截图。
- 仅做本地开发、联调、测试和开发阶段交付检查；不调用部署发布流程。
原始多阶段 Skill 放于 `references/ORIGINAL-ENTERPRISE-SUPERVISOR.md` 仅供参考。
