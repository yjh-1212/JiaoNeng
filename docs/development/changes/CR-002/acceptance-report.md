# CR-002 运输需求与订单工作区开发验收

日期：2026-10-16。结论：本次本地开发变更验收通过。设计依据：冻结父基线V0.2-design-1＋增量V0.2-design-1+CR-002。明确修改和实施授权见authorization.json；用户要求两者平行，并参考辽粮上查询下列表、右侧新增编辑。细节自检依既有推荐方案委托完成，不伪称用户亲自视觉审查。

## 交付

- PAGE-047运输需求与PAGE-004运输订单为运输调度下的平行入口，分别对应#demands和#orders；不再使用同页Tab。
- 独立查询卡与列表卡；关键词/状态/主体/货物/装卸地组合查询、服务端全量分页与排序；需求关联定位订单，返回保留筛选与页码。
- 新增、编辑、订单调整、需求分批安排使用右侧约800px抽屉；固定头部和底部、双列表单、窄屏单列；错误保留输入并关联首错，退出保护和键盘关闭。
- 来源需求搜索及选择后带入货物、线路和余量；快捷登记需求需明确确认，再回原订单表单，保留已填名称与输入。
- 多批保存草稿不占量；确认生成重新核对需求版本、数量和权限，全批失败回滚，重试请求幂等；已分配来源的货物/线路受保护。
- 需求分配量与SQL核验交付量分开。需求详情有真实关联订单列表；订单可准确衔接指定订单推演；详情随实际写入刷新，变更记录按业务字段呈现。
- 手机用业务卡片展示，避免固定操作列挤压正文；桌面继续为表格。深色主题、只读账号、主体范围和司机隔离保留。

## 实测证据

| 范围 | 结果 | 文件 |
| --- | --- | --- |
| 既有产品验收 | 171/171 PASS | ac-results.json |
| Node自动化 | 257/257 PASS；其中57为REQ父测试，不重复计入171条AC | node-test.log |
| 新规则测试 | 5组PASS：保存确认、主体权限、多批守恒、回滚、幂等、版本冲突、并发超分配、过滤及核验口径 | tests/transport-workbench.test.mjs |
| 基础浏览器 | 41项PASS；含独立需求页和既有管理员/司机业务链路 | regression/browser-results.json |
| 扩展浏览器 | 7项PASS；换电/资产/能源/规划/经营/助手/个人资料与手机 | regression/extended-browser.json |
| 本次交互浏览器 | 10组PASS；含查询、右侧表单、分批、调整、快捷回填、准确推演、退出保护、手机、Tab/Esc与深色 | evidence/browser-results.json |
| 规模基准 | 100车/10站/30工位/1000订单开发目标PASS，分页P95约17.3ms | scale-benchmark.json |
| 实际本地服务 | 重启后健康接口、bootstrap、汇总、报表和资源查询PASS | 本次local-smoke输出；database-preservation.json |

浏览器合计58项检查组，无JavaScript运行错误。测试使用独立仿真SQLite及真实HTTP，不污染现有业务库；本次没有真实AI调用或外部业务写入。参考站点只查看列表与新增抽屉，未提交其表单。视觉验收在表格加载和抽屉动画结束后截图；orders-list.png、demand-editor.png、batch-editor.png、order-editor.png、demands-mobile.png、demand-editor-mobile.png和demands-dark.png已复核。failure.png为此前诊断留档，最终结果以browser-results.json为准。

## 数据、设计与回退

现有数据库先通过SQLite在线备份并校验完整性，再重启本地服务；无破坏性迁移，不清空或重新种子业务数据。重启前后需求、订单、任务、车次计数一致，见database-preservation.json。原294个冻结文件保持不变；增量规范和授权独立记录。原开发验收文档保留为父基线历史，本文件为当前变更结论。

本次源码集中在client/transport-workbench.jsx、app.jsx、routes.js、styles.css、ui.jsx、transport.jsx；后端为order-workbench.mjs、completion.mjs和repository.mjs。恢复页面可回退本变更源码；已产生的合法订单仍为原数据库实体，无需删库。恢复业务数据须另行明确决定，备份不自动覆盖当前库。

现有仿真来源标识和现场启用依赖继续有效；本次只更新本地开发服务，不部署发布。
