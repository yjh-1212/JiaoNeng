export const agents = [
  {
    code: "DEMAND",
    name: "运输需求",
    icon: "package",
    color: "#3974df",
    brief: "整理运输条件，检查缺项，形成需求草稿。",
    intro: "告诉我货物、运量和起终点，我会先整理条件，帮你找到还需确认的内容。",
    resources: ["demands", "orders"],
    route: "demands",
    examples: [
      "我有3000吨煤炭需要运输，帮我整理运输需求。",
      "创建运输需求前，需要准备哪些信息？",
    ],
  },
  {
    code: "SIMULATION",
    name: "交能推演",
    icon: "route",
    color: "#7257cf",
    brief: "比较运力、时效与补能方案，解释推演结果。",
    intro:
      "可以从需求、订单或已有推演开始，比较运输条件和方案，再进入交能推演核对和计算。",
    resources: ["orders", "demands", "simulation-scenarios", "regional-plans"],
    route: "simulation",
    examples: [
      "核桃峪煤矿到正宁运输600吨煤炭，明天8点至18点完成，需要几辆车、各跑几趟？",
      "新庄煤矿到长庆桥运输600吨煤炭，帮我比较车辆排程和沿途补能安排。",
      "长庆桥到泾川运输300吨煤炭，在12小时内运完怎么安排车辆和补能？",
      "环县到固原运输120吨煤炭，帮我核对完成区间、续航和补能节点。",
    ],
  },
  {
    code: "DISPATCH",
    name: "运输调度",
    icon: "truck",
    color: "#179d95",
    brief: "查询任务进度，核查派单与资源冲突。",
    intro:
      "我会结合任务、车辆、司机及执行记录，帮你检查待办、资源占用和后续安排。",
    resources: ["tasks", "orders", "vehicles", "drivers"],
    route: "tasks",
    examples: [
      "帮我梳理待接单和执行中的运输任务。",
      "派单前，需要核查哪些车辆、司机和时间冲突？",
    ],
  },
  {
    code: "CHARGING",
    name: "补能调度",
    icon: "zap",
    color: "#d69325",
    brief: "分析到站安排、工位适配与补能影响。",
    intro:
      "告诉我任务、车辆或场站信息，帮你核对补能安排、工位情况和运输影响。",
    resources: ["charging", "stations", "tasks", "devices"],
    route: "charging",
    examples: [
      "帮我梳理待补能计划和场站工位情况。",
      "如何协调运输任务与补能时间，减少等待？",
    ],
  },
  {
    code: "INCIDENT",
    name: "异常处置",
    icon: "shield",
    color: "#d3565a",
    brief: "梳理异常影响，提供核查与处置建议。",
    intro: "从已登记异常和相关任务出发，整理业务影响、已有处置与待核实事项。",
    resources: ["alerts", "tasks", "stations"],
    route: "alerts",
    examples: [
      "哪些未关闭异常需要优先处理？给出核查建议。",
      "工位故障后，如何排查运输影响并安排处置？",
    ],
  },
  {
    code: "PLANNING",
    name: "规划决策",
    icon: "map",
    color: "#428ca7",
    brief: "解读场站布局、运力缺口与分期安排。",
    intro:
      "告诉我规划目标，结合已有资料分析场站布局、资源缺口与分期投入。",
    resources: ["planning-projects", "planning-solutions", "candidates"],
    route: "planning",
    examples: [
      "现有规划资料中，哪些车辆和充电工位缺口需要关注？",
      "场站扩容和新增站点，如何比较并安排分期投入？",
    ],
  },
];
export const agentByCode = (code) => agents.find((a) => a.code === code);
export const resourceLabels = {
  demands: "运输需求",
  orders: "运输订单",
  tasks: "运输任务",
  vehicles: "车辆",
  drivers: "司机",
  charging: "补能计划",
  stations: "场站",
  devices: "工位",
  "simulation-scenarios": "交能推演",
  "regional-plans": "省域路线方案",
  alerts: "异常事件",
  "planning-projects": "规划项目",
  "planning-solutions": "规划方案",
  candidates: "候选点",
};
export const inferAgent = (q) =>
  /选址|扩站|布局|规划|分期|投放/.test(q)
    ? "PLANNING"
    : /异常|故障|预警|离线/.test(q)
      ? "INCIDENT"
      : /补能|充电|换电|排队|工位/.test(q)
        ? "CHARGING"
        : /派单|接单|任务|进度|改派|司机|跟踪/.test(q)
          ? "DISPATCH"
          : /推演|方案|运完|几辆|多少车|时效/.test(q)
            ? "SIMULATION"
            : "DEMAND";
