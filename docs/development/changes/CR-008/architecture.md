# CR-008 技术与接口交接

设计依据为CR-008冻结增量，父基线保持不变。授权见同目录authorization.json，细节审查依用户既有推荐方案委托完成，非用户逐项签署。

## 数据与事务

独立场景存入现有records，resource=simulation-scenarios，无新增数据库结构。记录来源类型/ID/版本/可用量、输入、约束版本、三方案计算结果、AI分析、人工选定方案和最终任务ID。保存、重算与确认均不预留来源量或实际运力。已生成场景不可覆盖，可新建场景；查询恢复最新场景，无历史版本菜单。

场景命令复用现有登录、CSRF、主体范围、角色操作权限、幂等键、审计及SQLite事务。外部路网与模型调用在事务外，落库前再核对场景、来源、场站及在线工位版本。并发版本冲突返回409，不覆盖新状态。

| 接口/命令 | 行为 |
| --- | --- |
| GET /api/scenarios/source/:resource/:id | 读取已确认需求/订单的可组织量与参考输入 |
| GET /api/scenarios/current?source_resource=&source_id= | 恢复该来源最新场景；主体隔离 |
| GET /api/resources/simulation-scenarios/:id | 读取场景及结果 |
| GET /api/maps/search?q= | 服务端高德POI查询，前端选择GCJ02坐标 |
| scenario.save | 创建或更新场景，输入变化使旧结果/确认失效 |
| scenario.run | 有向道路计算、离散事件模拟、DeepSeek分析、版本复核后保存 |
| scenario.analyze | 对现有计算结果重新调用DeepSeek |
| scenario.confirm | 仅确认可行方案，不生成任务 |
| scenario.dispatch | 人工映射实际车辆/司机后原子生成待派发任务 |

命令统一POST /api/commands，传type/id/payload与expected_version，并使用Idempotency-Key。需求来源在dispatch同一事务中创建并确认订单、扣分配量，再创建任务；映射冲突整体回滚。订单来源只使用未组织余量，已有待派发任务不被静默替换。生成后沿用任务页整批校验、统一派发。兼容桥保留simulations及多场站补能节点，原执行API测试继续通过。

## 计算模型

scenario-engine采用有限工位的离散事件模拟，包含装卸排队/服务、重载运输、补能排队/服务、卸载和空载返程。SOC与车次质量守恒，补能资源由本次车辆、其他平台计划、初始占用及模拟社会到达共享。三种启发式策略比较时效、成本及等待；不宣称全局最优。分时费用跨小时分段，司机和运输成本按输入估算。

硬约束包括最低SOC、能源路径、任务时间、司机工时、作业窗口和排队/补能上限。软风险与硬校验分开展示。无可行解保留原因与建议，不允许确认。1–60辆、最多7天与5000趟限制用于控制计算规模。

高德V5通用驾车服务提供有向道路折线，缓存1小时、请求合并、串行650ms节流及QPS重试；路网失败不以直线伪造路线。地图按累计道路长度插值，暂停、倍速、拖动、事件跳转使用同一个模拟时钟；结束或受阻车辆停留实际最后节点。坐标、车速和路段模型仍需现场核实，不是货车导航或实测轨迹。

## DeepSeek

沿用服务端api_key/环境变量配置，默认deepseek-flash；POST官方chat/completions，JSON对象输出，关闭thinking，45秒超时。输入仅当前场景的数量/资源参数、三方案指标、瓶颈及限制。返回summary、可行方案ID、最多4条理由及最多4项有界数值建议。

程序校验推荐ID可行性、建议字段白名单/范围/整数，丢弃越界或未知字段。模型不能创建订单、任务或操作设备。建议仅填写配置，需重新推演后确认；失败显示不可用和重试，既有程序结果保留，不伪造AI文案。实测见live-integration.json及浏览器实时联调记录。

## 前端与参考来源

simulation-workbench.jsx负责页面和生命周期，scenario-map.jsx负责高德生命周期与图层，simulation-playback.js负责纯状态插值。左配置/右摘要可折叠，底部明细在文档流，1100px及以下堆叠，手机可操作。离开未保存条件有保护；已有场景不会被助手输入覆盖。智能助手条件卡转入新版工作台，原聊天页面不再执行旧版计算。

官方依据：[高德道路规划](https://lbs.amap.com/api/webservice/guide/api/newroute)、[DeepSeek JSON输出](https://api-docs.deepseek.com/guides/json_mode/)、[DeepSeek thinking参数](https://api-docs.deepseek.com/guides/thinking_mode/)。

## 真实性与限制

已实接高德道路和DeepSeek。业务站点/车队、装卸能力、外部车流及费用输入为模拟，界面保留仿真标识与模型依据入口。未接入实时社会车流、BMS、地磅或真实现场设备；通用路网不验证货车限高/限重/禁行与矿内道路许可。未来1/2/4小时数量为模拟到达汇总，不冒充实时预测。模型用于条件比选，实际派单前仍需确认现场数据。
