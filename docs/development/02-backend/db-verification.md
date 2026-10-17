# E2 数据库和 API 验证

2026-10-14 本地 Windows / Node.js24.17.0 / SQLite3.53.0。执行 npm test：252个Node测试计数全部通过，包括57个REQ父测试和171条AC子测试，以及20个既有API/持久化测试与4个收尾回归。产品AC口径为171/171，不将Node父测试重复计入产品AC。源码tests/api.test.mjs、tests/persistence.test.mjs、tests/acceptance.test.mjs、tests/ac-cases.mjs、tests/final-regression.test.mjs；覆盖真实HTTP与独立内存/磁盘SQLite，未使用实际业务库做测试。

已验证：外键与金额精度；登录/CSRF/跨源/只读/司机IDOR；需求分配守恒；请求幂等与内容冲突；方案过期资源校验；整批冲突回滚；拒单重派不重复有效补能计划；装运卸货、重复事件、报告与核验分开、退回补充；余量终止与重新组织；费用核验后替代；作业更正核验且不覆盖费用；重复/无效/跨主体同步；账号授权上限及秘密不回显；参数草案禁生产启用；能源新版本；时序调整过期全批回滚；磁盘重启、重复迁移/种子、VACUUM INTO备份及integrity_check。

索引验证：1020条任务样本，EXPLAIN QUERY PLAN使用idx_tasks_driver_state；本机单次列表SQL约0.07ms，详query-performance.json。这不是整体API时延、并发容量或SLA验收。

来源：共享公开目录取自冻结D6资料，包含11项引用/20项参考参数候选；种子由关系与业务规则生成。原生数据库不会从前端接收整库对象，页面写入必须走命令事务。数据模式全程标记LOCAL_SIMULATION，现场协议、BMS及合同仍待实际接入。

补充规模验收：100辆车、10站、30工位、1000订单、6账号，20次订单分页P95约18.94ms，20次统计P95约16.73ms，10次推演P95约21.87ms，10并发只读约16.15ms；实际逐次结果见05-acceptance/scale-benchmark.json。新增测试资源明确待核实，不伪造已投运能力。本地目标由用户委托按推荐确定，不作为生产SLA。
