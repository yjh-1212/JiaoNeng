import fs from "node:fs";
import assert from "node:assert/strict";
const root = "docs/development/";
const read = (p) => JSON.parse(fs.readFileSync(root + p, "utf8"));
const ac = read("05-acceptance/ac-results.json"),
  browser = read("05-acceptance/evidence/browser-results.json"),
  extended = read("05-acceptance/evidence/extended-browser.json"),
  scale = read("05-acceptance/scale-benchmark.json"),
  live = read("04-integration/live-browser.json"),
  scan = read("04-integration/secret-scan.json");
for (const r of [ac, browser, extended, scale, live, scan])
  assert.equal(r.status, "PASS");
assert.equal(ac.executed, 171);
assert.equal(ac.records.filter((r) => r.status === "PASS").length, 171);
const testLog = fs.readFileSync(root + "05-acceptance/node-test.log", "utf8");
assert(/pass 252/.test(testLog) && /fail 0/.test(testLog));
const write = (p, v) => fs.writeFileSync(root + p, v + "\n");
// Preserve identifiers and descriptions from the existing development trace tables.
const parseLine = (line) => {
  const out = [];
  let value = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(value);
      value = "";
    } else value += c;
  }
  out.push(value);
  return out;
};
const csvRead = (p) => {
  const lines = fs
      .readFileSync(root + p, "utf8")
      .trim()
      .split(/\r?\n/),
    keys = parseLine(lines.shift());
  return {
    keys,
    rows: lines.map((line) =>
      Object.fromEntries(parseLine(line).map((v, i) => [keys[i], v])),
    ),
  };
};
const csvWrite = (p, { keys, rows }) =>
  write(
    p,
    [
      keys.join(","),
      ...rows.map((r) =>
        keys
          .map((k) => '"' + String(r[k] ?? "").replaceAll('"', '""') + '"')
          .join(","),
      ),
    ].join("\n"),
  );
const evidence =
  "tests/acceptance.test.mjs;tests/ac-cases.mjs;ac-results.json;node-test.log";
