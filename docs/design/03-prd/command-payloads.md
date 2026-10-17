# D3 关键复合请求与事件结构

本文件补充interface-catalog.csv中的结构体字段。字段代码引用field-dictionary.csv；结构不是数据库表或已实现API。正式动作共同遵守主体授权、expected_version、幂等和审计。

## 1 需求拆单与订单生成

请求外层：demand_id、需求expected_version、owner_subject_id（必须在授权范围内）、correlation_id、idempotency_key、items。

items每项：计划运量planned_quantity/单位、起讫origin_point/destination_point、货类cargo_type、装卸时间窗和required_finish_at、委托consignor_id、来源分配allocation_quantity。允许沿用需求值时必须在请求或确认摘要明确，不能以空值暗示任意默认。

处理：拆单先建立订单草稿并展示拟分配；确认订单时统一核对本次正式分配与当前需求余量，正式分配在确认后生效；同一提交不重复分配。结果包括新订单标识/编号/版本、每项分配、剩余量和来源需求版本。草稿不占正式量，不能通过复制草稿自动占量；并发确认要重新核验剩余量。

## 2 全批派单

外层：dispatch_batch_id、run_id、solution_id及对应有效版本、correlation_id、idempotency_key、dispatch_items。管理员身份和可操作范围取认证上下文，不由请求自由指定。

dispatch_items每项必须说明：

| 内容 | 字段与要求 |
|---|---|
| 业务归属 | task_id（已有草案时）、order_id和父/子expected_version；新任务不得跨订单混归属 |
| 当前指派 | vehicle_id、driver_id、assignment_version或新指派声明；一个任务一车一司机 |
| 组织量 | planned_task_quantity和单位、对应订单可组织量依据 |
| 时间与排程 | planned_start_at、planned_end_at、车次安排或可解释批次，装卸及返程约束引用 |
| 能源保障 | energy_plan_id或明确补能草案；station_id、方式、预计到站、电量/电池适配、能源边界版本 |
| 校验依据 | 订单/方案/参数/运力/场站边界快照引用，关键来源时效及冲突核验 |

校验失败返回整个批次未生效及每项有权可见的原因。全批成功返回任务及指派版本、关联补能安排与通知投递状态。已有有效批次重复提交返回原结果；不能重新建一组同样任务。

业务生效之后的通知可异步投递。收到超时或未知结果时查询批次，不直接生成新派单；通知失败只重试投递。司机拒单是新的业务反馈，不回滚全批历史。

## 3 司机执行事件与多车次反馈

请求：task_id、trip_id（首次登记可由系统生成）、assignment_version、event_type、occurred_at、适用reported_quantity及单位、位置/资料引用evidence_ids、correlation_id、idempotency_key。

只接受本人有效指派允许的节点动作。发生时间与received_at分别保留；源事件唯一键或幂等键判重复。GPS、设备数据与司机人工反馈分别标来源，冲突转核验，不按最后收到值覆盖。

完成提交包含completion_submission_id、关联车次清单及报告量、未完成/中止说明、适用凭证和补能关联。不能用一个“已完成”布尔值直接修改任务终态。

## 4 核验和退回

请求：task_id、completion_submission_id及expected_version、verification_result、核验车次与verified_quantity、适用evidence_ids、change_reason。操作者必须有task.verify且在主体范围。

确认前核对实际交付及在途责任，按P-004确定的口径比较。退回保留原提交并说明差异；司机补充形成新版本。核验不把已取消量转为交付，也不重复累加此前已核验车次。

执行中终止采用已批准D2方式：明确已交付及未交付、责任交接和补能影响，原任务保留历史，余量另建关联替代任务。新旧任务必须引用同一剩余量依据，不能两边继续组织同一余量。

## 5 补能计划、预测输入及实际作业

计划至少关联vehicle_id、适用task_id、station_id、service_modes、planned_arrival_at和窗口、充电required_energy_kwh或换电规格库存约束、引用来源/版本。安排可以不指定唯一设备，但必须有可行的服务能力依据。

arrival_series每项含车辆/任务/计划引用、到站时刻及范围、预计SOC或电量、补能方式与适配、服务量/时长及数据属性；设备供给含当前状态时间、预计release_at、有效功率或换电服务与库存。预测输出每时段需求、服务、队列、等待和影响对象，带运行与输入依据。

实际session记录车站设备、actual_start_at/actual_end_at、充电metered_energy_kwh或battery_in_id/battery_out_id、来源唯一键、可选任务/计划及fee_record_ids。无计划作业仍可核验；司机报告不能直接改设备计量或费用金额。

## 6 能源策略与协同计划

请求指定forecast_window、有效demand_run_ids、grid_capacity_kw/transformer_limit_kw、负荷与绿电序列、适用储能SOC/容量/功率边界、tariff_version、strategy_type和引用模型参数。

结果包括predicted_load_series、strategy_id、estimated_cost及费用范围、constraint_violations，不能只有一句自然语言推荐。协同确认引用linked_plan_versions与effective_window；变化触发版本核验，旧执行段保留。

当前没有执行充放电命令的请求结构。新增控制能力必须另行确认授权、安全策略、联锁和责任，不在本PRD中留隐藏可执行入口。

## 7 费用、价格及更正

费用记录指定源唯一键、cost_record_id、对象关联、fee_type/fee_nature、amount/currency、fee_quantity/单位、unit_price/单位、pricing_rule_id及生效时段、included_fee_types、tax_basis、allocation_basis与原始依据。

计价组件数组必须说明每项量、价、单位、时间段、是否已含在总额及来源。分时电费可按各生效段有效电量乘对应单价求和，但跨段电量取得方式和服务费规则需有依据；不能把整单电量全部套最低谷价。

更正请求引用replacement_record_id、expected_version和原因，生成待核验新版本。报表只汇总被确认的有效版本，不加总原版与替代版；金额调整不是自动付款、退款或税务凭证。

## 8 规划、AI及配置版本

规划项目包含dataset_refs、data_window、候选点及用地接电核验、路网/服务模型、设备配置、投资假设及建设顺序。结果保留每候选评价和未核查条件，推荐不生成投运资产。

AI工具请求带business_context、extracted_conditions、tool_id和用户确认的输入快照；只可调用当前授权工具。ai.use只是使用对话入口的资格，底层查询/推演还必须通过对应对象和操作授权；例如调度计算验simulation.run，规划资料验planning.read，费用查询验cost.read。

权限配置请求包含user_id、role_id、subject_scope、operation_codes及适用bound_driver_id，校验可授予上限。参数启用包含parameter_id/value/unit、parameter_version、有效期和依据；旧运行引用旧版，不把当前值回填进历史解释。
