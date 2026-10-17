---
name: product-design-stage
description: 以 D0-D6 独立设计阶段执行产品发现、业务流程、信息架构、详细 PRD、页面 UI/UX、高保真原型、评审与冻结。仅设计，不修改正式系统。
---

# 产品设计阶段总控 Skill

## 何时触发
用户提出新产品规划、可研转 PRD、业务功能分析、菜单架构、页面设计、交互原型、产品设计评审、设计冻结等任务时使用。如果用户要求直接进入正式开发，先检查是否具有已冻结设计基线；没有则告知设计未完成，待确认后再切换。

## 执行前必读
1. `workflows/product-design.md`。
2. 本目录 `references/STAGE-GATES.md`、`SKILL-ROUTING.md`、`DESIGN-QUALITY.md`、`CHANGE-CONTROL.md`。
3. 项目已有 `AGENTS.md`、真实需求文档、`docs/design/design-state.json`（若存在）。
4. 当前阶段需要的模板；必要时查询用户已有项目资料。

## 运行过程（按顺序）
1. 检查项目现有 Skill 和文档，不重复安装或调用冗余 Skills。
2. 若尚未初始化，建议用户运行 `python .agents/skills/product-design-stage/scripts/design_stage.py init`，由模板生成设计目录。不要重置已有成果。
3. 从 `design-state.json` 读取当前进度，找出**第一个未批准的 Dn**；若此前已批准文件被改动，先要求复审。额外参考 `enterprise-prd-detail` 的逐字段设计标准。
4. 针对当前节点收集资料、分析证据、调用匹配设计 Skills，输出对应文件。只在 `docs/design/` 和 `prototypes/design-preview/` 写入成果。
5. 对全部业务事实做证据标记：已证实、假设、模拟示意、待核实。仅依靠网页搜索不能假装获得平台实时内部业务数据。
6. 使用脚本 `check --stage Dn` 做结构性检查，并按阶段闸门实施人工内容检查。检查脚本无法替代完整业务/视觉评审。
7. 向用户展示本节点关键成果和需要决定的事项；**用户明确批准后**才能登记审批；不批准则按反馈修订。
8. D0—D6 全部通过后，生成冻结基线；继续保持设计阶段，只能按另行授权启动开发。

## 技能路由（重要）
- D0/D1：主 `product-discovery`，辅 `product-methodology`。
- D2：主 `information-architecture`，辅 `user-story-mapping` 或 `product-design`。
- D3：主 `enterprise-prd-detail`，辅 `prd-development` / `user-story` / `epic-breakdown-advisor`。企业级特殊场景可调用 `enterprise-saas-design`。
- D4：主 `ui-ux-pro-max`，辅 `interface-design`、`ux`、`dashboard-design-system`（适用时）。
- D5：主 `design-prototype`，辅 `frontend-design`、`amap-design-skill`（地图原型场景）。
- D6：主 `ux-audit`，辅 `web-accessibility`、`playwright-skill`（**仅检查独立原型**）。
- 以上 Skill 可能因用户环境缺失：对非必选 Skill 目录不存在时用内置模板继续；对本包的主 Skill 如缺失，应中止并报告包损坏。**不得把缺失技能当作阻塞条件。**

## 阶段边界：不可妥协
- 可以：PRD、菜单/流程/状态图、交互文案、设计系统、高保真 HTML/CSS/JS **隔离原型**、原型浏览器测试。
- 不可以：修改正式前后端、开发接口/数据库、迁移数据、部署、连接真实生产服务、用 Mock 冒充真实生产数据、擅自切换第二阶段。
- 原型可以模拟交互，但必须在可见位置说明示意数据并不等于真实生产数据。
- 各设计模块必须追踪来源→需求→流程→模块→页面→原型→验收标准；不能只生成图片就说设计完成。

## 设计文档深度
- 模块级：目的、业务角色、先决条件、流程、字段、校验、规则、状态、权限、异常、接口需求、验收。
- 页面级：布局、控件、字段、必填、可编辑、交互、菜单路径、响应式要求、分页、弹窗、空/错/加载态、原型路径。
- 行业专项：运输路径/运价/能源/地图的真实性与可行性必须有数据来源和精度说明，见 `references/DASHBOARD-MAP.md`。

## 输出格式
每次答复：当前节点；本次完成文件；关键设计决策；未决问题和证据；下一步待用户确认内容。不得自行宣称通过审批。
