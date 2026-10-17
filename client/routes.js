import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Zap,
  ShieldCheck,
  MapPinned,
  Settings,
  Bot,
  Gauge,
} from "lucide-react";
export const groups = [
  ["运营总览", LayoutDashboard, [["overview", "运营总览"]]],
  ["综合驾驶舱", Gauge, [["cockpit", "综合驾驶舱"]]],
  [
    "订单管理",
    ClipboardList,
    [
      ["demands", "运输需求"],
      ["orders", "运输订单"],
    ],
  ],
  [
    "任务调度",
    Truck,
    [
      ["simulation", "交能推演"],
      ["tasks", "运输任务"],
    ],
  ],
  [
    "能源管理",
    Zap,
    [
      ["charging", "补能调度"],
      ["stations", "场站作业"],
      ["energy", "用能管理"],
    ],
  ],
  [
    "运行保障",
    ShieldCheck,
    [
      ["monitoring", "运行监控"],
      ["alerts", "异常处置"],
    ],
  ],
  [
    "规划决策",
    MapPinned,
    [
      ["planning", "场站规划"],
      ["deployment", "运力规划"],
    ],
  ],
  ["AI智能体", Bot, [["assistant", "AI智能体"]]],
  [
    "系统管理",
    Settings,
    [
      ["entities", "基础资料"],
      ["resources", "运力档案"],
      ["station-files", "场站档案"],
      ["integrations", "数据管理"],
      ["users", "用户权限"],
      ["parameters", "系统设置"],
    ],
  ],
];
export const routeNames = Object.fromEntries(
  groups
    .flatMap(([, I, children]) => children)
    .concat([
      ["account", "个人信息"],
      ["assistant", "AI智能体中心"],
      ["m-tasks", "我的任务"],
      ["m-energy", "补能安排"],
      ["m-profile", "我的"],
    ]),
);
export const pageIds = {
  overview: "001",
  cockpit: "049",
  orders: "004",
  demands: "047",
  simulation: "005",
  tasks: "007",
  resources: "009",
  stations: "010",
  "station-files": "048",
  charging: "012",
  energy: "016",
  monitoring: "031",
  alerts: "034",
  planning: "022",
  deployment: "024",
  entities: "035",
  integrations: "036",
  users: "038",
  parameters: "040",
  account: "042",
  assistant: "043",
  "m-tasks": "044",
  "m-energy": "045",
  "m-profile": "046",
};
export const fromHash = () => {
  const raw = location.hash.slice(1).split("?")[0];
  if (routeNames[raw]) return raw;
  if (/^page-\d+$/.test(raw))
    return (
      Object.keys(pageIds).find((k) => "page-" + pageIds[k] === raw) ||
      "overview"
    );
  return "overview";
};
