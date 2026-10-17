# 第一大阶段：产品设计工作流（D0—D6）

## 使用约定
- 设计阶段是一个完整的产品生命周期片段，不依赖开发任务才能交付。
- 设计成果按模块和页面组织，覆盖项目**全部在本期范围内**的页面及重要状态，不仅首页或某个主页面。
- 启动前先盘点现有项目文档、Skill、用户历史已确认决策；**有证据优先引用，没有证据标记假设，不重复提问已明确事项**。
- 任何节点结束时：输出已完成项、待确认点、证据来源、风险、对应文件；**等待用户确认**。

## 七个节点

### D0 项目启动与证据建档
输入：项目名称、业务领域、可研/需规、已有页面、目标受众、已有约束。
输出：`00-intake/project-brief.md`、`00-intake/source-register.csv`。
闸门：范围与不做事项明确；证据真实可定位；冲突决策得到标记；用户确认启动基准。

### D1 产品发现与需求定义
输入：D0、用户访谈、现状流程、角色需求。
输出：`01-discovery/discovery.md`、`personas.md`、`requirements.csv`。
闸门：每个重要角色有目标与典型任务；需求有编号、来源、优先级与验收目标。

### D2 业务流程与信息架构
输入：D1、既有业务规则及系统架构。
输出：`02-architecture/processes.md`、`information-architecture.md`、`state-permission.csv`。
闸门：主流程闭环，一级/二级菜单无重叠，权限、状态及异常路径说明清晰。

### D3 功能级详细 PRD
输入：D2 以及数据接口约束。
输出：`03-prd/prd-overview.md`、`module-index.csv`、`modules/*.md`、`data-interface-requirements.md`、`traceability.csv`。
闸门：每个模块编号和详细文档一一对应；包括输入输出、规则、可见性、操作校验、异常和验收；需求可追踪到模块和页面。

### D4 页面交互与视觉规范
输入：D3，现有品牌规范，设计参考。
输出：`04-ux-ui/page-inventory.csv`、`pages/*.md`、`ui-system.md`、`interaction-states.md`。
闸门：每个页面有独立编号和规格；字段、操作、搜索、按钮、分页、弹窗、下钻、可见性、加载/空/错误状态齐全；统一视觉系统。

### D5 可运行高保真原型
输入：D4 页面规格。
输出：`prototypes/design-preview/index.html`（可附其它静态资产）、`05-prototype/navigation.md`、`05-prototype/walkthrough.md`。
闸门：浏览器可打开，核心流程可点击走通；导航、表单、弹窗、筛选和各种状态能演示；核心页面都有原型入口；原型不调用真实生产接口。

### D6 设计评审和冻结准备
输入：D0—D5、用户评审意见。
输出：`06-review/review-report.md`、`coverage-report.md`、`issue-closure.csv`、`approval.md`。
闸门：需求—功能—页面—原型—验收映射完整；P0/P1 问题闭环；用户明确审批记录；无未说明的关键假设。

## 冻结条件与开发交接
每个节点得到明确批准后可执行：
`python .agents/skills/product-design-stage/scripts/design_stage.py approve --stage Dn --by "确认人" --evidence "明确确认的来源"`

所有节点批准后执行 `freeze --version V1.0`，产生 `docs/design/07-baseline/design-baseline.json`，包含设计文件哈希、阶段批准记录及版本。之后由用户**另行决定**是否启动正式开发。

## 交互规则
- 单个设计节点需要大量资料时，优先给出已有信息总结和**最少数量的关键问题**，避免一次发几十道问卷。
- 出现文档证据冲突时，形成决策项并向用户确认，不擅自以最新文件推断必然正确。
- 先业务正确、再交互合理、后视觉高级。不能为了大屏效果牺牲业务准确性。
- 页面设计不应出现无用的解释文本、没有依据的统计数字或凭空创建的业务功能。
- 若用户只是修改某一页，仍先判断是否影响流程、数据和其他页面，再进行局部设计迭代。
