# E5 本地开发验收

基线 V0.2-design-1（294文件SHA256）；九模块、47功能、57需求、26目的地正式实现完成。当前结论：本地开发验收通过；按用户“我要睡觉了，后续需要审批的，你帮我按推荐确定就好”的明确委托，由开发代理依据证据办理推荐方案节点确认，不记为用户亲自审查或签署。

Windows、Node.js24.17.0、SQLite3.53.0、Playwright Chromium。全部测试使用独立仿真SQLite，未重置用户业务库。正式页面通过HTTP/API/事务/数据库联动，非前端假写入。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 产品AC | 171/171 PASS；57正常、57边界、57权限 | ac-results.json、acceptance-evidence.csv |
| Node测试 | 252/252 PASS；含57个父测试，不能计为252条产品AC | node-test.log |
| 基础浏览器 | 40项PASS，26目的地及管理员/司机流程 | evidence/browser-results.json |
| 扩展浏览器 | 7项PASS，换电库存、租赁、能源、阶段比选、统计、助手、深色手机 | evidence/extended-browser.json |
| 持久化 | 磁盘迁移、重开、幂等种子、备份完整性、业务索引 | tests/persistence.test.mjs、query-performance.json |
| 规模基准 | 100车/10站/30工位/1000订单/6账号，分页/统计/推演及10并发只读PASS | scale-benchmark.json |
| 真实外部服务 | 高德REST与JSAPI地图PASS；DeepSeek业务问答PASS | ../04-integration/map-browser.json、live-browser.json |
| 秘密扫描 | 服务端明文秘密出现0处 | ../04-integration/secret-scan.json |

规模基准为本机开发指标，不认定生产SLA。AI预测、规划和风险解释的常规自动化使用确定性模型测试替身；真实DeepSeek联调仅验证授权仿真摘要的问答、引用及只读性。模型回答不可直接执行派单、核验、授权或设备控制。

核心流程覆盖需求分配守恒、订单调整失效处理、节点能量/时间/资源边界、整批派单回滚和幂等、司机装运卸货、提交/退回/核验历史、余量替代任务关联、作业与费用分别核验更正、24小时负荷缺测、能源同边界比较、规划多候选与阶段建设、主体权限、来源与审计。完工报告不充作已核验交付，费用缺项不宣称完整成本或最低成本。

已人工查看energy-strategies.png、planning-comparison.png、assistant-prepared-simulation.png和simulation-dark-mobile.png，结构与清洁页面要求一致。此前failure.png等保留为历史诊断，不代表当前回归失败。没有未关闭P0/P1；现场启用依赖见site-enablement.md。仅本地开发，无部署发布。
