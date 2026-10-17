# D3 详细PRD审阅入口

状态：待用户批准 ｜ 保持18个二级菜单，详情与记录位于所属工作区

建议先看[PRD总册](prd-overview.md)和[跨模块规则](business-rules.md)，再按业务阅读下列模块。

| 模块 | 需求 | 主要审阅点 |
|---|---|---|
| [MOD-001 订单与调度](modules/MOD-001.md) | REQ-001—005 | 需求拆单、可行性、方案版本、全批派单及通知分离 |
| [MOD-002 运输执行](modules/MOD-002.md) | REQ-006—010 | 一车一司机、多车次、反馈、改派与核验完工 |
| [MOD-003 充换电运营](modules/MOD-003.md) | REQ-011—016 | 适配、设备状态、排队、补能计划与实际作业 |
| [MOD-004 能源协同](modules/MOD-004.md) | REQ-017—021 | 供电边界、负荷预测、策略及协同计划 |
| [MOD-005 资源规划](modules/MOD-005.md) | REQ-022—026 | 流量、候选点、容量与车辆电池投放建议 |
| [MOD-006 监测保障](modules/MOD-006.md) | REQ-027—032、057 | 态势、轨迹、预警处置和总览口径 |
| [MOD-007 成本运营](modules/MOD-007.md) | REQ-033—037 | 费用包含项、分摊、资产与置换证明 |
| [MOD-008 AI辅助](modules/MOD-008.md) | REQ-038—042、056 | 条件确认、工具及证据、权限和执行边界 |
| [MOD-009 基础管理](modules/MOD-009.md) | REQ-043—055 | 来源质量、两类账号、参数、可靠性及其他非功能要求 |

配套文档：[共用字段](common-fields.md)、[关键复合请求](command-payloads.md)、[数据接口需求](data-interface-requirements.md)、[指标口径](metrics.md)、[参数与未决条件](open-decisions.md)、[权限细化](permission-refinements.md)、[自检](self-check.md)。

CSV索引：module-index.csv、field-dictionary.csv、feature-catalog.csv、interface-catalog.csv、acceptance-catalog.csv、traceability.csv、parameter-register.csv。

本次重点新增细化：草稿与正式分配占用分开、全批派单原子生效、通知与承接分开、多车次计量与完工核验、来源及版本冲突、成本更正与有效版本、AI底层工具授权。所有新细化等待D3批准；已明确用户决定见decision-log.md。

本轮还没有进入D4页面规格与D5原型。20组参数主要缺真实资料，不能从文档数量推断模型或接入已经就绪。
