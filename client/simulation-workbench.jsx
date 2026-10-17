import React, { useState, useEffect, useMemo, useRef } from "react";
import "./simulation.css";
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
function PointInput({ value, onChange, label, onPick, disabled }) {
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
          showSearch
          filterOption={false}
          value={value?.name}
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
export default function SimulationWorkbench() {
  const a = useApp(),
    orders = a.boot.orders.filter((o) => o.status === "已确认"),
    demands = a.boot.demands.filter((d) => d.status === "已确认"),
    [sourceType, setSourceType] = useState(
      a.intentDraft?.demand_id || !orders.length ? "demands" : "orders",
    ),
    [sourceId, setSourceId] = useState(
      a.intentDraft?.order_id ||
        a.intentDraft?.demand_id ||
        orders[0]?.id ||
        demands[0]?.id,
    ),
    [source, setSource] = useState(null),
    [scene, setScene] = useState(null),
    [inputs, setInputs] = useState(null),
    [clean, setClean] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("A"),
    [leftOpen, setLeft] = useState(true),
    [rightOpen, setRight] = useState(true),
    [picking, setPicking] = useState(null),
    [clock, setClock] = useState(Date.now()),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(4),
    [tab, setTab] = useState("timeline"),
    [mappings, setMappings] = useState(null),
    [dispatchError, setDispatchError] = useState(""),
    [focusedStation, setFocusedStation] = useState(null),
    [focusedVehicle, setFocusedVehicle] = useState(null),
    [energyView, setEnergyView] = useState("vehicles");
  const sourceSequence = useRef(0),
    handoffApplied = useRef(false),
    dirty = inputs && JSON.stringify(inputs) !== clean,
    result = scene?.result,
    plan = result?.candidates.find((c) => c.id === selected),
    start = +new Date(scene?.inputs.start_at || inputs?.start_at || Date.now()),
    end = Math.max(
      start + 1,
      plan ? +new Date(plan.metrics.finish_at) : start + 1,
    ),
    mapInputs = result ? scene.inputs : inputs,
    stations = a.boot.stations.filter(
      (s) =>
        s.owner_id === source?.owner_id && inputs?.station_ids.includes(s.id),
    ),
    currentEvents =
      plan?.events
        .filter((e) => +new Date(e.at) <= clock)
        .slice(-4)
        .reverse() || [];
  useEffect(() => {
    if (!sourceId) return;
    let live = true;
    const ticket = ++sourceSequence.current;
    setBusy("load");
    setError("");
    setPlaying(false);
    Promise.all([
      request("/api/scenarios/source/" + sourceType + "/" + sourceId),
      request(
        "/api/scenarios/current?" +
          new URLSearchParams({
            source_resource: sourceType,
            source_id: sourceId,
          }),
      ),
    ])
      .then(([d, saved]) => {
        if (!live || ticket !== sourceSequence.current) return;
        const prior = saved.scenario;
        let next = prior?.inputs || d.inputs;
        const draft = a.intentDraft;
        if (!prior && !handoffApplied.current && draft?.order_id === sourceId) {
          handoffApplied.current = true;
          next = {
            ...next,
            ...(Number.isFinite(draft.soc) ? { initial_soc: draft.soc } : {}),
            ...(Number.isFinite(draft.reserve_soc)
              ? { min_soc: draft.reserve_soc }
              : {}),
            ...(draft.vehicle_ids?.length
              ? { vehicle_count: draft.vehicle_ids.length }
              : {}),
            ...(d.inputs.station_ids.includes(draft.station_id)
              ? { station_ids: [draft.station_id] }
              : {}),
          };
        }
        setSource(d.source);
        setScene(prior || null);
        setInputs(next);
        setClean(JSON.stringify(prior?.inputs || d.inputs));
        setSelected(prior?.selected || prior?.result?.recommended_id || "A");
        setClock(+new Date(next.start_at));
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy("");
      });
    return () => {
      live = false;
    };
  }, [sourceType, sourceId]);
  useEffect(() => {
    const remove = a.registerLeaveGuard?.(
      dirty
        ? (next) =>
            a.confirm("离开交能推演", "当前条件尚未保存，是否放弃修改？", next)
        : null,
    );
    const before = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      remove?.();
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, a.registerLeaveGuard]);
  useEffect(() => {
    if (!playing || !plan) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        elapsed = (now - last) * speed * 60;
      last = now;
      setClock((t) => {
        const next = Math.min(end, t + elapsed);
        if (next >= end) setPlaying(false);
        return next;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [playing, speed, plan, end]);
  useEffect(() => {
    if (plan) {
      setPlaying(false);
      setClock(start);
      setFocusedVehicle(null);
    }
  }, [plan?.id, result?.generated_at]);
  const change = (k, v) => {
    setInputs((s) => ({ ...s, [k]: v }));
    setPlaying(false);
  };
  const receive = (s) => {
    setScene(s);
    setInputs(s.inputs);
    setClean(JSON.stringify(s.inputs));
    setSelected(
      s.selected ||
        s.result?.ai?.recommended_id ||
        s.result?.recommended_id ||
        "A",
    );
  };
  const action = async (fn, label) => {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };
  async function save() {
    const r = await a.execute("scenario.save", scene?.id || null, {
      source_resource: sourceType,
      source_id: sourceId,
      inputs,
      expected_version: scene?.version,
    });
    receive(r.scenario);
    return r.scenario;
  }
  async function run() {
    await action(async () => {
      let s = scene;
      if (!s || dirty) s = await save();
      const r = await a.execute("scenario.run", s.id, {
        expected_version: s.version,
      });
      receive(r.scenario);
    }, "run");
  }
  async function confirm() {
    await action(async () => {
      const r = await a.execute("scenario.confirm", scene.id, {
        expected_version: scene.version,
        candidate_id: selected,
      });
      receive(r.scenario);
    }, "confirm");
  }
  async function analyze() {
    await action(async () => {
      const r = await a.execute("scenario.analyze", scene.id, {
        expected_version: scene.version,
      });
      receive(r.scenario);
    }, "ai");
  }
  const selectSource = (type, id) => {
    const changeSource = () => {
      setSourceType(type);
      setSourceId(id);
      setFocusedStation(null);
      setFocusedVehicle(null);
    };
    if (dirty)
      a.confirm("切换推演来源", "未保存的条件将被放弃。", changeSource);
    else changeSource();
  };
  const eligibleFor = (virtual) =>
    a.boot.vehicles.filter((v) => {
      const driver = a.boot.drivers.find((d) => d.id === v.driver_id);
      const conflict = a.boot.tasks.some(
        (t) =>
          [
            "待派发",
            "待接收",
            "已接收",
            "执行中",
            "待核验",
            "退回补充",
          ].includes(t.status) &&
          (t.vehicle_id === v.id || t.driver_id === v.driver_id) &&
          t.start_at < virtual.finish_at &&
          t.finish_at > virtual.start_at,
      );
      const compatible = virtual.nodes
        .filter((n) => n.kind === "charge")
        .every((n) => {
          const s = a.boot.stations.find((s) => s.id === n.station_id);
          return (
            s &&
            (!s.compatibility ||
              !v.compatibility ||
              s.compatibility === v.compatibility) &&
            (s.mode !== "换电" ||
              !s.supported_capacity_kwh ||
              s.supported_capacity_kwh.includes(v.capacity_kwh))
          );
        });
      return (
        v.owner_id === source.owner_id &&
        v.status === "可用" &&
        driver?.status === "可用" &&
        driver.owner_id === source.owner_id &&
        v.capacity_kwh >= inputs.capacity &&
        v.payload_kg >= inputs.payload * 1000 &&
        v.soc >= inputs.initial_soc &&
        !conflict &&
        compatible
      );
    });
  const openDispatch = () => {
    const used = new Set();
    setMappings(
      plan.vehicles.map((v) => {
        const actual = eligibleFor(v).find((c) => !used.has(c.id));
        if (actual) used.add(actual.id);
        return { sim_vehicle_id: v.id, vehicle_id: actual?.id };
      }),
    );
    setDispatchError("");
  };
  async function generate() {
    setBusy("dispatch");
    setDispatchError("");
    try {
      const r = await a.execute("scenario.dispatch", scene.id, {
        expected_version: scene.version,
        mappings,
      });
      receive(r.scenario);
      setMappings(null);
    } catch (e) {
      setDispatchError(e.message);
    } finally {
      setBusy("");
    }
  }
  const reset = () =>
    a.confirm(
      "新建推演场景",
      "保留已保存场景，载入当前来源默认条件。",
      async () => {
        const d = await request(
          "/api/scenarios/source/" + sourceType + "/" + sourceId,
        );
        setScene(null);
        setInputs(d.inputs);
        setClean("");
        setClock(+new Date(d.inputs.start_at));
        setPlaying(false);
      },
    );
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
                      a.label("station_id", id),
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
          key: "comparison",
          label: "方案对比分析",
          children: (
            <Table
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 1180 }}
              dataSource={result.candidates.map((c) => ({
                id: c.id,
                name: c.name,
                feasible: c.feasible,
                ...c.metrics,
              }))}
              columns={[
                col("方案", "name"),
                col("约束", "feasible", (v) => (
                  <Pill>{v ? "条件可行" : "不满足"}</Pill>
                )),
                col("时长/小时", "duration_minutes", (v) => format(v / 60)),
                col("估算总成本", "total_cost_cents", money),
                col("运输成本", "transport_cost_cents", money),
                col("补能成本", "charging_cost_cents", money),
                col("补能次数", "charge_count"),
                col("总排队/分钟", "queue_minutes", (v) => format(v)),
                col("装载排队", "loading_wait", (v) => format(v)),
                col("卸载排队", "unloading_wait", (v) => format(v)),
                col("补能排队", "charging_wait", (v) => format(v)),
                col("参与车辆", "vehicle_count"),
                col("准时率", "ontime_rate", (v) => format(v) + "%"),
                col(
                  "资源利用率",
                  "resource_utilization",
                  (v) => format(v) + "%",
                ),
              ]}
            />
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
                col("场站", "station_id", (id) => a.label("station_id", id)),
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
  if (!inputs)
    return (
      <div className="scenario-workbench">
        <Heading title="交能推演" />
        <div className="scene-toolbar scene-source">
          <Select
            aria-label="推演来源类型"
            value={sourceType}
            onChange={(v) =>
              selectSource(v, (v === "orders" ? orders : demands)[0]?.id)
            }
            options={[
              { value: "orders", label: "运输订单" },
              { value: "demands", label: "运输需求" },
            ]}
          />
          <Select
            aria-label="推演来源"
            value={sourceId}
            onChange={(v) => selectSource(sourceType, v)}
            options={(sourceType === "orders" ? orders : demands).map((s) => ({
              value: s.id,
              label: s.code + " · " + s.name,
            }))}
          />
        </div>
        {error ? (
          <Alert type="error" message={error} />
        ) : busy ? (
          <div className="state-page">正在载入推演条件…</div>
        ) : (
          <Empty description="暂无可推演的已确认需求或订单">
            <Button onClick={() => a.go("demands")}>查看运输需求</Button>
          </Empty>
        )}
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
          {num("vehicle_count", "参与车辆数", 1, 60)}
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
              options={a.boot.stations
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
          优化目标与高级约束
        </>
      ),
      children: (
        <div className="scene-form-grid">
          <label className="scene-field full">
            <span>优化目标</span>
            <Select
              aria-label="优化目标"
              value={inputs.objective}
              options={objectiveOptions}
              disabled={!!busy || !!scene?.generated_task_ids?.length}
              onChange={(v) => change("objective", v)}
            />
          </label>
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
  function showEvidence() {
    a.panel(
      "推演模型与数据依据",
      <div className="stack">
        <Pill>条件测算 · 推演</Pill>
        <p>
          路线使用高德道路几何；装卸、车辆及补能资源按当前配置计算，社会流量为推演到达。
        </p>
        <p>成本包含配置的里程成本、司机小时成本及补能费用，非实际结算成本。</p>
        <p>
          通用驾车道路未核验货车限高、限重与矿内禁行。实际派车前须核实；地图回放不是车辆实测轨迹。
        </p>
        <p>
          外部社会流量与平台其他任务、本次推演车辆共享工位资源。硬约束由程序验证，AI只提供分析建议。
        </p>
        {result?.limitations.map((x) => (
          <p key={x}>{x}</p>
        ))}
      </div>,
    );
  }
  const focused =
      focusedVehicle && plan?.vehicles.find((v) => v.id === focusedVehicle),
    focusedState =
      focused && positionAt(focused, clock, result.routes, mapInputs, stations),
    focusedStats = plan?.station_stats.find((s) => s.id === focusedStation);
  return (
    <div className="scenario-workbench">
      <Heading title="交能推演" />
      <div className="scene-toolbar">
        <div className="scene-source">
          <Select
            aria-label="推演来源类型"
            value={sourceType}
            onChange={(v) =>
              selectSource(v, (v === "orders" ? orders : demands)[0]?.id)
            }
            options={[
              { value: "orders", label: "运输订单" },
              { value: "demands", label: "运输需求" },
            ]}
          />
          <Select
            showSearch
            optionFilterProp="label"
            aria-label="推演来源"
            value={sourceId}
            onChange={(v) => selectSource(sourceType, v)}
            options={(sourceType === "orders" ? orders : demands).map((s) => ({
              value: s.id,
              label: s.code + " · " + s.name,
            }))}
          />
          <Pill>{dirty ? "条件已变更" : scene?.status || "待推演"}</Pill>
          {scene && (
            <small className="scene-context-meta">
              条件 v{scene.constraint_version || 1}
              {result ? " · " + time(result.generated_at) : ""}
            </small>
          )}
        </div>
        <div className="scene-top-actions">
          <Button size="small" icon={Plus} onClick={reset} disabled={!!busy}>
            新建推演
          </Button>
          <Button
            size="small"
            icon={Save}
            onClick={() => action(save, "save")}
            disabled={
              !!busy ||
              !!scene?.generated_task_ids?.length ||
              !a.can("simulation.run")
            }
          >
            保存条件
          </Button>
          <Button
            size="small"
            type="primary"
            icon={Play}
            loading={busy === "run"}
            disabled={
              !!busy ||
              !!scene?.generated_task_ids?.length ||
              !a.can("simulation.run")
            }
            onClick={run}
          >
            {result ? "重新推演" : "开始推演"}
          </Button>
          <Button
            size="small"
            disabled={!result || !!busy}
            onClick={() => {
              setTab("comparison");
              document
                .querySelector(".scene-results")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            方案对比
          </Button>
          <Button
            size="small"
            disabled={
              !plan?.feasible ||
              dirty ||
              !!busy ||
              scene?.generated_task_ids?.length ||
              !a.can("simulation.confirm")
            }
            onClick={confirm}
          >
            {scene?.confirmed && scene.selected === selected
              ? "已确认方案"
              : "确认方案"}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={Truck}
            disabled={
              !scene?.confirmed ||
              scene.selected !== selected ||
              dirty ||
              !!busy ||
              scene.generated_task_ids?.length ||
              !a.can("simulation.confirm")
            }
            onClick={openDispatch}
          >
            {scene?.generated_task_ids?.length ? "已生成任务" : "生成派单任务"}
          </Button>
        </div>
      </div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError("")}
        />
      )}
      {dirty && result && (
        <div className="scene-dirty" role="status">
          条件已变更，请重新推演后确认方案。
        </div>
      )}
      <section
        className={
          "scene-map-stage " +
          (!leftOpen ? "left-closed " : "") +
          (!rightOpen ? "right-closed" : "")
        }
      >
        <ScenarioMap
          inputs={mapInputs}
          plan={plan}
          routes={result?.routes}
          stations={stations}
          clock={clock}
          picking={picking}
          onPick={(p) => {
            change(picking, p);
            setPicking(null);
          }}
          onVehicle={(id) => {
            setFocusedVehicle(id);
            setFocusedStation(null);
            setRight(true);
          }}
          onStation={(id) => {
            setFocusedStation(id);
            setFocusedVehicle(null);
            setRight(true);
          }}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
        />
        <aside
          className={
            "scene-floating scene-config " + (!leftOpen ? "collapsed" : "")
          }
          aria-label="推演条件配置"
        >
          <header>
            <strong>
              <SlidersHorizontal size={16} />
              推演条件
            </strong>
            <Button
              type="text"
              size="small"
              icon={PanelLeftClose}
              aria-label="收起条件面板"
              onClick={() => setLeft(false)}
            />
          </header>
          <div className="scene-panel-scroll">
            <Collapse ghost defaultActiveKey={["handling"]} items={groups} />
          </div>
        </aside>
        {!leftOpen && (
          <Button
            className="scene-open-left"
            size="small"
            icon={SlidersHorizontal}
            onClick={() => setLeft(true)}
          >
            条件配置
          </Button>
        )}
        <aside
          className={
            "scene-floating scene-summary " + (!rightOpen ? "collapsed" : "")
          }
          aria-label="推演摘要"
        >
          <header>
            <strong>推演摘要</strong>
            <Button
              type="text"
              size="small"
              icon={PanelRightClose}
              aria-label="收起摘要面板"
              onClick={() => setRight(false)}
            />
          </header>
          <div className="scene-panel-scroll">
            {plan ? (
              <>
                <div className="scene-plan-options">
                  {result.candidates.map((c) => (
                    <button
                      key={c.id}
                      aria-pressed={selected === c.id}
                      className={selected === c.id ? "active" : ""}
                      onClick={() => {
                        setSelected(c.id);
                        setFocusedVehicle(null);
                        setFocusedStation(null);
                      }}
                    >
                      <span>{c.name}</span>
                      <strong>{money(c.metrics.total_cost_cents)}</strong>
                      <small>
                        {format(c.metrics.duration_minutes / 60)}小时
                      </small>
                      <i className={c.feasible ? "ok" : "bad"}>
                        {c.feasible ? "可行" : "受限"}
                      </i>
                    </button>
                  ))}
                </div>
                <div className="scene-metrics">
                  {[
                    ["预计完成", time(plan.metrics.finish_at)],
                    [
                      "总运输时长",
                      format(plan.metrics.duration_minutes / 60) + " h",
                    ],
                    ["估算总成本", money(plan.metrics.total_cost_cents)],
                    ["补能成本", money(plan.metrics.charging_cost_cents)],
                    ["补能次数", plan.metrics.charge_count + " 次"],
                    ["排队总时长", format(plan.metrics.queue_minutes) + " min"],
                    ["参与车辆", plan.metrics.vehicle_count + " 辆"],
                    ["准时率", format(plan.metrics.ontime_rate) + "%"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="scene-summary-section">
                  <h3>
                    <Activity size={14} />
                    资源瓶颈
                  </h3>
                  <strong>{plan.bottleneck}</strong>
                  <div className="scene-mini-stats">
                    <span>
                      装载峰值 <b>{plan.metrics.load_peak}</b>
                    </span>
                    <span>
                      卸载峰值 <b>{plan.metrics.unload_peak}</b>
                    </span>
                    <span>
                      补能峰值 <b>{plan.metrics.station_peak}</b>
                    </span>
                  </div>
                </div>
                <div className="scene-summary-section">
                  <h3>
                    <CheckCircle2 size={14} />
                    约束校验{" "}
                    <Pill>
                      {plan.feasible ? "满足参考约束" : "存在约束冲突"}
                    </Pill>
                  </h3>
                  {plan.violations.slice(0, 5).map((v, index) => (
                    <p className="scene-risk" key={index}>
                      {v.message}
                      {v.vehicle_id ? " · " + v.vehicle_id : ""}
                    </p>
                  ))}
                  {plan.feasible && (
                    <p>软约束满足 {plan.metrics.soft_satisfied_ratio}%</p>
                  )}
                  {plan.feasible &&
                    plan.risks?.map((r) => (
                      <p className="scene-risk" key={r}>
                        {r}
                      </p>
                    ))}
                  {!plan.feasible &&
                    plan.suggestions.map((s) => <p key={s}>{s}</p>)}
                </div>
                {focused && (
                  <div className="scene-summary-section scene-focus">
                    <h3>
                      {focused.id}
                      <button onClick={() => setFocusedVehicle(null)}>×</button>
                    </h3>
                    <p>
                      {focusedState.label} · SOC {format(focusedState.soc)}%
                    </p>
                    <p>已行驶 {format(focusedState.distance_km)} km</p>
                    <p>
                      运量 {format(focused.quantity_kg / 1000)} t ·{" "}
                      {focused.trips}趟
                    </p>
                    <p>预计完成 {time(focused.finish_at)}</p>
                  </div>
                )}
                {focusedStats && (
                  <div className="scene-summary-section scene-focus">
                    <h3>
                      {focusedStats.name}
                      <button onClick={() => setFocusedStation(null)}>×</button>
                    </h3>
                    {(() => {
                      const state = stationAt(focusedStats, clock);
                      return (
                        <>
                          <p>
                            工位 {focusedStats.slots} · 当前占用{" "}
                            {state.occupied} · 排队 {state.waiting}
                          </p>
                          <p>
                            本次 {state.own} · 其他平台 {state.platform} ·
                            推演社会 {state.external}
                          </p>
                          <p>
                            未来{inputs.forecast_hours}小时社会到达{" "}
                            {focusedStats.forecast_external_next_window}辆
                          </p>
                          <p>
                            平均等待 {focusedStats.avg_wait_minutes}分钟 · 最长{" "}
                            {focusedStats.max_wait_minutes}分钟
                          </p>
                        </>
                      );
                    })()}
                  </div>
                )}
                <div className="scene-summary-section scene-ai">
                  <h3>
                    <Bot size={15} />
                    AI分析{" "}
                    <Button
                      size="small"
                      type="text"
                      disabled={dirty || !!busy || !a.can("ai.use")}
                      loading={busy === "ai"}
                      onClick={analyze}
                    >
                      重新分析
                    </Button>
                  </h3>
                  {result.ai?.status === "ready" ? (
                    <>
                      <p>{result.ai.summary}</p>
                      {result.ai.reasons?.map((s) => (
                        <p key={s} className="scene-muted">
                          {s}
                        </p>
                      ))}
                      {result.ai.suggestions?.map((s, index) => (
                        <button
                          className="scene-ai-suggestion"
                          key={index}
                          disabled={
                            !!busy || !!scene?.generated_task_ids?.length
                          }
                          onClick={() => {
                            setInputs((v) => ({
                              ...v,
                              ...s.patch,
                              ...(s.patch.departure_interval !== undefined
                                ? { departure_strategy: "interval" }
                                : {}),
                            }));
                            setPlaying(false);
                          }}
                        >
                          {s.label}
                          <ArrowRight size={13} />
                        </button>
                      ))}
                      <small>{result.ai.model} · AI建议</small>
                    </>
                  ) : (
                    <p className="scene-muted">
                      {result.ai?.message || "尚未分析"}
                    </p>
                  )}
                </div>
                <div className="scene-summary-section">
                  <h3>动态事件</h3>
                  {currentEvents.length ? (
                    currentEvents.map((e, index) => (
                      <button
                        key={index}
                        className="scene-event"
                        onClick={() => {
                          setClock(+new Date(e.at));
                          setPlaying(false);
                        }}
                      >
                        <time>{clockText(+new Date(e.at))}</time>
                        <span>
                          {e.vehicle_id} {e.kind}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="scene-muted">播放推演查看过程</p>
                  )}
                </div>
              </>
            ) : (
              <div className="scene-summary-empty">
                <Route size={34} />
                <strong>等待推演</strong>
                <p>配置条件后生成可比选方案</p>
              </div>
            )}
          </div>
        </aside>
        {!rightOpen && (
          <Button
            className="scene-open-right"
            size="small"
            onClick={() => setRight(true)}
          >
            推演摘要
          </Button>
        )}
        <div className="scene-playback">
          <div className="scene-playback-row">
            <Button
              aria-label={playing ? "暂停推演" : "播放推演"}
              icon={playing ? Pause : Play}
              type="primary"
              size="small"
              disabled={!plan}
              onClick={() => {
                if (clock >= end) setClock(start);
                setPlaying((v) => !v);
              }}
            />
            <Button
              aria-label="上一关键时刻"
              icon={SkipBack}
              type="text"
              size="small"
              disabled={!plan}
              onClick={() => {
                setPlaying(false);
                setClock(
                  Math.max(
                    start,
                    ...plan.events
                      .filter((e) => +new Date(e.at) < clock - 1000)
                      .map((e) => +new Date(e.at)),
                  ),
                );
              }}
            />
            <Button
              aria-label="下一关键时刻"
              icon={SkipForward}
              type="text"
              size="small"
              disabled={!plan}
              onClick={() => {
                setPlaying(false);
                setClock(
                  Math.min(
                    end,
                    ...plan.events
                      .filter((e) => +new Date(e.at) > clock + 1000)
                      .map((e) => +new Date(e.at)),
                  ),
                );
              }}
            />
            <strong>{plan ? clockText(clock) : "--:--"}</strong>
            <Select
              aria-label="推演倍速"
              size="small"
              value={speed}
              options={[1, 2, 4, 8, 10].map((v) => ({
                value: v,
                label: v + "×",
              }))}
              onChange={setSpeed}
            />
            <span className="scene-playback-scale">1× = 1推演分钟/秒</span>
          </div>
          <Slider
            aria-label="推演时间进度"
            min={0}
            max={1000}
            disabled={!plan}
            value={Math.round(((clock - start) / (end - start)) * 1000)}
            tooltip={{
              formatter: (v) => clockText(start + ((end - start) * v) / 1000),
            }}
            onChange={(v) => {
              setClock(start + ((end - start) * v) / 1000);
              setPlaying(false);
            }}
          />
          <div className="scene-playback-range">
            <span>{plan ? clockText(start) : "开始"}</span>
            <span>{plan ? clockText(end) : "完成"}</span>
          </div>
        </div>
        <div className="scene-model-label">
          <span>条件测算 · 社会车流推演</span>
          <button onClick={showEvidence}>
            数据依据 <Info size={12} />
          </button>
        </div>
        {busy === "run" && (
          <div className="scene-running" role="status">
            <span className="scene-spinner" />
            <strong>正在联合推演</strong>
            <p>道路、装卸、补能排队与AI分析</p>
          </div>
        )}
      </section>
      <section className="scene-results">
        <div className="scene-results-title">
          <strong>过程与方案明细</strong>
          <span>
            {plan
              ? plan.vehicles.length +
                "辆推演车 · " +
                plan.events.length +
                "个关键事件"
              : "尚无推演结果"}
          </span>
          {scene?.generated_task_ids?.length > 0 && (
            <Button type="link" size="small" onClick={() => a.go("tasks")}>
              查看待派发任务 <ChevronRight size={13} />
            </Button>
          )}
        </div>
        {plan ? (
          <Tabs activeKey={tab} onChange={setTab} items={tabs} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="完成推演后查看时间轴与方案明细"
          />
        )}
      </section>
      <Drawer
        title="核对并生成派单任务"
        open={!!mappings}
        width={760}
        destroyOnHidden
        onClose={() => setMappings(null)}
        footer={
          <div className="scene-dispatch-footer">
            <span>生成后由运输任务页手动派发</span>
            <Button
              onClick={() => setMappings(null)}
              disabled={busy === "dispatch"}
            >
              取消
            </Button>
            <Button
              type="primary"
              loading={busy === "dispatch"}
              disabled={mappings?.some((m) => !m.vehicle_id)}
              onClick={generate}
            >
              确认生成待派发任务
            </Button>
          </div>
        }
      >
        {mappings && (
          <>
            {dispatchError && (
              <Alert type="error" showIcon message={dispatchError} />
            )}
            <div className="scene-dispatch-summary">
              <Pill>{plan.name}</Pill>
              <strong>
                {format(inputs.quantity)}吨 · {plan.vehicles.length}辆车
              </strong>
              <p>
                {sourceType === "demands"
                  ? "本次将创建1笔运输订单和对应待派发任务。"
                  : "本次将为当前订单创建待派发任务。"}
              </p>
            </div>
            <Table
              rowKey="sim_vehicle_id"
              pagination={false}
              size="small"
              dataSource={mappings}
              columns={[
                col("推演车辆", "sim_vehicle_id"),
                {
                  title: "实际车辆 / 绑定司机",
                  key: "vehicle",
                  render: (_, row) => (
                    <Select
                      aria-label={row.sim_vehicle_id + "实际车辆"}
                      style={{ width: "100%" }}
                      value={row.vehicle_id}
                      onChange={(v) =>
                        setMappings((ms) =>
                          ms.map((m) =>
                            m.sim_vehicle_id === row.sim_vehicle_id
                              ? { ...m, vehicle_id: v }
                              : m,
                          ),
                        )
                      }
                      options={a.boot.vehicles
                        .filter(
                          (v) =>
                            v.owner_id === source.owner_id &&
                            v.status === "可用" &&
                            v.driver_id &&
                            eligibleFor(
                              plan.vehicles.find(
                                (x) => x.id === row.sim_vehicle_id,
                              ),
                            ).some((e) => e.id === v.id),
                        )
                        .map((v) => ({
                          value: v.id,
                          label:
                            v.code + " · " + a.label("driver_id", v.driver_id),
                          disabled: mappings.some(
                            (m) =>
                              m.sim_vehicle_id !== row.sim_vehicle_id &&
                              m.vehicle_id === v.id,
                          ),
                        }))}
                    />
                  ),
                },
                col(
                  "运量",
                  "sim_vehicle_id",
                  (id) =>
                    format(
                      plan.vehicles.find((v) => v.id === id).quantity_kg / 1000,
                    ) + " t",
                ),
                col("时间窗", "sim_vehicle_id", (id) => {
                  const v = plan.vehicles.find((v) => v.id === id);
                  return time(v.start_at) + "—" + time(v.finish_at);
                }),
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}
