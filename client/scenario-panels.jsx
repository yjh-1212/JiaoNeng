import React, { useState, useEffect, useMemo, useRef } from "react";

import { Button } from "@lobehub/ui";
import {
  Select,
  Input,
  InputNumber,
  Collapse,
  Slider,
  Switch,
  Tabs,
  Table,
  Alert,
  Empty,
  Drawer,
  Segmented,
} from "antd";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Save,
  RotateCcw,
  SlidersHorizontal,
  PanelLeftClose,
  PanelRightClose,
  ChevronRight,
  Check,
  Truck,
  Bot,
  Info,
  MapPin,
  ArrowRight,
  Plus,
  CheckCircle2,
  Clock3,
  Activity,
  Route,
} from "lucide-react";
import { useApp } from "./context";
import { request, list, detail } from "./api";
import { Heading, Pill, time, format, money, col } from "./ui";
import ScenarioMap from "./scenario-map";
import { phases, positionAt, stationAt } from "./simulation-playback";
const local = (v) => {
  const d = new Date(v);
  return Number.isFinite(+d)
    ? new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
};
const clockText = (t) =>
  new Date(t).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const objectiveOptions = [
  ["balanced", "综合均衡"],
  ["time", "最短完成时间"],
  ["cost", "最低估算成本"],
  ["charges", "最少补能次数"],
  ["queue", "最低排队时间"],
  ["vehicles", "最少车辆数"],
].map(([value, label]) => ({ value, label }));
export function PointInput({ value, onChange, label, onPick, disabled }) {
  const [options, setOptions] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    sequence = useRef(0),
    timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const search = (q) => {
    clearTimeout(timer.current);
    const ticket = ++sequence.current;
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const r = await request("/api/maps/search?q=" + encodeURIComponent(q));
        if (ticket === sequence.current) setOptions(r.items);
      } catch {
        if (ticket === sequence.current) setError("搜索暂不可用，可地图选点");
      } finally {
        if (ticket === sequence.current) setLoading(false);
      }
    }, 350);
  };
  return (
    <div className="scene-point-field">
      <span>{label}</span>
      <div>
        <Select
          aria-label={label}
          placeholder="输入地点名称搜索"
          showSearch
          filterOption={false}
          value={value?.name || undefined}
          loading={loading}
          disabled={disabled}
          onSearch={search}
          onChange={(v) => onChange(options.find((p) => p.name === v))}
          options={options.map((p) => ({
            value: p.name,
            label: (
              <span>
                {p.name}
                <small>
                  {p.city} {p.address}
                </small>
              </span>
            ),
          }))}
          notFoundContent={loading ? "正在搜索" : error || "输入地点名称搜索"}
        />
        <Button
          size="small"
          icon={MapPin}
          aria-label={"地图选择" + label}
          disabled={disabled}
          onClick={onPick}
        />
      </div>
    </div>
  );
}

