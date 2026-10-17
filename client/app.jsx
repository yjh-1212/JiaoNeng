import { advancedActions } from "./advanced";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, Button } from "@lobehub/ui";
import {
  ConfigProvider,
  App as AntApp,
  Menu,
  Dropdown,
  Modal,
  Drawer,
  Select,
  Input as AntInput,
  Alert,
  theme as antTheme,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  Bot,
  UserRound,
  ChevronDown,
  RefreshCw,
  LogOut,
  Eye,
  EyeOff,
} from "lucide-react";
import { Context } from "./context";
import { request, command, detail, driverPortal } from "./api";
import { groups, routeNames, fromHash, pageIds } from "./routes";
import {
  Heading,
  Card,
  PanelHost,
  FormHost,
  RecordDetail,
  Pill,
  Source,
  time,
  format,
  money,
} from "./ui";
import { Tasks } from "./transport";
import Simulation from "./goal-simulation";
import PlanningWorkspace from "./planning-workbench";
import AgentCenter from "./agent-center";
import AgentLauncher from "./agent-launcher";
import Cockpit from "./cockpit";
import {
  Orders,
  Demands,
  TransportEditor,
  TransportRecord,
} from "./transport-workbench";
import {
  Overview,
  ResourcePage,
  Stations,
  Charging,
  Energy,
  Planning,
  GenericWorkspace,
  Monitoring,
  Assistant,
} from "./workspaces";
import Driver from "./driver";
import { MonitoringWorkspace, IncidentWorkspace } from "./safety-workbench";
import {
  ChargingWorkspace,
  StationWorkspace,
  EnergyWorkspace,
  StationFiles,
} from "./energy-workbench";
import "./styles.css";
import "./header-navigation.css";
import "./login.css";
import corporateLogo from './assets/china-data-union-logo.png';
const field = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  required: true,
  ...extra,
});
const operatingStart = () => {
  const d = new Date();
  if (d.getHours() >= 20) {
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
  } else if (d.getHours() < 6) d.setHours(6, 0, 0, 0);
  return d;
};
const localDate = (v) => {
  const d = new Date(v || Date.now());
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function Platform() {
  const navigationGuard = useRef(null);
  const { message } = AntApp.useApp(),
    [user, setUser] = useState(null),
    [boot, setBoot] = useState(null),
    [loading, setLoading] = useState(true),
    [entryError, setEntryError] = useState(""),
    [page, setPage] = useState(fromHash),
    [revision, setRevision] = useState(0),
    [panelState, setPanel] = useState(null),
    [modal, setModal] = useState(null),
    [transportEditor, setTransportEditor] = useState(null),
    [transportQueries, setTransportQueries] = useState({}),
    [theme, setTheme] = useState("auto"),
    [confirmState, setConfirm] = useState(null),
    [pending, setPending] = useState(null),
    [intentDraft, setIntentDraft] = useState(null),
    [agentContext, setAgentContext] = useState(null),
    [agentOverlay, setAgentOverlay] = useState(false);
  const dark =
    theme === "dark" ||
    (theme === "auto" && matchMedia("(prefers-color-scheme:dark)").matches);
  useEffect(() => {
    document.body.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!agentOverlay && page !== "assistant") return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [agentOverlay, page]);
  const go = (route, draft = null, approvedLeave = false) => {
    route = routeNames[route] ? route : "overview";
    if (route === "assistant" && draft?.agent_entry && page !== "assistant") {
      setIntentDraft(draft);
      setAgentOverlay(true);
      return;
    }
    if (route !== page && navigationGuard.current && !approvedLeave)
      return navigationGuard.current(() => go(route, draft, true));
    setAgentOverlay(false);
    setIntentDraft(draft);
    setPage(route);
    const sourceQuery =
      route === "simulation" && draft?.agent_handoff
        ? new URLSearchParams({
            agent_conversation: draft.agent_handoff,
            agent_revision: String(Date.now()),
            new: "1",
            ...(draft.order_id
              ? { order_id: draft.order_id }
              : draft.demand_id
                ? { demand_id: draft.demand_id }
                : {}),
          })
        : route === "simulation" && draft?.planning_handoff
          ? new URLSearchParams({
              planning_id: draft.planning_handoff.solution_id,
              new: "1",
            })
          : route === "simulation" && draft?.order_id
            ? new URLSearchParams({ order_id: draft.order_id })
            : route === "simulation" && draft?.demand_id
              ? new URLSearchParams({ demand_id: draft.demand_id })
              : [
                    "charging",
                    "m-energy",
                    "m-tasks",
                    "monitoring",
                    "alerts",
                    "tasks",
                    "stations",
                  ].includes(route) && draft
                ? new URLSearchParams(
                    Object.fromEntries(
                      Object.entries({
                        task: draft.task_id,
                        owner: draft.owner_id,
                        stage: draft.stage,
                        order: draft.order_id,
                        station: draft.station_id,
                        date: draft.date,
                        plan: draft.plan_id,
                        incident: draft.incident_id,
                        feedback: draft.feedback ? "1" : undefined,
                      }).filter(([, v]) => v),
                    ),
                  )
                : null;
    if (sourceQuery && draft?.fresh) sourceQuery.set("new", "1");
    if (sourceQuery && route === "simulation" && draft?.safety_review) {
      sourceQuery.set("incident_id", draft.incident_id);
      sourceQuery.set("task", draft.task_id || "");
      sourceQuery.set("safety_review", "1");
    }
    location.hash = route + (sourceQuery ? "?" + sourceQuery : "");
    setPanel(null);
    setModal(null);
    setTransportEditor(null);
    window.scrollTo(0, 0);
  };
  async function refresh() {
    const data = await request("/api/bootstrap");
    setBoot(data);
    setUser(data.user);
    setRevision((x) => x + 1);
    return data;
  }
  async function enterWorkspace() {
    setLoading(true);
    setEntryError("");
    try {
      let identity;
      try { identity = await request('/api/auth/me'); }
      catch(e) {
        if (!driverPortal || e.status !== 401) throw e;
        identity = await request('/api/auth/driver-demo', {method:'POST', body:{}});
      }
      if (!driverPortal && identity.user.role === 'driver') {
        await request('/api/auth/logout', {method:'POST',body:{}});
        setUser(null);setBoot(null);return;
      }
      const data = await refresh();
      if (data.user.role === 'driver' && !fromHash().startsWith('m-')) go('m-tasks');
    } catch(e) {setUser(null);setBoot(null);setEntryError(e.message);}
    finally {setLoading(false);}
  }
  useEffect(() => {
    enterWorkspace();
    const h = () => {
      setPage(fromHash());
      setPanel(null);
      setModal(null);
    };
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);
  const can = (operation) =>
    user?.operations.includes("*") || user?.operations.includes(operation);
  const options = (resource, filter = () => true) =>
    (boot?.[resource] || []).filter(filter).map((x) => ({
      value: x.id,
      label: x.code ? x.code + " · " + x.name : x.name,
    }));
  const label = (key, id) => {
    const resource = {
      owner_id: "organizations",
      vehicle_id: "vehicles",
      driver_id: "drivers",
      order_id: "orders",
      demand_id: "demands",
      task_id: "tasks",
      station_id: "stations",
    }[key];
    const r = boot?.[resource]?.find((x) => x.id === id);
    return r?.code || r?.name || id || "—";
  };
  const execute = async (type, id, payload = {}, requestKey = null) => {
    const key = requestKey || crypto.randomUUID();
    try {
      const result = await command(type, id, payload, key);
      if (result.reauthenticate) {
        setUser(null);
        setBoot(null);
        setPanel(null);
        setModal(null);
        message.success("资料已保存，请重新登录");
        return result;
      }
      await refresh();
      setPending((p) => (p?.key === key ? null : p));
      message.success("操作已保存");
      return result;
    } catch (e) {
      if (e.code === "NETWORK") setPending({ key, type, id, payload });
      throw e;
    }
  };
  const openForm = (title, fields, initial, submit, submitLabel) => {
    setPanel(null);
    setModal({ title, fields, initial, submit, submitLabel });
  };
  const confirmAction = (title, body, action) =>
    setConfirm({ title, body, action });
  const panel = (title, body) => setPanel({ title, body });
  const showDetail = async (resource, id) => {
    if (resource === "alerts") return go("alerts", { incident_id: id });
    if (resource === "tasks") return go("tasks", { task_id: id });
    try {
      const row = await detail(resource, id);
      panel(
        {
          orders: "订单详情",
          tasks: "运输任务详情",
          stations: "场站详情",
          vehicles: "车辆详情",
          costs: "费用与计价依据",
          alerts: "预警处置详情",
        }[resource] || "业务详情",
        ["demands", "orders"].includes(resource) ? (
          <TransportRecord key={resource + id} resource={resource} row={row} />
        ) : (
          <RecordDetail resource={resource} row={row} />
        ),
      );
    } catch (e) {
      message.error(e.message);
    }
  };
  const openTransport = (descriptor) => {
    setPanel(null);
    setModal(null);
    setTransportEditor(descriptor);
  };
  const editOrder = (row = null, demand = null) =>
    openTransport({ kind: "order", row, demand });
  const editDemand = (row = null, initial = null) =>
    openTransport({ kind: "demand", row, initial });
  const generateOrders = (demand) =>
    openTransport({ kind: "allocation", demand });
  const evidenceForm = (
    title,
    type,
    resource,
    r,
    labelText = "核验依据",
    extra = [],
    initial = {},
  ) =>
    openForm(
      title,
      [...extra, field("evidence", labelText, "textarea")],
      initial,
      (v) =>
        execute(type, r.id, { ...v, expected_version: r.version, resource }),
    );
  const editCharging = () =>
    openForm(
      "新增补能安排",
      [
        field("vehicle_id", "关联车辆", "select", {
          options: options("vehicles", (v) => v.status === "可用"),
        }),
        field("task_id", "关联任务", "select", {
          options: options(
            "tasks",
            (t) => !["已完成", "已取消"].includes(t.status),
          ),
          required: false,
        }),
        field("station_id", "补能场站", "select", {
          options: options("stations"),
        }),
        field("arrival_at", "预计到站", "datetime"),
        field("quantity_kwh", "预计补能量（kWh）", "number", {
          min: 1,
          max: 1000,
        }),
      ],
      {
        vehicle_id: boot.vehicles[0]?.id,
        station_id: boot.stations[0]?.id,
        arrival_at: localDate(Date.now() + 3600000),
        quantity_kwh: 120,
      },
      (v) => execute("charging.create", null, v),
    );
  const editSession = () =>
    openForm(
      "登记实际补能作业",
      [
        field("vehicle_id", "关联车辆", "select", {
          options: options("vehicles"),
        }),
        field("station_id", "关联场站", "select", {
          options: options("stations"),
        }),
        field("task_id", "关联任务", "select", {
          required: false,
          options: (v) =>
            options("tasks", (t) => t.vehicle_id === v.vehicle_id),
        }),
        field("plan_id", "关联补能计划", "select", {
          required: false,
          options: (v) =>
            options(
              "charging",
              (c) =>
                c.vehicle_id === v.vehicle_id && c.station_id === v.station_id,
            ),
        }),
        field("driver_id", "作业司机", "select", {
          options: options("drivers"),
          required: false,
        }),
        field("device_id", "作业工位", "select", {
          options: (v) =>
            options("devices", (d) => d.station_id === v.station_id),
        }),
        field("incoming_battery", "换入电池", "select", {
          when: (v) =>
            boot.stations.find((s) => s.id === v.station_id)?.mode === "换电",
          options: (v) =>
            options(
              "assets",
              (b) =>
                b.kind === "电池" &&
                b.station_id === v.station_id &&
                b.available,
            ),
        }),
        field("outgoing_battery", "换出电池", "select", {
          when: (v) =>
            boot.stations.find((s) => s.id === v.station_id)?.mode === "换电",
          options: (v) =>
            options(
              "assets",
              (b) => b.kind === "电池" && b.vehicle_id === v.vehicle_id,
            ),
        }),
        field("source_event_id", "来源作业编号", "text", { required: false }),
        field("quantity_kwh", "计量电量（kWh）", "number", { min: 0.1 }),
        field("amount", "来源金额（元）", "number"),
        field("included", "已包含费用项"),
        field("start_at", "实际开始", "datetime"),
        field("finish_at", "实际结束", "datetime"),
        field("evidence", "计量或换电凭证", "textarea"),
      ],
      {
        vehicle_id:
          boot.vehicles.find((v) => v.id === "V001")?.id ||
          boot.vehicles.find((v) => v.driver_id)?.id,
        station_id:
          boot.stations.find((s) => s.id === "S001")?.id ||
          boot.stations[0]?.id,
        device_id: boot.devices.find((d) => d.station_id === "S001")?.id,
        quantity_kwh: 120,
        amount: 153.6,
        included: "电费及服务费",
        start_at: localDate(Date.now() - 3600000),
        finish_at: localDate(),
      },
      (v) => execute("session.create", null, v),
    );
  const editCost = (r = null) =>
    openForm(
      r ? "费用更正草案" : "登记费用",
      [
        field("name", "费用说明"),
        field("task_id", "关联任务", "select", {
          required: false,
          options: options("tasks"),
        }),
        field("nature", "预计/实际", "select", {
          options: ["预计", "实际"].map((value) => ({ value, label: value })),
        }),
        field("category", "费用类别", "select", {
          options: [
            "电费",
            "服务费",
            "电费及服务费",
            "运输费用",
            "租赁费用",
            "维保费用",
          ].map((value) => ({ value, label: value })),
        }),
        field("amount", "来源金额（元）", "number"),
        field("included", "已包含费用项"),
        field("source_event_id", "来源费用编号", "text", { required: false }),
        field("fee_quantity", "计价量", "number", { required: false }),
        field("quantity_unit", "计价单位", "text", { required: false }),
        field("unit_price", "来源单价（元）", "number", { required: false }),
        field("tax_basis", "税费口径", "text", { required: false }),
        field("allocation_basis", "分摊依据", "textarea", { required: false }),
        field("evidence", "原始计价与分摊依据", "textarea"),
      ],
      r
        ? { ...r, amount: r.amount_cents / 100 }
        : {
            nature: "实际",
            category: "电费",
            amount: 86.4,
            included: "仅电费，不含服务费",
          },
      (v) =>
        execute("cost.create", null, {
          ...v,
          replacement_id: r?.id,
          expected_version: r?.version,
        }),
    );
  const reportAlert = (t = null) =>
    openForm(
      "报告业务异常",
      [
        field("name", "异常类型", "select", {
          options: [
            "车辆故障",
            "补能排队",
            "时效延误",
            "设备异常",
            "其他情况",
          ].map((value) => ({ value, label: value })),
        }),
        field("reason", "情况说明", "textarea"),
      ],
      { name: "补能排队" },
      (v) => execute("alert.report", null, { ...v, task_id: t?.id }),
    );
  const createResource = (resource) =>
    openForm(
      "新增业务记录",
      [
        field("name", "名称"),
        field("kind", "类型"),
        ...(resource === "assets"
          ? [
              field("vehicle_id", "关联车辆", "select", {
                options: options("vehicles"),
                required: false,
              }),
              field("capacity_kwh", "电池容量（kWh）", "number", {
                required: false,
              }),
            ]
          : resource === "replacements"
            ? [
                field("partner", "合作主体"),
                field("quantity", "目标数量（辆）", "number", { min: 1 }),
                field("contact", "联系人"),
              ]
            : resource === "entities"
              ? [field("code", "业务编码")]
              : []),
        field("note", "登记内容", "textarea"),
        field("evidence", "来源依据", "textarea", { required: false }),
      ],
      {
        kind:
          resource === "assets"
            ? "电池"
            : resource === "entities"
              ? "矿区/堆场"
              : "业务资料",
      },
      (v) => execute("resource.create", null, { ...v, resource }),
    );
  const createPhysical = (resource) => {
    const fields =
      resource === "vehicles"
        ? [
            field("code", "车辆编号"),
            field("name", "车辆名称"),
            field("driver_id", "绑定司机", "select", {
              required: false,
              options: options("drivers"),
            }),
            field("capacity_kwh", "电池容量（kWh）", "number", { min: 1 }),
            field("payload_tonnes", "有效载重（吨）", "number", { min: 0.1 }),
            field("soc", "当前SOC（%）", "number", { max: 100 }),
            field("energy_per_km", "参考能耗（kWh/km）", "number", {
              min: 0.1,
            }),
            field("compatibility", "补能适配"),
            field("available_window", "可用窗口"),
          ]
        : resource === "drivers"
          ? [
              field("code", "司机编号"),
              field("name", "司机姓名"),
              field("license", "驾驶资格"),
              field("available_window", "可用窗口"),
            ]
          : resource === "stations"
            ? [
                field("code", "场站编号"),
                field("name", "场站名称"),
                field("mode", "补能方式", "select", {
                  options: ["充电", "换电"].map((value) => ({
                    value,
                    label: value,
                  })),
                }),
                field("power_kw", "有效供电（kW）", "number"),
                field("longitude", "经度", "number", {
                  min: 73,
                  max: 136,
                  precision: 6,
                }),
                field("latitude", "纬度", "number", {
                  min: 18,
                  max: 54,
                  precision: 6,
                }),
                field("compatibility", "服务适配"),
                field("available_window", "可用窗口"),
              ]
            : resource === "energy-resources"
              ? [
                  field("name", "资料名称"),
                  field("station_id", "所属场站", "select", {
                    options: options("stations"),
                  }),
                  field("kind", "能源类别", "select", {
                    options: ["电网", "绿电", "储能"].map((value) => ({
                      value,
                      label: value,
                    })),
                  }),
                  field("note", "边界与适用范围", "textarea"),
                ]
              : [
                  field("name", "资料名称"),
                  ...(resource === "candidates"
                    ? [
                        field("longitude", "经度", "number", {
                          min: 73,
                          max: 136,
                          precision: 6,
                        }),
                        field("latitude", "纬度", "number", {
                          min: 18,
                          max: 54,
                          precision: 6,
                        }),
                        field("capacity_kw", "候选接电容量（kW）", "number"),
                      ]
                    : []),
                  field("kind", "资料类型"),
                  field("note", "边界与适用范围", "textarea"),
                ];
    openForm(
      "登记" +
        {
          vehicles: "车辆",
          drivers: "司机",
          stations: "场站",
          candidates: "候选点",
          "energy-resources": "能源资源",
          rules: "预警规则",
        }[resource],
      [...fields, field("evidence", "来源与核验依据", "textarea")],
      resource === "vehicles"
        ? {
            capacity_kwh: 350,
            payload_tonnes: 30,
            soc: 74,
            energy_per_km: 1.58,
            compatibility: "待核验",
            available_window: "06:00—22:00",
          }
        : resource === "drivers"
          ? { license: "A2", available_window: "06:00—22:00" }
          : resource === "stations"
            ? {
                mode: "充电",
                power_kw: 0,
                longitude: 107.64,
                latitude: 35.75,
                compatibility: "待核验",
                available_window: "06:00—22:00",
              }
            : resource === "energy-resources"
              ? {
                  kind: "电网",
                  station_id: boot.stations.find((s) => s.id === "S001")?.id,
                }
              : {
                  kind: "候选资料",
                  longitude: 107.65,
                  latitude: 35.76,
                  capacity_kw: 720,
                },
      (v) =>
        execute("resource.create", null, {
          ...v,
          resource,
          owner_id: user.scopes[0],
        }),
    );
  };
  const editUser = () =>
    openForm(
      "配置账号",
      [
        field("username", "登录账号"),
        field("name", "显示名称"),
        field("password", "本地登录密码", "password"),
        field("role", "操作角色", "select", {
          options: [
            { value: "admin", label: "管理员" },
            { value: "driver", label: "司机" },
          ],
        }),
        field("driver_id", "司机绑定（司机必填）", "select", {
          options: options("drivers"),
          required: false,
        }),
        field("scopes", "主体范围", "select", {
          multiple: true,
          options: boot.organizations.map((o) => ({
            value: o.id,
            label: o.name,
          })),
        }),
      ],
      { role: "driver", scopes: [user.scopes[0]] },
      (v) =>
        execute("user.create", null, {
          ...v,
          operations: v.role === "admin" ? ["read"] : ["driver.execute"],
        }),
    );
  const submitCompletion = (t) =>
    openForm(
      "提交完工核对",
      [
        field("evidence", "本次完工凭证", "textarea"),
        field("remaining_reason", "未履约量及责任说明", "textarea", {
          required: t.reported_kg < t.quantity_kg,
        }),
      ],
      {
        evidence: t.completion_evidence || "",
        remaining_reason: t.remaining_reason || "",
      },
      (v) =>
        execute("task.submit", t.id, { ...v, expected_version: t.version }),
    );
  const driverTrip = async (t, tr) => {
    if (tr.status === "已装货") {
      await execute("trip.depart", t.id, {
        expected_version: t.version,
        trip_id: tr.id,
        event_id: crypto.randomUUID(),
      }).catch((e) => message.error(e.message));
      return;
    }
    const load = tr.status === "待装货";
    openForm(
      load ? "反馈装货完成" : "反馈卸货交付",
      [
        field(
          "quantity",
          load ? "装货量（吨）" : "报告交付量（吨）",
          "number",
          {
            min: 0.001,
            max: load
              ? boot.vehicles.find((v) => v.id === t.vehicle_id)?.payload_kg /
                1000
              : tr.loaded_kg / 1000,
          },
        ),
        field(
          "evidence",
          load ? "装货凭证或说明" : "交付凭证或说明",
          "textarea",
        ),
        field("occurred_at", "实际发生时间", "datetime"),
        field("late_reason", "补录说明（发生超过15分钟必填）", "textarea", {
          required: false,
        }),
      ],
      {
        occurred_at: localDate(),
        quantity: load
          ? Math.min(30, (t.quantity_kg - t.reported_kg) / 1000)
          : tr.loaded_kg / 1000,
      },
      (v) =>
        execute(load ? "trip.load" : "trip.deliver", t.id, {
          ...v,
          expected_version: t.version,
          trip_id: tr.id,
          event_id: crypto.randomUUID(),
        }),
    );
  };
  const detailActions = (resource, r) => {
    const buttons = [];
    const add = (name, fn, primary = false, operation = "resource.write") =>
      can(operation) &&
      buttons.push(
        <Button key={name} type={primary ? "primary" : "default"} onClick={fn}>
          {name}
        </Button>,
      );
    if (resource === "orders") {
      if (r.status === "草稿") {
        add("编辑草稿", () => editOrder(r), false, "order.write");
        add(
          "确认订单",
          () =>
            confirmAction(
              "确认订单",
              `核对 ${format(r.quantity_kg / 1000)} 吨及需求当前余量。`,
              () =>
                execute("order.confirm", r.id, { expected_version: r.version }),
            ),
          true,
          "order.write",
        );
      }
      if (r.status === "已确认")
        add("调整订单", () => editOrder(r), false, "order.write");
      if (r.status === "已确认")
        add("进入交能推演", () => go("simulation"), true, "simulation.run");
      add(
        "复制为新草稿",
        () =>
          execute("order.copy", r.id, {}).catch((e) =>
            message.error(e.message),
          ),
        false,
        "order.write",
      );
      if (["草稿", "已确认"].includes(r.status))
        add(
          "取消未履约订单",
          () =>
            openForm(
              "取消未履约订单",
              [field("reason", "取消原因", "textarea")],
              {},
              (v) =>
                execute("order.cancel", r.id, {
                  ...v,
                  expected_version: r.version,
                }),
            ),
          false,
          "order.cancel",
        );
    }
    if (resource === "demands") {
      if (r.status === "草稿")
        add(
          "确认需求",
          () =>
            confirmAction("确认需求", "确认后可拆分运输订单。", () =>
              execute("demand.confirm", r.id, { expected_version: r.version }),
            ),
          true,
          "demand.write",
        );
      if (["草稿", "已确认"].includes(r.status))
        add("编辑需求", () => editDemand(r), false, "demand.write");
      if (r.status === "已确认" && r.allocated_kg < r.quantity_kg)
        add("生成订单", () => generateOrders(r), true, "order.write");
    }
    if (resource === "tasks") {
      if (r.status === "待核验") {
        add(
          "核验通过",
          () =>
            evidenceForm(
              "核验本次完工",
              "task.verify",
              resource,
              r,
              "核验依据",
              [field("verified_quantity", "核验交付量（吨）", "number")],
              { verified_quantity: r.reported_kg / 1000 },
            ),
          true,
          "task.verify",
        );
        add(
          "退回补充",
          () =>
            openForm(
              "退回补充",
              [field("reason", "需要补充的内容与依据", "textarea")],
              {},
              (v) =>
                execute("task.return", r.id, {
                  ...v,
                  expected_version: r.version,
                }),
            ),
          false,
          "task.verify",
        );
      }
      if (["待接收", "已接收"].includes(r.status))
        add(
          "变更指派",
          () =>
            openForm(
              "变更指派",
              [
                field("vehicle_id", "新车辆", "select", {
                  options: options("vehicles", (v) => v.status === "可用"),
                }),
                field("driver_id", "新司机", "select", {
                  options: options("drivers", (v) => v.status === "可用"),
                }),
                field("reason", "责任交接与变更原因", "textarea"),
              ],
              { vehicle_id: r.vehicle_id, driver_id: r.driver_id },
              (v) =>
                execute("task.reassign", r.id, {
                  ...v,
                  expected_version: r.version,
                }),
            ),
          false,
          "task.verify",
        );
      if (r.notification === "投递失败")
        add(
          "仅重试通知",
          () => execute("task.notify", r.id, { expected_version: r.version }),
          false,
          "task.verify",
        );
    }
    if (resource === "charging" && ["草稿", "待确认"].includes(r.status))
      add(
        "确认安排",
        () =>
          confirmAction(
            "确认补能安排",
            "核对车辆、场站和预计到站，计划不代替实际作业。",
            () =>
              execute("charging.confirm", r.id, {
                expected_version: r.version,
              }),
          ),
        true,
        "charging.write",
      );
    if (
      resource === "charging" &&
      ["草稿", "待确认", "已确认"].includes(r.status)
    )
      add(
        "调整到站时序",
        () =>
          openForm(
            "调整到站时序",
            [
              field("arrival_at", "预计到站", "datetime"),
              field("reason", "调整原因", "textarea"),
            ],
            { arrival_at: localDate(r.arrival_at) },
            (v) =>
              execute("charging.adjust", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "charging.write",
      );
    if (resource === "sessions" && r.status === "待核验")
      add(
        "核验作业",
        () => evidenceForm("核验实际补能作业", "session.verify", resource, r),
        true,
        "session.verify",
      );
    if (resource === "costs") {
      if (r.status === "待核验")
        add(
          "核验费用",
          () => evidenceForm("核验费用", "cost.verify", resource, r),
          true,
          "cost.verify",
        );
      if (r.status !== "已替代")
        add("更正为新版本", () => editCost(r), false, "cost.write");
    }
    if (resource === "alerts") {
      const actions = {
        待受理: ["受理并指派", "alert.accept"],
        处理中: ["提交处置结果", "alert.resolve"],
        待关闭: ["确认关闭", "alert.close"],
        已关闭: ["重新受理", "alert.reopen"],
      };
      if (actions[r.status]) {
        const [name, type] = actions[r.status];
        add(
          name,
          () => evidenceForm(name, type, resource, r, "处置与核验依据"),
          true,
          "alert.write",
        );
      }
    }
    if (resource === "assets" && r.status !== "已核验投运")
      add(
        "核验投运",
        () =>
          evidenceForm("核验资产投运", "asset.verify", resource, r, "投运证明"),
        true,
        "asset.write",
      );
    if (resource === "replacements" && r.status === "草稿")
      add(
        "确认合作方案",
        () =>
          evidenceForm(
            "确认合作方案",
            "replacement.confirm",
            resource,
            r,
            "合作依据",
          ),
        true,
        "asset.write",
      );
    if (
      ["planning", "deployment"].includes(resource) &&
      r.status === "条件推荐"
    )
      add(
        "确认条件推荐",
        () =>
          evidenceForm(
            "确认条件推荐",
            "planning.confirm",
            resource,
            r,
            "推荐依据",
          ),
        true,
        "planning.write",
      );
    if (resource === "energy-plans" && r.status === "待确认")
      add(
        "确认协同计划",
        () => evidenceForm("确认协同计划", "energy.confirm", resource, r),
        true,
        "energy.write",
      );
    if (
      [
        "vehicles",
        "drivers",
        "stations",
        "devices",
        "entities",
        "assets",
        "replacements",
        "integrations",
      ].includes(resource)
    ) {
      const states = {
        vehicles: ["可用", "检修", "停用", "待核实"],
        drivers: ["可用", "休息", "停用"],
        stations: ["运营中", "维护", "待核实", "停用"],
        devices: ["空闲", "占用", "检修", "待核实"],
      };
      add("维护资料", () =>
        openForm(
          "维护业务资料",
          [
            field("name", "名称"),
            field("status", "当前状态", "select", {
              options: (states[resource] || [r.status]).map((value) => ({
                value,
                label: value,
              })),
            }),
            ...(resource === "vehicles"
              ? [
                  field("capacity_kwh", "电池容量（kWh）", "number", {
                    min: 1,
                  }),
                  field("payload_tonnes", "有效载重（吨）", "number", {
                    min: 0.1,
                  }),
                  field("compatibility", "补能适配"),
                  field("available_window", "可用窗口"),
                  field("energy_per_km", "参考能耗（kWh/km）", "number", {
                    min: 0.1,
                  }),
                ]
              : resource === "drivers"
                ? [
                    field("license", "驾驶资格"),
                    field("available_window", "可用窗口"),
                  ]
                : resource === "stations"
                  ? [
                      field("available_window", "可用窗口"),
                      field("power_kw", "有效供电（kW）", "number"),
                      field("compatibility", "服务适配"),
                    ]
                  : []),
            ...(resource === "devices"
              ? [
                  field("connection", "连接状态", "select", {
                    options: ["在线", "离线", "待核实"].map((value) => ({
                      value,
                      label: value,
                    })),
                  }),
                ]
              : []),
            field("evidence", "变更核验依据", "textarea"),
          ],
          { ...r, payload_tonnes: r.payload_kg / 1000 },
          (v) =>
            execute("resource.edit", r.id, {
              ...v,
              resource,
              expected_version: r.version,
            }),
        ),
      );
      if (resource === "integrations")
        add(
          "登记质量纠正",
          () =>
            openForm(
              "登记质量纠正",
              [
                field("correction", "纠正内容", "textarea"),
                field("evidence", "原始与更正依据", "textarea"),
              ],
              {},
              (v) => execute("quality.correct", r.id, v),
            ),
          false,
          "data.write",
        );
    }
    if (
      resource === "tasks" &&
      ["待派发", "待接收", "已接收"].includes(r.status)
    ) {
      add(
        "调整计划时窗",
        () =>
          openForm(
            "调整计划时窗",
            [
              field("start_at", "计划开始", "datetime"),
              field("finish_at", "计划结束", "datetime"),
              field("reason", "调整原因", "textarea"),
            ],
            {
              start_at: localDate(r.start_at),
              finish_at: localDate(r.finish_at),
            },
            (v) =>
              execute("task.schedule", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "task.verify",
      );
      add(
        "取消未执行任务",
        () =>
          openForm(
            "取消未执行任务",
            [field("reason", "取消原因", "textarea")],
            {},
            (v) =>
              execute("task.cancel", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "task.verify",
      );
    }
    if (
      resource === "tasks" &&
      ["执行中", "待核验", "退回补充"].includes(r.status)
    )
      add(
        "核验并终止余量",
        () =>
          openForm(
            "核验并终止余量",
            [
              field("verified_quantity", "核验报告量（吨）", "number"),
              field("evidence", "已完成量核验依据", "textarea"),
              field("reason", "余量责任交接与处置", "textarea"),
            ],
            { verified_quantity: r.reported_kg / 1000 },
            (v) =>
              execute("task.terminate", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "task.verify",
      );
    if (
      resource === "charging" &&
      ["草稿", "待确认", "已确认", "待调整"].includes(r.status)
    )
      add(
        "取消未执行补能",
        () =>
          openForm(
            "取消补能计划",
            [field("reason", "取消及协调说明", "textarea")],
            {},
            (v) =>
              execute("charging.cancel", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "charging.write",
      );
    if (resource === "sessions")
      add(
        "登记作业更正",
        () =>
          openForm(
            "登记作业更正",
            [
              field("correction", "更正内容", "textarea"),
              field("evidence", "原始及更正依据", "textarea"),
            ],
            {},
            (v) =>
              execute("session.correct", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "session.write",
      );
    if (
      resource === "energy-plans" &&
      ["待确认", "已确认计划"].includes(r.status)
    )
      add(
        "生成调整版本",
        () =>
          openForm(
            "调整协同计划",
            [field("reason", "影响范围与调整原因", "textarea")],
            {},
            (v) =>
              execute("energy.adjust", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "energy.write",
      );
    if (resource === "energy-plans" && r.status === "已确认计划")
      add(
        "归档协同计划",
        () =>
          evidenceForm(
            "归档协同计划",
            "energy.archive",
            resource,
            r,
            "执行归集依据",
          ),
        false,
        "energy.write",
      );
    if (
      ["planning", "deployment"].includes(resource) &&
      ["条件推荐", "已确认条件推荐"].includes(r.status)
    )
      add(
        "归档成果",
        () =>
          evidenceForm("归档成果", "planning.archive", resource, r, "归档说明"),
        false,
        "planning.write",
      );

    if (resource === "users")
      add(
        "维护账号授权",
        () =>
          openForm(
            "维护账号授权",
            [
              field("name", "显示名称"),
              field("scopes", "主体范围", "select", {
                multiple: true,
                options: boot.organizations.map((o) => ({
                  value: o.id,
                  label: o.name,
                })),
              }),
              field("operations", "可执行操作", "select", {
                multiple: true,
                options: [
                  "read",
                  "order.write",
                  "demand.write",
                  "order.cancel",
                  "simulation.run",
                  "simulation.confirm",
                  "task.dispatch",
                  "task.verify",
                  "resource.write",
                  "charging.write",
                  "session.write",
                  "session.verify",
                  "cost.write",
                  "cost.verify",
                  "forecast.run",
                  "energy.write",
                  "planning.write",
                  "asset.write",
                  "alert.write",
                  "data.write",
                  "user.manage",
                  "ai.use",
                  "driver.execute",
                  ...(user.operations.includes("*") ? ["*"] : []),
                ].map((value) => ({
                  value,
                  label:
                    {
                      read: "查询授权资料",
                      "order.write": "维护订单",
                      "demand.write": "维护需求",
                      "order.cancel": "取消未履约订单",
                      "simulation.run": "运行推演",
                      "simulation.confirm": "确认方案",
                      "task.dispatch": "整批派单",
                      "task.verify": "任务变更与核验",
                      "resource.write": "维护资源资料",
                      "charging.write": "安排补能",
                      "session.write": "登记补能作业",
                      "session.verify": "核验补能作业",
                      "cost.write": "登记费用",
                      "cost.verify": "核验费用",
                      "forecast.run": "运行预测",
                      "energy.write": "维护能源计划",
                      "planning.write": "规划与投放",
                      "asset.write": "维护资产合作",
                      "alert.write": "处置预警",
                      "data.write": "数据接入与质量核验",
                      "user.manage": "管理账号授权",
                      "ai.use": "使用智能助手",
                      "driver.execute": "本人任务执行",
                      "*": "全部操作",
                    }[value] || value,
                })),
              }),
              field("account_state", "账号状态", "select", {
                options: ["有效", "停用"].map((value) => ({
                  value,
                  label: value,
                })),
              }),
              field("password", "重置密码（留空保留）", "password", {
                required: false,
              }),
            ],
            { ...r, account_state: r.enabled ? "有效" : "停用" },
            (v) =>
              execute("user.update", r.id, {
                ...v,
                enabled: v.account_state === "有效",
                expected_version: r.version,
              }),
          ),
        false,
        "user.manage",
      );
    if (resource === "rules")
      add(
        "运行测算识别",
        () =>
          execute("rule.run", r.id, { expected_version: r.version })
            .then((x) => message.info("新增关注事件 " + x.generated + " 项"))
            .catch((e) => message.error(e.message)),
        true,
        "alert.write",
      );
    if (resource === "replacements" && r.status === "已确认方案")
      add(
        "核验实施投运",
        async () => {
          const assets = await request("/api/resources/assets?pageSize=100");
          openForm(
            "核验合作实施",
            [
              field("asset_ids", "已核验资产", "select", {
                multiple: true,
                options: assets.items
                  .filter((x) => x.status === "已核验投运")
                  .map((x) => ({
                    value: x.id,
                    label: x.code + " · " + x.name,
                  })),
              }),
              field("evidence", "实施核验依据", "textarea"),
            ],
            {},
            (v) =>
              execute("replacement.implement", r.id, {
                ...v,
                expected_version: r.version,
              }),
          );
        },
        false,
        "asset.write",
      );
    if (resource === "parameters")
      add(
        "登记候选新版本",
        () =>
          openForm(
            "登记参数候选版本",
            [
              field("candidate", "候选值"),
              field("usage_boundary", "适用边界", "textarea"),
              field("evidence", "参数来源依据", "textarea"),
            ],
            { candidate: r.candidate, usage_boundary: r.usage_boundary },
            (v) =>
              execute("parameter.draft", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "resource.write",
      );
    if (resource === "candidates")
      add(
        "核验候选条件",
        () =>
          openForm(
            "核验候选点",
            [
              field("land", "用地依据", "textarea"),
              field("grid", "接电依据", "textarea"),
              field("capacity_kw", "候选容量（kW）", "number", { min: 1 }),
              field("evidence", "核对依据", "textarea"),
            ],
            { land: r.land, grid: r.grid, capacity_kw: r.capacity_kw },
            (v) =>
              execute("candidate.verify", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "planning.write",
      );
    if (resource === "assets")
      add(
        "登记租赁维保流转",
        () =>
          openForm(
            "登记资产事项",
            [
              field("kind", "事项类型", "select", {
                options: ["租赁", "维保", "流转"].map((value) => ({
                  value,
                  label: value,
                })),
              }),
              field("note", "事项内容", "textarea"),
              field("evidence", "事项依据", "textarea"),
            ],
            { kind: "维保" },
            (v) =>
              execute("asset.record", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "asset.write",
      );
    if (resource === "quality" && r.status === "待核验")
      add(
        "核验纠正结果",
        () =>
          openForm(
            "核验纠正结果",
            [
              ...(r.source_resource === "sessions"
                ? [
                    field("quantity_kwh", "更正计量电量（kWh）", "number", {
                      min: 0.1,
                    }),
                    field("amount", "更正来源金额（元）", "number"),
                  ]
                : []),
              field("evidence", "核验依据", "textarea"),
            ],
            r.original
              ? {
                  quantity_kwh: r.original.quantity_kwh,
                  amount: r.original.amount_cents / 100,
                }
              : {},
            (v) =>
              execute("quality.review", r.id, {
                ...v,
                expected_version: r.version,
              }),
          ),
        false,
        "data.write",
      );
    if (resource === "charging-optimizations" && r.status === "待确认")
      add(
        "确认时序调整",
        () =>
          evidenceForm(
            "确认时序调整",
            "charging.apply",
            resource,
            r,
            "时效与电量复核依据",
          ),
        true,
        "charging.write",
      );
    if (resource === "integrations")
      add(
        "运行测算同步",
        () =>
          confirmAction(
            "运行测算同步",
            "基于现有车辆生成一次测算采样，不表示已连接现场协议。",
            () =>
              execute("integration.sync", r.id, {
                expected_version: r.version,
                simulated: true,
                items: boot.vehicles
                  .filter((v) => v.owner_id === r.owner_id)
                  .slice(0, 3)
                  .map((v) => ({
                    vehicle_id: v.id,
                    event_id: crypto.randomUUID(),
                    occurred_at: new Date().toISOString(),
                    longitude: v.longitude || 107.63,
                    latitude: v.latitude || 35.75,
                    soc: v.soc ?? 74,
                    speed_kmh: 0,
                  })),
              }),
          ),
        false,
        "data.write",
      );
    if (resource === "parameters")
      buttons.push(
        <Button key="disabled" disabled>
          参考参数 · 待项目核验
        </Button>,
      );
    const additional = extras.detail(resource, r);
    return buttons.length || additional.length ? (
      <div className="row action-inline">
        {buttons}
        {additional}
      </div>
    ) : null;
  };
  const logout = async () => {
    await request("/api/auth/logout", { method: "POST", body: {} });
    setUser(null);
    setBoot(null);
    setPanel(null);
    setModal(null);
    setTransportEditor(null);
    setTransportQueries({});
  };
  const analyzeDemand = () =>
    openForm(
      "运输需求分析",
      [
        field("start_at", "区间开始", "datetime"),
        field("finish_at", "区间结束", "datetime"),
      ],
      {
        start_at: localDate(Date.now() - 30 * 86400000),
        finish_at: localDate(Date.now() + 86400000),
      },
      async (v) => {
        const r = await execute("planning.analyze", null, v);
        showDetail("od-analysis", r.id);
      },
    );
  const createRule = () =>
    openForm(
      "登记测算预警规则",
      [
        field("name", "规则名称"),
        field("kind", "规则对象", "select", {
          options: [
            "SOC关注",
            "设备断流",
            "时效延误",
            "排队风险",
            "设备故障",
            "负荷越限",
          ].map((value) => ({
            value,
            label: value,
          })),
        }),
        field("threshold", "SOC关注阈值（%）", "number", {
          min: 1,
          max: 80,
          required: false,
        }),
        field("max_age_minutes", "数据有效时长（分钟）", "number", { min: 1 }),
        field("evidence", "规则依据与适用边界", "textarea"),
      ],
      { kind: "SOC关注", threshold: 20, max_age_minutes: 15 },
      (v) => execute("rule.create", null, v),
    );
  const editProfile = () =>
    openForm(
      "维护个人信息",
      [
        field("name", "显示名称"),
        field("current_password", "当前密码（改密码时必填）", "password", {
          required: false,
        }),
        field("password", "新密码（留空保留）", "password", {
          required: false,
        }),
      ],
      { name: user.name },
      (v) =>
        execute("profile.update", user.id, {
          ...v,
          expected_version: user.version,
        }),
    );
  const extras = advancedActions(
    { boot, user, can, openForm, execute, showDetail },
    field,
    localDate,
  );
  const value = {
    registerLeaveGuard: (guard) => {
      navigationGuard.current = guard;
      return () => {
        if (navigationGuard.current === guard) navigationGuard.current = null;
      };
    },
    editProfile,
    generateOrders,
    transportQueries,
    setTransportQueries,
    intentDraft,
    currentPage: page,
    setAgentContext,
    openPageAssistant: (draft) => {setIntentDraft(draft);setAgentOverlay(true);},
    closeAgentCenter: agentOverlay ? () => {setAgentOverlay(false);requestAnimationFrame(()=>document.querySelector('.agent-global-launcher')?.focus());} : null,
    createRule,
    analyzeDemand,
    boot,
    user,
    revision,
    refresh,
    go,
    can,
    label,
    execute,
    resolvePending: (key) => setPending((p) => (p?.key === key ? null : p)),
    openForm,
    confirm: confirmAction,
    panel,
    panelState,
    closePanel: () => setPanel(null),
    showDetail,
    message,
    detailActions,
    editOrder,
    editDemand,
    editCharging,
    editSession,
    editCost,
    reportAlert:
      user?.role === "admin"
        ? (t = null) =>
            go("alerts", {
              create: true,
              task_id: t?.id,
              owner_id: t?.owner_id,
            })
        : reportAlert,
    createResource,
    createPhysical,
    editUser,
    driverTrip,
    submitCompletion,
    logout,
  };
  if (loading) return <div className="state-page">正在载入工作区…</div>;
  if (driverPortal && (!user || !boot)) return <div className="driver-entry-state"><p role="status">{entryError || '司机工作区已退出'}</p><Button type="primary" onClick={enterWorkspace}>重新进入司机端</Button></div>;
  if (!user || !boot)
    return (
      <Login
        onLogin={async () => {
          const data = await refresh();
          go(data.user.role === "driver" ? "m-tasks" : "overview");
        }}
      />
    );
  let body;
  if (user.role === "driver")
    body = <Driver page={page.startsWith("m-") ? page : "m-tasks"} />;
  else {
    const views = {
      overview: <Overview />,
      cockpit: <Cockpit />,
      orders: <Orders />,
      demands: <Demands />,
      simulation: <Simulation />,
      tasks: <Tasks />,
      resources: <ResourcePage />,
      stations: <StationWorkspace />,
      charging: <ChargingWorkspace />,
      energy: <EnergyWorkspace />,
      "station-files": <StationFiles />,
      monitoring: <MonitoringWorkspace />,
      alerts: <IncidentWorkspace />,
      planning: <PlanningWorkspace />,
      deployment: <PlanningWorkspace deployment />,
      assistant: <AgentCenter />,
    };
    body =
      views[page] ||
      (["alerts", "entities", "integrations", "users", "parameters"].includes(
        page,
      ) ? (
        <GenericWorkspace key={page} page={page} />
      ) : (
        <>
          <Heading title="个人信息" />
          <Card title={user.name}>
            <div className="card-body stack">
              <dl className="kv">
                <dt>登录账号</dt>
                <dd>{user.username}</dd>
                <dt>角色</dt>
                <dd>管理员</dd>
                <dt>主体范围</dt>
                <dd>{boot.organizations.map((o) => o.name).join("、")}</dd>
              </dl>
              <div className="row">
                <Button onClick={editProfile}>维护个人信息</Button>
                <Button danger onClick={logout}>
                  退出登录
                </Button>
              </div>
            </div>
          </Card>
        </>
      ));
  }
  const nav = groups.map(([name, Icon, routes]) =>
    routes.length === 1
      ? { key: routes[0][0], label: name, icon: <Icon size={16} /> }
      : {
          key: name,
          label: <span className="nav-group-label"><span>{name}</span><ChevronDown className="nav-dropdown-indicator" size={12} aria-hidden="true"/></span>,
          icon: <Icon size={16} />,
          popupClassName: 'header-nav-popup',
          children: routes.map(([key, label]) => ({ key, label })),
        },
  );
  return (
    <ThemeProvider
      themeMode={theme}
      enableCustomFonts={false}
      customTheme={{ primaryColor: "red", neutralColor: "slate" }}
    >
      <ConfigProvider
        button={{ autoInsertSpace: false }}
        locale={zhCN}
        theme={{
          algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: {
            colorPrimary: dark ? "#FF8B98" : "#B42336",
            fontFamily: '"Microsoft YaHei",system-ui,sans-serif',
            controlHeight: 40,
            borderRadius: 6,
          },
          components: { Table: { headerBg: dark ? "#252A34" : "#F0F2F5" } },
        }}
      >
        <Context.Provider value={value}>
          {user.role === "driver" || page === "assistant" ? (
            body
          ) : (
            <div className="app-shell">
              <header className="global-header">
                <button
                  className="brand brand-home"
                  aria-label="中国数联首页"
                  onClick={() => go("overview")}
                >
                  <img className="corporate-logo" src={corporateLogo} alt="中国数联" />
                </button>
                <nav className="horizontal-nav" aria-label="管理端导航">
                  <Menu
                    mode="horizontal"
                    selectedKeys={[page]}
                    items={nav}
                    overflowedIndicator={<span className="nav-group-label"><span>更多</span><ChevronDown className="nav-dropdown-indicator" size={12} aria-hidden="true"/></span>}
                    onClick={({ key }) => go(key)}
                  />
                </nav>
                <div className="header-actions">
                  <Dropdown
                    trigger={["click"]}
                    menu={{
                      items: [
                        { key: "account", label: "个人信息" },
                        { key: "theme", label: dark ? "切换浅色" : "切换深色" },
                        { key: "logout", label: "退出登录" },
                      ],
                      onClick: ({ key }) =>
                        key === "logout"
                          ? logout()
                          : key === "theme"
                            ? setTheme(dark ? "light" : "dark")
                            : go(key),
                    }}
                  >
                    <button className="account-btn" aria-label="账号菜单" title={user.name}>
                      <UserRound size={18} />
                      <span className="account-name">{user.name}</span>
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                  </Dropdown>
                </div>
              </header>
              <div className="app-main">
                <main
                  className={
                    "content" +
                    (page === "monitoring" ? " safety-monitor-content" : "") +
                    (page === "cockpit" ? " cockpit-content" : "")
                  }
                  key={page}
                >
                  <span className="sr-only">PAGE-{pageIds[page]}</span>
                  {pending && (
                    <Alert
                      type="warning"
                      message="上次写入结果待核查"
                      action={
                        <Button
                          onClick={async () => {
                            try {
                              const r = await request(
                                "/api/commands/" + pending.key,
                              );
                              if (r.status === "COMPLETED") {
                                setPending(null);
                                await refresh();
                                message.success("已核查原请求结果");
                              } else
                                message.info(
                                  "服务端未找到本次请求，可返回原表单重新提交",
                                );
                            } catch (e) {
                              message.error(e.message);
                            }
                          }}
                        >
                          核查本次结果
                        </Button>
                      }
                    />
                  )}{" "}
                  {body}
                </main>
              </div>
            </div>
          )}
          <TransportEditor
            editor={transportEditor}
            setEditor={setTransportEditor}
          />
          {!agentOverlay && (
            <AgentLauncher page={page} context={agentContext} />
          )}
          <Drawer className="page-ai-drawer" title="交能AI · 本页助手" open={agentOverlay} onClose={()=>{if(navigationGuard.current)navigationGuard.current(()=>setAgentOverlay(false));else setAgentOverlay(false);}} size={580} destroyOnHidden styles={{body:{padding:0,overflow:'hidden'}}}>
            {agentOverlay && <AgentCenter compact />}
          </Drawer>
          <PanelHost />
          <FormHost modal={modal} close={() => setModal(null)} />
          <Modal
            title={confirmState?.title}
            zIndex={1500}
            open={!!confirmState}
            onCancel={() => setConfirm(null)}
            footer={
              <>
                <Button onClick={() => setConfirm(null)}>返回修改</Button>
                <Button
                  type="primary"
                  onClick={async () => {
                    try {
                      await confirmState.action();
                      setConfirm(null);
                      setPanel(null);
                    } catch (e) {
                      message.error(e.message);
                    }
                  }}
                >
                  确认
                </Button>
              </>
            }
          >
            <p style={{ paddingBlock: 16 }}>{confirmState?.body}</p>
          </Modal>
        </Context.Provider>
      </ConfigProvider>
    </ThemeProvider>
  );
}
function Login({ onLogin }) {
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState("JiaoNeng2026!"),
    [passwordVisible, setPasswordVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page login-redesign">
      <aside className="login-brand">
        <div className="login-brand-copy"><span>交通 · 能源 · 智能协同</span><h1>交能融合<br/>智能体平台</h1><p>让每一程运输，都有更优解。</p></div>
        <span className="login-brand-footer">TRANSPORT & ENERGY INTELLIGENCE</span>
      </aside>
      <form
        className="login-card"
        aria-label="平台登录"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await request("/api/auth/login", {
              method: "POST",
              body: { username, password, portal: 'pc' },
            });
            await onLogin();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="username">登录账号</label>
          <AntInput
            id="username"
            aria-label="登录账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">登录密码</label>
          <AntInput
            id="password"
            aria-label="登录密码"
            type={passwordVisible ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            suffix={<button className="login-password-toggle" type="button" aria-label={passwordVisible ? '隐藏密码' : '显示密码'} aria-pressed={passwordVisible} onClick={()=>setPasswordVisible(v=>!v)}>{passwordVisible ? <EyeOff size={19}/> : <Eye size={19}/>}</button>}
          />
        </div>
        {error && <Alert type="error" message={error} />}
        <Button type="primary" htmlType="submit" loading={busy}>
          登录
        </Button>
      </form>
    </div>
  );
}
class ErrorBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { error: false };
  }
  componentDidCatch(error) {
    console.error("UI_RENDER_ERROR", error.message);
  }
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="state-page">
        <h1>页面加载异常</h1>
        <Button onClick={() => location.reload()}>重新加载</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <ThemeProvider enableCustomFonts={false}>
      <ConfigProvider button={{ autoInsertSpace: false }} locale={zhCN}>
        <AntApp>
          <Platform />
        </AntApp>
      </ConfigProvider>
    </ThemeProvider>
  </ErrorBoundary>,
);
