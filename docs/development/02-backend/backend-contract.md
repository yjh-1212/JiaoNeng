# E2 后端接口与数据契约

基线 V0.2-design-1。正式服务：server/app.mjs；领域服务：transport.mjs、operations.mjs、extensions.mjs、completion.mjs；专项计算：scheduling.mjs、charging-model.mjs、energy-model.mjs；统计/助手/审计：reporting.mjs、assistant.mjs、auditing.mjs；仓储：repository.mjs；迁移：schema.sql。Node.js 24 原生 SQLite，Express 5，同源 HTTP + 会话。

| 接口 | 输入与结果 | 权限/状态 |
| --- | --- | --- |
| POST /api/auth/login、logout | 账号密码→HttpOnly 会话；退出删除会话 | scrypt；登录失败限流；写操作CSRF |
| GET /api/auth/me、bootstrap | 本人账号、主体范围、必要主档 | 驱动客户端身份；司机不返回全量订单 |
| GET /api/resources/:resource、/:id | 服务端分页、搜索、状态、主体、白名单排序；任务包含车次 | 仓储强制主体范围；司机本人关联资料；账号信息不返回散列 |
| POST /api/commands | type/id/payload + Idempotency-Key →结果/关联ID | 各动作验操作权限和对象版本；事务含业务、成功审计与幂等结果 |
| GET /api/commands/:key | 原请求结果 COMPLETED/NOT_FOUND | 仅当前用户 |
| GET /api/summary | 核验量、有效实际费用、预计费用、实际作业电量 | SQL有效状态聚合；缺完整成本范围不计算单位成本 |
| GET /api/reports | 时间/主体/场站范围、任务预计与实际差异、车站聚合及来源ID | 与summary同核验口径；费用缺项时单位成本为null |
| GET /api/telemetry/:vehicle | 最近288采样、发生时间、来源 | 先检查车辆权限；仿真不是实车轨迹 |
| GET /api/maps/config、/_AMapService/* | JSAPI浏览器Key及安全代理 | 安全密钥服务端附加；外部目标固定 |
| POST /api/assistant | 问题+授权数据摘要→只读回答与业务引用 | ai.use；服务端DeepSeek调用；不开放执行工具 |

业务动作包含需求/订单维护、计算推演、方案确认、整批派单、司机接收/拒绝、车次节点、提交/核验/退回/终止余量、补能计划与时序优化、作业及费用核验更正、排队负荷预测、能源协同版本、规划/投放及需求走廊、预警处置、资产事项、接入仿真同步、质量纠正、账号授权与参数候选版本。

金额存整数分，运量存整数kg，时间ISO、页面Asia/Shanghai。主表核心列带FK/CHECK；业务扩展JSON带json_valid，核心约束由服务层验证。业务对象不可物理删除历史；费用更正新版本经核验才替代，作业更正保留原值；来源事件去重，过期版本409。外部真实设备协议尚未接入，相关入口明确仿真。

操作权限为内部技术代码，PRD权限组合映射到真实动作，主档查询/操作均受主体范围限制。只读账号不可写、司机不可执行管理操作或查询经营费用。失败审计不记录凭证、请求全文或外部密钥。

补充业务边界：order.amend取消未执行任务和关联未执行计划，失效旧方案并保留调整历史与已履约事实；task.submit/return/verify保留逐次历史；余量新任务双向关联替代任务。resource.configure校验可用窗口与占用冲突；电池人工出入站先设不可用，asset.ready核验后更新库存。profile.update只能维护本人，改密码验证当前密码并注销旧会话。排队/能源/规划成果保留输入版本；助手标注输入变化成果的历史解释属性，不执行业务动作。