export function ScenarioSettings({
  inputs,
  change,
  busy,
  scene,
  source,
  showEvidence,
  stationCatalog,
}) {
  const a = useApp();
  const num = (k, label, min, max, step = 1) => (
    <label className="scene-field" key={k}>
      <span>{label}</span>
      <InputNumber
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={inputs[k]}
        disabled={!!busy || !!scene?.generated_task_ids?.length}
        onChange={(v) => change(k, v)}
      />
    </label>
  );
  const toggle = (k, label) => (
    <label className="scene-switch" key={k}>
      <span>{label}</span>
      <Switch
        size="small"
        aria-label={label}
        checked={inputs[k]}
        disabled={!!busy || !!scene?.generated_task_ids?.length}
        onChange={(v) => change(k, v)}
      />
    </label>
  );
  const select = (k, label, options) => (
    <label className="scene-field">
      <span>{label}</span>
      <Select
        aria-label={label}
        value={inputs[k]}
        disabled={!!busy || !!scene?.generated_task_ids?.length}
        onChange={(v) => change(k, v)}
        options={options.map(([value, label]) => ({ value, label }))}
      />
    </label>
  );
  const slot = (k, label) => (
    <div className="scene-slot">
      <span>{label}</span>
      <div>
        <Slider
          aria-label={label + "滑块"}
          min={1}
          max={12}
          value={inputs[k]}
          disabled={!!busy || !!scene?.generated_task_ids?.length}
          onChange={(v) => change(k, v)}
        />
        <InputNumber
          aria-label={label}
          min={1}
          max={30}
          value={inputs[k]}
          disabled={!!busy || !!scene?.generated_task_ids?.length}
          onChange={(v) => change(k, v)}
        />
      </div>
    </div>
  );
  const groups = [
    {
      key: "base",
      label: (
        <>
          <Route size={15} />
          基础任务条件
        </>
      ),
      children: (
        <div className="scene-form-grid">
          <label className="scene-field full">
            <span>场景名称</span>
            <Input
              aria-label="场景名称"
              value={inputs.name}
              disabled={!!busy || !!scene?.generated_task_ids?.length}
              onChange={(e) => change("name", e.target.value)}
            />
          </label>
          <PointInput
            label="起点位置"
            value={inputs.origin}
            onChange={(v) => change("origin", v)}
            onPick={() => setPicking("origin")}
            disabled={!!busy || !!scene?.generated_task_ids?.length}
          />
          <PointInput
            label="终点位置"
            value={inputs.destination}
            onChange={(v) => change("destination", v)}
            onPick={() => setPicking("destination")}
            disabled={!!busy || !!scene?.generated_task_ids?.length}
          />
          <label className="scene-field">
            <span>货物</span>
            <Input
              value={inputs.cargo}
              aria-label="货物"
              disabled={!!busy || !!scene?.generated_task_ids?.length}
              onChange={(e) => change("cargo", e.target.value)}
            />
          </label>
          {num(
            "quantity",
            "运输总量（吨）",
            0.1,
            source?.available_kg / 1000,
            0.1,
          )}
          {["start_at", "deadline"].map((k) => (
            <label className="scene-field full" key={k}>
              <span>{k === "start_at" ? "计划开始时间" : "要求完成时间"}</span>
              <input
                type="datetime-local"
                aria-label={k === "start_at" ? "计划开始时间" : "要求完成时间"}
                value={local(inputs[k])}
                disabled={!!busy || !!scene?.generated_task_ids?.length}
                onChange={(e) =>
                  change(
                    k,
                    e.target.value
                      ? new Date(e.target.value).toISOString()
                      : "",
                  )
                }
              />
            </label>
          ))}
          {select("priority", "任务优先级", [
            ["normal", "常规"],
            ["high", "高优先级"],
          ])}
        </div>
      ),
    },
    {
      key: "vehicles",
      label: (
        <>
          <Truck size={15} />
          车辆与发车
        </>
      ),
      children: (
        <div className="scene-form-grid">
          {num("payload", "单车载重（吨）", 1, 60)}
          {select("vehicle_type", "车辆补能类型", [
            ["both", "充换电重卡"],
            ["charge", "纯充电重卡"],
            ["swap", "换电重卡"],
          ])}
          {num("capacity", "电池容量（kWh）", 100, 1000)}
          {num("initial_soc", "初始SOC（%）", 1, 100)}
          {num("speed", "重载车速（km/h）", 5, 80)}
          {num("empty_speed", "空载车速（km/h）", 5, 90)}
          {num("consumption", "重载能耗（kWh/km）", 0.3, 5, 0.05)}
          {num("empty_consumption", "空载能耗（kWh/km）", 0.3, 5, 0.05)}
          {select("departure_strategy", "发车策略", [
            ["auto", "自动发车"],
            ["interval", "固定间隔"],
            ["batch", "分批发车"],
          ])}
          {inputs.departure_strategy === "interval" &&
            num("departure_interval", "发车间隔（分钟）", 0, 120)}
          {inputs.departure_strategy === "batch" && (
            <>
              {num("batch_size", "每批车辆数", 1, 60)}
              {num("batch_interval", "批次间隔（分钟）", 1, 180)}
            </>
          )}
        </div>
      ),
    },
    {
      key: "handling",
      label: (
        <>
          <Activity size={15} />
          装卸资源约束
        </>
      ),
      children: (
        <div className="scene-form-grid">
          {slot("loading_slots", "同时装载车辆数")}
          {slot("unloading_slots", "同时卸载车辆数")}
          {num("loading_minutes", "单车装载（分钟）", 1, 180)}
          {num("unloading_minutes", "单车卸载（分钟）", 1, 180)}
          <div className="scene-throughput full">
            <span>
              装载{" "}
              {format((inputs.loading_slots * 60) / inputs.loading_minutes)}{" "}
              车/小时
            </span>
            <span>
              卸载{" "}
              {format((inputs.unloading_slots * 60) / inputs.unloading_minutes)}{" "}
              车/小时
            </span>
          </div>
          {["loading_window", "unloading_window"].map((k) => (
            <label className="scene-field" key={k}>
              <span>
                {k === "loading_window" ? "装载作业时段" : "卸载作业时段"}
              </span>
              <Input
                aria-label={
                  k === "loading_window" ? "装载作业时段" : "卸载作业时段"
                }
                value={inputs[k]}
                disabled={!!busy || !!scene?.generated_task_ids?.length}
                onChange={(e) => change(k, e.target.value)}
              />
            </label>
          ))}
          {num("load_queue_limit", "装载队列上限", 0, 100)}
          {num("unload_queue_limit", "卸载队列上限", 0, 100)}
          {toggle("appointments", "预约错峰装卸")}
        </div>
      ),
    },
    {
      key: "charging",
      label: (
        <>
          <Activity size={15} />
          补能与全站流量
        </>
      ),
      children: (
        <div className="scene-form-grid">
          <label className="scene-field full">
            <span>候选补能场站</span>
            <Select
              aria-label="候选补能场站"
              mode="multiple"
              value={inputs.station_ids}
              disabled={!!busy || !!scene?.generated_task_ids?.length}
              options={(stationCatalog||a.boot.stations)
                .filter((s) => s.owner_id === source?.owner_id)
                .map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => change("station_ids", v)}
            />
          </label>
          {num("min_soc", "最低安全SOC（%）", 5, 50)}
          {num("target_soc", "目标补能SOC（%）", 20, 100)}
          {num("max_charge_minutes", "单次补能上限（分钟）", 5, 240)}
          {num("max_wait", "补能等待上限（分钟）", 0, 240)}
          {toggle("allow_cross_station", "允许跨站补能")}
          {toggle("allow_detour", "允许绕行补能")}
          {toggle("prefer_low_load", "优先低负荷场站")}
          {toggle("prefer_same_type", "优先同类补能站")}
          {toggle("include_external", "纳入社会车辆预测")}
          {select("forecast_hours", "流量预测窗口", [
            [1, "未来1小时"],
            [2, "未来2小时"],
            [4, "未来4小时"],
          ])}
          {num("external_arrivals", "社会车流（辆/小时）", 0, 30)}
          {num("external_weight", "外部流量权重", 0, 3, 0.1)}
          {num("background_service", "社会车辆补能（分钟）", 5, 180)}
          {num("congestion_tolerance", "拥堵队列容忍（辆）", 0, 100)}
          <small className="full scene-muted">社会到达为推演参数</small>
        </div>
      ),
    },
    {
      key: "advanced",
      label: (
        <>
          <SlidersHorizontal size={15} />
          成本与工时
        </>
      ),
      children: (
        <div className="scene-form-grid">
          {num("max_driver_hours", "司机工时上限（小时）", 1, 24)}
          {num("cost_km", "运输成本（元/km）", 0, 20, 0.1)}
          {num("driver_hour", "司机成本（元/小时）", 0, 300)}
          <button className="scene-link full" onClick={() => showEvidence()}>
            查看模型与约束依据 <Info size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="goal-settings">
      <Collapse
        ghost
        defaultActiveKey={["vehicles"]}
        items={groups.filter((g) => g.key !== "base")}
      />
    </div>
  );
}

export function ScenarioDetails({
  plan,
  result,
  start,
  end,
  clock,
  tab,
  setTab,
  setClock,
  setPlaying,
  focusedVehicle,
  setFocusedVehicle,
  stationNames={},
}) {
  const a = useApp();
  const [energyView, setEnergyView] = useState("vehicles");
  const tabs = plan
    ? [
        {
          key: "timeline",
          label: "车辆执行时间轴",
          children: (
            <div className="scene-gantt">
              <div className="scene-gantt-legend">
                {Object.entries(phases)
                  .filter(([k]) => !["done", "pending", "blocked"].includes(k))
                  .map(([k, label]) => (
                    <span key={k}>
                      <i data-phase={k} />
                      {label}
                    </span>
                  ))}
              </div>
              <div className="scene-gantt-scale">
                <span>推演车辆</span>
                <div>
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i}>
                      {clockText(start + ((end - start) * i) / 6)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="scene-gantt-rows">
                {plan.vehicles.map((v) => (
                  <div
                    key={v.id}
                    className={
                      "scene-gantt-row " +
                      (focusedVehicle === v.id ? "selected" : "")
                    }
                  >
                    <button onClick={() => setFocusedVehicle(v.id)}>
                      {v.id}
                      <small>
                        {format(v.quantity_kg / 1000)} t · {v.trips}趟
                      </small>
                    </button>
                    <div className="scene-gantt-track">
                      <i
                        className="scene-gantt-cursor"
                        style={{
                          left: ((clock - start) / (end - start)) * 100 + "%",
                        }}
                      />
                      {v.nodes.map((n, index) => (
                        <button
                          key={index}
                          data-phase={n.kind}
                          aria-label={
                            v.id + " " + phases[n.kind] + " " + time(n.start_at)
                          }
                          title={
                            phases[n.kind] +
                            " " +
                            clockText(+new Date(n.start_at)) +
                            "—" +
                            clockText(+new Date(n.finish_at))
                          }
                          onClick={() => {
                            setClock(+new Date(n.start_at));
                            setPlaying(false);
                            setFocusedVehicle(v.id);
                          }}
                          style={{
                            left:
                              ((new Date(n.start_at) - start) / (end - start)) *
                                100 +
                              "%",
                            width:
                              ((new Date(n.finish_at) - new Date(n.start_at)) /
                                (end - start)) *
                                100 +
                              "%",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          key: "energy",
          label: "补能推演明细",
          children: (
            <>
              <div className="scene-table-toolbar">
                <Segmented
                  options={[
                    { label: "按车辆", value: "vehicles" },
                    { label: "按场站", value: "stations" },
                  ]}
                  value={energyView}
                  onChange={setEnergyView}
                />
                <span>社会车流为推演预测</span>
              </div>
              {energyView === "vehicles" ? (
                <Table
                  size="small"
                  rowKey="key"
                  scroll={{ x: 1000 }}
                  pagination={{
                    defaultPageSize: 10,
                    pageSizeOptions: [10, 20, 50],
                    showSizeChanger: true,
                  }}
                  dataSource={plan.vehicles.flatMap((v) =>
                    v.nodes
                      .filter((n) => n.kind === "charge")
                      .map((n, index) => ({
                        ...n,
                        key: v.id + index,
                        vehicle: v.id,
                        wait: v.nodes.find(
                          (x) =>
                            x.kind === "charge_wait" &&
                            x.finish_at === n.start_at,
                        ),
                      })),
                  )}
                  columns={[
                    col("推演车辆", "vehicle"),
                    col("补能站", "station_id", (id) =>
                      stationNames[id]||a.label("station_id", id),
                    ),
                    col("到站时间", "start_at", (v, r) =>
                      time(r.wait?.start_at || v),
                    ),
                    col("到站SOC", "soc_start", (v) => format(v) + "%"),
                    col(
                      "等待",
                      "wait",
                      (v) =>
                        format(
                          v
                            ? (new Date(v.finish_at) - new Date(v.start_at)) /
                                60000
                            : 0,
                        ) + " 分钟",
                    ),
                    col(
                      "补能时长",
                      "finish_at",
                      (v, r) =>
                        format((new Date(v) - new Date(r.start_at)) / 60000) +
                        " 分钟",
                    ),
                    col("离站SOC", "soc_end", (v) => format(v) + "%"),
                    col("补能费用", "cost_cents", money),
                  ]}
                />
              ) : (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 900 }}
                  dataSource={plan.station_stats}
                  columns={[
                    col("场站", "name"),
                    col("本次到达", "scenario_arrivals"),
                    col("其他平台车辆", "platform_arrivals"),
                    col("推演社会车辆", "external_arrivals"),
                    col("平均等待/分钟", "avg_wait_minutes", (v) => format(v)),
                    col("峰值等待车辆", "peak_waiting"),
                    col(
                      "峰值占用率",
                      "peak_utilization",
                      (v) => format(v) + "%",
                    ),
                  ]}
                />
              )}
            </>
          ),
        },
        {
          key: "events",
          label: "关键事件",
          children: (
            <Table
              size="small"
              rowKey={(_, index) => index}
              pagination={{
                defaultPageSize: 10,
                pageSizeOptions: [10, 20, 50],
                showSizeChanger: true,
              }}
              dataSource={plan.events}
              columns={[
                col("时间", "at", time),
                col("推演车辆", "vehicle_id"),
                col("事件", "kind"),
                col("场站", "station_id", (id) => stationNames[id]||a.label("station_id", id)),
                {
                  title: "操作",
                  key: "action",
                  render: (_, r) => (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        setClock(+new Date(r.at));
                        setPlaying(false);
                      }}
                    >
                      定位时刻
                    </Button>
                  ),
                },
              ]}
            />
          ),
        },
      ]
    : [];

  tabs.push({
    key: "cost",
    label: "成本构成",
    children: (
      <div className="scene-cost-details">
        <Table
          rowKey="name"
          pagination={false}
          columns={[col("费用项目", "name"), col("推演金额", "amount", money)]}
          dataSource={[
            {
              name: "里程及司机成本",
              amount: plan.metrics.transport_cost_cents,
            },
            { name: "补能费用", amount: plan.metrics.charging_cost_cents },
            { name: "已列项目合计", amount: plan.metrics.total_cost_cents },
          ]}
        />
        <p className="scene-muted">
          成本按参考参数测算；不代表合同报价或实际结算，未录入的费用不计入。
        </p>
      </div>
    ),
  });
  tabs.push({
    key: "risk",
    label: "风险与依据",
    children: (
      <div className="scene-risk-details">
        <p>{plan.bottleneck}</p>
        {plan.violations.map((v, i) => (
          <Alert key={i} type="warning" message={v.message} />
        ))}
        {plan.risks?.map((r) => (
          <p key={r}>{r}</p>
        ))}
        {result.assumptions?.map((x) => (
          <p key={x.key}>
            {x.label} ·{" "}
            {x.kind === "platform"
              ? "平台资料"
              : x.kind === "manual"
                ? "用户调整"
                : "参考/推演"}
            ：{x.detail}
          </p>
        ))}
        {result.limitations.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>
    ),
  });
  return <Tabs activeKey={tab} onChange={setTab} items={tabs} />;
}
