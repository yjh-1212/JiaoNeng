---
name: product-development-stage
description: 产品开发阶段 E0-E5 总控：强制验证冻结设计基线和明确授权，按设计进行技术方案、数据库/API、前端实现、联调、测试与开发验收，不含部署交付。
---
# 第二大阶段：产品开发总控
## 启动前强制闸门
- 必须具有 `docs/design/07-baseline/design-baseline.json` 的完整冻结基线和 `docs/design/design-state.json` 的冻结状态，且 SHA256 全部校验通过。
- 冻结本身不代表开发授权，必须向用户取得明确“开始第二阶段开发”的授权。用户明确批准后，在项目目录执行 `python .agents/skills/product-development-stage/scripts/development_stage.py authorize --by '确认人' --evidence '确认原文或会议记录'` 登记凭证。
- 不得更改已冻结设计。发现规则缺口/设计冲突，输出 CR，等待重新设计确认或用户对差异给出明确决定。
## 开发节点
- E0：设计交接/版本与授权。先运行脚本 `init`、`check --stage E0`。
- E1：技术架构及模块任务拆分：`spec-driven-development`。
- E2：数据库与后端：`backend-development` + 三个专项 Skills。
- E3：前端实现与 UI 一致性：`frontend-design` + `interface-design`，参考冻结原型。
- E4：专项能力与联调：地图 `amap-jsapi-skill`，动画按框架选择 `gsap-*`，不可默认加载全部 GSAP。
- E5：系统测试/验收：`playwright-skill` + `ux-audit`，核验真实数据链与角色操作流程。
## 每轮执行要求
读取 E0 授权→确认待处理模块/AC→按照开发任务实施→运行测试→记录证据→展示结果与未决问题→用户确认节点，禁止代签。
## 范围
仅本地/开发环境的编码、数据库迁移、联调和测试；**不制作 Render/Docker/部署流程，不自动发布上线**。后续部署交付是独立议题。
更多详见 `workflows/product-development.md`、`references/STAGES.md`。
