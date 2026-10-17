# 产品设计阶段 Skill 路由（2026-10-13）

| 节点 | 主 Skill | 辅助 Skill | 不得调用的行为 |
|---|---|---|---|
| D0 | product-discovery | product-methodology | 正式源码改动 |
| D1 | product-discovery | competitive-analysis-process（涉及竞品时） | 以无来源数据冒充真实数据 |
| D2 | information-architecture | user-story-mapping / product-design | 自动实施 CRUD |
| D3 | enterprise-prd-detail | prd-development / user-story / epic-breakdown-advisor | 直接开发接口/数据库 |
| D4 | ui-ux-pro-max | interface-design / product-design-and-ux / ux | 正式前端代码修改 |
| D5 | design-prototype | frontend-design / amap-design-skill | 在生产目录写代码 |
| D6 | ux-audit | web-accessibility / playwright-skill | 自动代用户审批 |

专项触发：地图设计→amap-design-skill；驾驶舱→dashboard-design-system + dashboard-product-design-standard；AI 智能体→agent-orchestration-advisor；企业系统→enterprise-saas-design。

- 每个设计任务只设一个主 Skill，并按需加载不超过 2 个辅助 Skill；特殊场景再使用专项 Skill。
- `enterprise-saas-product-builder` 原始 Skill 跨越设计、编码与测试，未作为可执行入口安装。设计使用拆分后的 `enterprise-saas-design`。
- `frontend-design` 在本阶段只可输出原型目录 HTML/CSS/JS 或设计建议。
- `playwright-skill` 在本阶段只测试 `prototypes/design-preview/` 中的原型。
- `prd-development` 上游引用 `workshop-facilitation`，若未安装，用 `product-design-stage/references/WORKSHOP-PROTOCOL.md` 替代其引导规则；`product-methodology` 的其他缺失依赖只作为可选参照，不中断执行。
