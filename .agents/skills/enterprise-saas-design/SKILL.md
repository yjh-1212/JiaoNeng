---
name: enterprise-saas-design
description: 企业级 SaaS 系统产品设计专项。只能进行信息架构、流程、PRD、页面/原型与人工评审，禁止正式编码。
---
# 企业 SaaS 产品设计限定入口
在设计阶段 D1~D6 使用，遵守 `product-design-stage` 的全部闸门和 `enterprise-prd-detail` 详细规格。
- 明确角色、菜单/功能边界、组织数据范围和可操作权限。
- 支持数据密集列表、组合检索、表单、工作流、地图、驾驶舱等复杂界面。
- D4 明确布局系统、交互状态；D5 原型代码只能位于 `prototypes/design-preview/`。
- 不接受上游 `enterprise-saas-product-builder` 中有关正式前端编程、正式接口和数据持久化的跨阶段动作。
- 交付前执行 UX 审查、原型 Playwright 测试，并由用户明确确认。
上游原 Skill 仅作为背景阅读：`references/ORIGINAL-ENTERPRISE-SUPERVISOR.md`，它并不是可执行入口。