const acceptance = csvRead("05-acceptance/acceptance-evidence.csv");
for (const r of acceptance.rows) {
  assert(
    ac.records.some(
      (x) => x.acceptance_id === r.acceptance_id && x.status === "PASS",
    ),
  );
  r.result = "PASS";
  r.executed_scope = `${r.req_id}：${r.type}独立API/SQLite断言；模拟模型与现场能力不混淆`;
  r.evidence = evidence;
  r.remaining = "现场设备、真实模型精度及生产SLA按启用资料清单独立验证";
}
assert.equal(acceptance.rows.length, 171);
csvWrite("05-acceptance/acceptance-evidence.csv", acceptance);
const tasks = csvRead("01-architecture/tasks.csv");
for (const r of tasks.rows) {
  assert(ac.records.some((x) => x.acceptance_id === r.acceptance_id));
  r.status = "已实现/开发验收PASS";
}
csvWrite("01-architecture/tasks.csv", tasks);
const features = csvRead("05-acceptance/feature-implementation.csv");
for (const r of features.rows) {
  r.implementation = "已实现";
  r.verification =
    "171条AC正常/边界/权限验收＋40项基础及7项扩展浏览器检查；见acceptance-evidence.csv";
  r.remaining = "实际设备接入、实测精度和生产容量待现场启用验证";
}
csvWrite("05-acceptance/feature-implementation.csv", features);
write(
  "05-acceptance/issues.csv",
  `issue_id,severity,description,status,evidence
DEV-001,P1,171条AC已逐条执行正常/边界/权限断言且全数PASS,已关闭,ac-results.json;acceptance-evidence.csv;node-test.log
DEV-002,P1,历史回放与仿真规则合作实施改派及余量处理已实现并回归,已关闭,tests/api.test.mjs;tests/ac-cases.mjs;evidence/browser-results.json
DEV-003,P2,独立仿真库真实DeepSeek回答720吨且订单版本引用有效业务表指纹不变,已关闭,04-integration/live-browser.json;04-integration/ai-test-authorization.json
DEV-004,P2,实际BMS及设备协议道路许可合同与模型校准资料按现场启用清单补齐,启用依赖（非本地开发缺陷）,site-enablement.md
DEV-005,P2,已修复前端规划输入车次数类型运力搜索及助手输入组件问题,已关闭,evidence/browser-results.json;evidence/extended-browser.json
DEV-006,P2,仿真车辆绑定主体不一致已修正并校验司机车辆场站主体,已关闭,tests/ac-cases.mjs;tests/api.test.mjs
DEV-007,P2,电池出入站不自动认定可用库存并保留完工提交核验历史,已关闭,tests/final-regression.test.mjs;node-test.log`,
);
write(
  "05-acceptance/acceptance-report.md",
  `# E5 本地开发验收

基线 V0.2-design-1（294文件SHA256）；九模块、47功能、57需求、26目的地正式实现完成。当前结论：本地开发验收通过；按用户“我要睡觉了，后续需要审批的，你帮我按推荐确定就好”的明确委托，由开发代理依据证据办理推荐方案节点确认，不记为用户亲自审查或签署。

Windows、Node.js24.17.0、SQLite3.53.0、Playwright Chromium。全部测试使用独立仿真SQLite，未重置用户业务库。正式页面通过HTTP/API/事务/数据库联动，非前端假写入。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 产品AC | 171/171 PASS；57正常、57边界、57权限 | ac-results.json、acceptance-evidence.csv |
| Node测试 | 252/252 PASS；含57个父测试，不能计为252条产品AC | node-test.log |
| 基础浏览器 | ${browser.checks.length}项PASS，26目的地及管理员/司机流程 | evidence/browser-results.json |
| 扩展浏览器 | ${extended.checks.length}项PASS，换电库存、租赁、能源、阶段比选、统计、助手、深色手机 | evidence/extended-browser.json |
| 持久化 | 磁盘迁移、重开、幂等种子、备份完整性、业务索引 | tests/persistence.test.mjs、query-performance.json |
| 规模基准 | 100车/10站/30工位/1000订单/6账号，分页/统计/推演及10并发只读PASS | scale-benchmark.json |
| 真实外部服务 | 高德REST与JSAPI地图PASS；DeepSeek业务问答PASS | ../04-integration/map-browser.json、live-browser.json |
| 秘密扫描 | 服务端明文秘密出现0处 | ../04-integration/secret-scan.json |

规模基准为本机开发指标，不认定生产SLA。AI预测、规划和风险解释的常规自动化使用确定性模型测试替身；真实DeepSeek联调仅验证授权仿真摘要的问答、引用及只读性。模型回答不可直接执行派单、核验、授权或设备控制。

核心流程覆盖需求分配守恒、订单调整失效处理、节点能量/时间/资源边界、整批派单回滚和幂等、司机装运卸货、提交/退回/核验历史、余量替代任务关联、作业与费用分别核验更正、24小时负荷缺测、能源同边界比较、规划多候选与阶段建设、主体权限、来源与审计。完工报告不充作已核验交付，费用缺项不宣称完整成本或最低成本。

已人工查看energy-strategies.png、planning-comparison.png、assistant-prepared-simulation.png和simulation-dark-mobile.png，结构与清洁页面要求一致。此前failure.png等保留为历史诊断，不代表当前回归失败。没有未关闭P0/P1；现场启用依赖见site-enablement.md。仅本地开发，无部署发布。`,
);
write(
  "05-acceptance/site-enablement.md",
  `# 现场能力启用资料清单

用户允许缺失资料按业务仿真；本地开发能力及验收已完成。以下是将仿真能力用于现场运营时的实际输入，不以互联网资料替代现场验收，也不阻塞本地版本交付。

| 能力 | 当前可用方式 | 现场启用输入及验证 |
| --- | --- | --- |
| 实时车辆与SOC | 有时间/来源的仿真采样与人工核验，延迟/暂停状态可见 | 车辆ID、车型/BMS协议、SOC标定、GPS坐标系与采样频率；断流及时间同步实测 |
| 电量安全与运输 | 有来源的350/513kWh参考车型、节点SOC和20%候选余量 | 实车可用容量、载重/坡度/温度能耗、安全余量批准、货车通行与禁限道路、装卸时效实测 |
| 设备和换电 | 在线/离线/占用仿真，作业核验与电池去向库存联动 | 枪/柜通信协议、共享接电、实际释放时间、适配电池与健康状态，现场作业事件和幂等标识 |
| 电价和费用 | 24时段仿真电价＋服务费，实际/预计及更正版本分开 | 场站合同电费服务费税费、租赁人工和运输口径、原始账单与磅单，完整范围后才启用完整单位成本 |
| 排队/负荷预测 | 计划与资源窗口驱动参考情景，缺测不填实际0，样本偏差对照 | 真实到离站/占用及分时负荷数据，样本粒度/周期、MAE目标、独立测试集校准 |
| 绿电与储能 | 类型化容量、24时段出力、SOC/功率/效率约束，仅计划 | 并网边界、实际曲线、储能参数、控制授权及独立控制安全验收 |
| 规划推荐 | 多布局/阶段比选与条件推荐，不创建投运资产 | 用地、接电、道路、工程投资、建设周期和实际运力需求；独立工程核验 |
| 性能与运行 | 本机100车/10站/1000单测试与SQLite备份验证 | 用户并发量、网络和硬件、数据保留周期、恢复目标及生产SLA实测 |

公开来源与参数候选保存在冻结设计参考资料和数据库sources/parameters；业务身份、订单、遥测、价格、成本及能源边界持续标注仿真。高德渲染与DeepSeek连通已经实测，不等于上述现场数据已接入。`,
);
write(
  "05-acceptance/completion-summary.json",
  JSON.stringify(
    {
      completed_at: new Date().toISOString(),
      baseline: "V0.2-design-1",
      scope: "LOCAL_DEVELOPMENT",
      modules: 9,
      features: 47,
      requirements: 57,
      ac_pass: 171,
      node_tests_pass: 252,
      browser_checks_pass: browser.checks.length + extended.checks.length,
      stage_approval_basis: "明确用户委托，按推荐方案完成自检后登记",
      site_enablement: "site-enablement.md",
      deployment: false,
    },
    null,
    2,
  ),
);
console.log(
  "开发追踪及验收报告已按实际PASS证据更新；待独立校验并登记节点委托确认。",
);
