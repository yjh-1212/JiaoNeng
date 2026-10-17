import React, { useState, useEffect, useRef } from "react";
import { Button } from "@lobehub/ui";
import {
  Select,
  InputNumber,
  Segmented,
  Table,
  Drawer,
  Alert,
  Empty,
  Slider,
} from "antd";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  SlidersHorizontal,
  ArrowRight,
  Bot,
  Info,
  Truck,
  Route,
} from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Pill, time, format, money, col } from "./ui";
import {
  PointInput,
  ScenarioSettings,
  ScenarioDetails,
} from "./scenario-panels";
import ScenarioMap from "./scenario-map";
import FloatingPlans from "./floating-plans";
import { AgentContextSync } from "./agent-launcher";
import { SafetyReplanContext } from "./safety-panels";
import { positionAt, stationAt } from "./simulation-playback";
import {qingyangPresets,corridorFacilities} from '../shared/qingyang-planning';
import ScenarioRoutePlanner from './scenario-route-planner';
import "./simulation.css";
import "./simulation-goals.css";
import "./simulation-floating.css";
import './qingyang-simulation.css';

const goals = [
  { value: "existing", label: "用现有车辆运完" },
  { value: "deadline", label: "指定时间前运完" },
  { value: "economy", label: "按期完成且更省钱" },
];
const cargoTypes = [
  "煤炭",
  "矿石",
  "砂石骨料",
  "钢材",
  "水泥",
  "熟料",
  "粉煤灰",
  "焦炭",
  "粮食",
  "其他",
];
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
const normalize = (i) => ({
  ...i,
  ...(i.goal === "existing" && Number.isFinite(+new Date(i.start_at))
    ? { deadline: new Date(+new Date(i.start_at) + 7 * 86400000).toISOString() }
    : {}),
});
const labels = {
  goal: "运输目标",
  resource_mode: "运力范围",
  vehicle_count: "参与车辆",
  vehicle_limit: "运力上限",
  deadline: "最晚完成",
  start_at: "开始时间",
  loading_slots: "装载车位",
  unloading_slots: "卸载车位",
  loading_minutes: "装载分钟",
  unloading_minutes: "卸载分钟",
  departure_interval: "发车间隔",
  departure_strategy: "发车策略",
  target_soc: "目标SOC",
  max_wait: "补能等待上限",
  max_driver_hours: "司机工时上限",
  include_external: "社会流量",
  allow_cross_station: "跨站补能",
};
const valueText = (key, value) =>
  key === "goal"
    ? goals.find((x) => x.value === value)?.label
    : value === "actual"
      ? "现有可用运力"
      : value === "reference"
        ? "参考车型"
        : key.endsWith("_at") || key === "deadline"
          ? time(value)
          : typeof value === "boolean"
            ? value
              ? "开启"
              : "关闭"
            : String(value ?? "—");
const entrySource = (organizations, userId) => {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  if (params.get("order_id"))
    return { type: "orders", id: params.get("order_id") };
  if (params.get("demand_id"))
    return { type: "demands", id: params.get("demand_id") };
  const rememberedOwner = sessionStorage.getItem("simulation-owner-" + userId);
  return {
    type: "manual",
    id:
      organizations.find((o) => o.id === rememberedOwner)?.id ||
      organizations[0]?.id,
  };
};
const manualInputs = (inputs) => ({
  ...inputs,
  quantity: null,
  cargo: "",
  origin: { name: "", lng: null, lat: null },
  destination: { name: "", lng: null, lat: null },
});
export default function GoalSimulation() {
  const a = useApp(),
    entry = entrySource(a.boot.organizations, a.boot.user.id),
    orders = a.boot.orders.filter((o) => o.status === "已确认"),
    demands = a.boot.demands.filter((d) => d.status === "已确认"),
    [sourceType, setSourceType] = useState(entry.type),
    [sourceId, setSourceId] = useState(entry.id),
    [loadRevision, setLoadRevision] = useState(0),
    [source, setSource] = useState(null),
    [scene, setScene] = useState(null),
    [inputs, setInputs] = useState(null),
    [clean, setClean] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(null),
    [expanded, setExpanded] = useState(true),
    [settings, setSettings] = useState(false),
    [aiOpen, setAiOpen] = useState(false),
    [plansOpen, setPlansOpen] = useState(true),
    [assumptions, setAssumptions] = useState([]),
    [fleetDefaults, setFleetDefaults] = useState(null),
    [planningStations,setPlanningStations] = useState([]),
    [planningSources,setPlanningSources] = useState([]),
    [fleet, setFleet] = useState({ count: null, loading: false, error: "" }),
    [picking, setPicking] = useState(null),
    [clock, setClock] = useState(Date.now()),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(4),
    [tab, setTab] = useState("timeline"),
    [mappings, setMappings] = useState(null),
    [dispatchError, setDispatchError] = useState(""),
    [bindingMode, setBindingMode] = useState("create"),
    [bindingId, setBindingId] = useState(null),
    [focusedVehicle, setFocusedVehicle] = useState(null),
    [focusedStation, setFocusedStation] = useState(null);
  const sourceSequence = useRef(0),
    freshSource = useRef(false),
    agentEntryKey = useRef(location.hash),
    handoff = useRef(false),
    dirty = !!inputs && JSON.stringify(inputs) !== clean,
    result = scene?.result,
    plan = result?.candidates.find((c) => c.id === selected),
    locked = !!scene?.generated_task_ids?.length,
    planInputs = result
      ? { ...scene.inputs, ...plan?.input_overrides }
      : inputs,
    start = +new Date(planInputs?.start_at || Date.now()),
    end = Math.max(
      start + 1,
      plan ? +new Date(plan.metrics.finish_at) : start + 1,
    ),
    stationCatalog = [...a.boot.stations.filter(s=>s.owner_id===source?.owner_id&&s.status==='运营中'),...planningStations],
    routeStations = corridorFacilities(inputs?.origin,inputs?.destination,stationCatalog).filter(s=>!s.planning_only||!stationCatalog.some(real=>!real.planning_only&&Math.hypot(real.longitude-s.longitude,real.latitude-s.latitude)<.02)),
    stations = stationCatalog.filter(s=>planInputs?.station_ids.includes(s.id)),
    focused = plan?.vehicles.find((v) => v.id === focusedVehicle),
    focusedState =
      focused &&
      positionAt(focused, clock, result.routes, planInputs, stations),
    focusedStats = plan?.station_stats.find((s) => s.id === focusedStation);
  useEffect(() => {
    const sync = () => {
      if (location.hash.slice(1).split("?")[0] !== "simulation") return;
      const next = entrySource(a.boot.organizations, a.boot.user.id);
      const agentKey = new URLSearchParams(location.hash.split("?")[1] || "").get("agent_conversation");
      if (agentKey && location.hash !== agentEntryKey.current) {
        freshSource.current = true;
        setLoadRevision((n) => n + 1);
      }
      agentEntryKey.current = location.hash;
      setSourceType(next.type);
      setSourceId(next.id);
    };
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, [a.boot.organizations, a.boot.user.id]);
  useEffect(() => {
    if (!sourceId) return;
    let live = true;
    const ticket = ++sourceSequence.current;
    const fresh =
      freshSource.current ||
      new URLSearchParams(location.hash.split("?")[1] || "").get("new") === "1";
    freshSource.current = false;
    setBusy("load");
    setError("");
    setPlaying(false);
    setScene(null);
    setInputs(null);
    Promise.all([
      request(
        `/api/scenarios/source/${sourceType}/${encodeURIComponent(sourceId)}`,
      ),
      request(
        "/api/scenarios/current?" +
          new URLSearchParams({
            source_resource: sourceType,
            source_id: sourceId,
          }),
      ),
    ])
      .then(async ([d, saved]) => {
        if (!live || ticket !== sourceSequence.current) return;
        const planningId = new URLSearchParams(
          location.hash.split("?")[1] || "",
        ).get("planning_id");
        const planningEntry = planningId
          ? await request(
              "/api/planner/handoff/" + encodeURIComponent(planningId),
            )
          : null;
        const agentId = new URLSearchParams(
          location.hash.split("?")[1] || "",
        ).get("agent_conversation");
        const agentEntry = agentId
          ? await request(
              "/api/agents/conversations/" +
                encodeURIComponent(agentId) +
                "/handoff",
            )
          : null;
        if (!live || ticket !== sourceSequence.current) return;
        const prior =
          fresh || planningEntry || agentEntry ? null : saved.scenario;
        let next = prior?.inputs || {
          ...d.inputs,
          ...(sourceType !== "manual" ? d.fleet_defaults : {}),
          goal: "deadline",
          resource_mode: sourceType === "manual" ? "reference" : "actual",
          vehicle_limit: 10,
        };
        if (!prior && sourceType === "manual") next = manualInputs(next);
        if (agentEntry) {
          if (agentEntry.owner_id !== d.source.owner_id)
            throw new Error("智能体对话与推演主体不一致，请返回中心重新带入");
          const draft = agentEntry.draft;
          if (agentEntry.scene_inputs)
            next = { ...next, ...agentEntry.scene_inputs };
          next = {
            ...next,
            ...Object.fromEntries(
              [
                "name",
                "cargo",
                "quantity",
                "goal",
                "vehicle_count",
                "resource_mode",
                "payload",
                "capacity",
                "consumption",
              ]
                .filter((k) => draft[k] != null)
                .map((k) => [k, draft[k]]),
            ),
            ...(draft.start_at ? { start_at: draft.start_at } : {}),
            ...(draft.deadline || draft.finish_at
              ? { deadline: draft.deadline || draft.finish_at }
              : {}),
            agent_reference: agentId,
          };
          for (const key of ["origin", "destination"])
            if (draft[key]) {
              const value = draft[key];
              next[key] = {
                ...value,
                ...(value.lng == null && next[key]?.name === value.name
                  ? { lng: next[key].lng, lat: next[key].lat }
                  : {}),
              };
            }
        }
        if (planningEntry && sourceType === "manual") {
          if (planningEntry.owner_id !== sourceId)
            throw new Error(
              "规划主体与当前推演主体不一致，请从规划页面重新带入",
            );
          const c = planningEntry.conditions,
            l = planningEntry.corridor;
          next = {
            ...next,
            name: planningEntry.name + " · 单日推演",
            quantity: l?.daily_quantity || c.daily_quantity,
            cargo: "煤炭",
            payload: c.payload_tonnes,
            capacity: c.battery_kwh,
            consumption: c.energy_per_km,
            empty_consumption: c.energy_per_km,
            speed: c.loaded_speed,
            empty_speed: c.empty_speed,
            loading_minutes: c.loading_minutes,
            unloading_minutes: c.unloading_minutes,
            max_driver_hours: c.hours,
            vehicle_count: planningEntry.vehicles,
            planning_reference: {
              project_id: planningEntry.project_id,
              solution_id: planningId,
              sequence: planningEntry.sequence,
            },
            ...(l?.origin_coords && l?.destination_coords
              ? {
                  origin: {
                    name: l.origin,
                    lng: l.origin_coords[0],
                    lat: l.origin_coords[1],
                  },
                  destination: {
                    name: l.destination,
                    lng: l.destination_coords[0],
                    lat: l.destination_coords[1],
                  },
                }
              : {}),
          };
        }
        if (
          !prior &&
          !handoff.current &&
          a.intentDraft?.order_id === sourceId
        ) {
          handoff.current = true;
          const draft = a.intentDraft;
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
        const migrated = prior && !next.goal;
        if (migrated)
          next = {
            ...next,
            goal: "existing",
            resource_mode: "reference",
            vehicle_limit: Math.max(10, next.vehicle_count),
          };
        setSource(d.source);
        setScene(prior || null);
        setInputs(next);
        setClean(JSON.stringify(migrated ? prior.inputs : next));
        setAssumptions(prior?.assumptions || d.assumptions || []);
        setFleetDefaults(d.fleet_defaults);
        setPlanningStations(d.planning_stations||[]);
        setPlanningSources(d.planning_sources||[]);
        setSelected(
          prior?.selected ||
            prior?.result?.recommended_id ||
            prior?.result?.candidates[0]?.id ||
            null,
        );
        setExpanded(true);
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
  }, [sourceType, sourceId, loadRevision]);
  useEffect(() => {
    if (!inputs?.origin?.lng || !inputs?.destination?.lng) return;
    let live = true;
    const timer = setTimeout(() => {
      setFleet((f) => ({ ...f, loading: true, error: "" }));
      request("/api/scenarios/fleet", {
        method: "POST",
        body: {
          source_resource: sourceType,
          source_id: sourceId,
          inputs: normalize(inputs),
        },
      })
        .then((f) => {
          if (live) setFleet({ ...f, loading: false, error: "" });
        })
        .catch((e) => {
          if (live) setFleet({ count: null, loading: false, error: e.message });
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [inputs, sourceId, sourceType]);
  useEffect(() => {
    const remove = a.registerLeaveGuard?.(
        dirty
          ? (next) =>
              a.confirm(
                "离开交能推演",
                "当前条件尚未保存，是否放弃修改？",
                next,
              )
          : null,
      ),
      before = (e) => {
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
    setPlaying(false);
    setClock(start);
    setFocusedVehicle(null);
    setFocusedStation(null);
  }, [plan?.id, result?.generated_at]);
  useEffect(() => {
    if (picking)
      requestAnimationFrame(() =>
        document
          .querySelector(".goal-map")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
  }, [picking]);
  const change = (key, value) => {
    setInputs((s) => ({ ...s, [key]: value,...(['origin','destination'].includes(key)?{station_ids:[]}:{}) }));
    setPlaying(false);
  };
  const applyPreset=(preset)=>{
    const apply=()=>{const begin=Date.now()+5*60000;setInputs(i=>({...i,quantity:preset.quantity,cargo:preset.cargo,origin:preset.origin,destination:preset.destination,goal:'deadline',resource_mode:'reference',start_at:new Date(begin).toISOString(),deadline:new Date(begin+preset.hours*3600000).toISOString(),vehicle_count:preset.vehicles,vehicle_limit:preset.vehicles,station_ids:preset.stations,route_strategy:32}));setPlaying(false);setExpanded(true);};
    if(locked){selectSource('manual',source.owner_id,true);return;}
    if(sourceType!=='manual'){setError('请先重置为手动条件后选择快捷线路');return;}
    apply();
  };
  const receive = (s) => {
    setScene(s);
    setInputs(s.inputs);
    setClean(JSON.stringify(s.inputs));
    setAssumptions(s.assumptions || assumptions);
    setSelected(
      s.selected ||
        s.result?.ai?.recommended_id ||
        s.result?.recommended_id ||
        s.result?.candidates[0]?.id ||
        null,
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
  async function save(next = inputs) {
    const r = await a.execute("scenario.save", scene?.id || null, {
      source_resource: sourceType,
      source_id: sourceId,
      inputs: normalize(next),
      expected_version: scene?.version,
      comparison_candidate_id: selected,
    });
    receive(r.scenario);
    return r.scenario;
  }
  async function run(next = null) {
    return await action(async () => {
      let s = scene;
      if (!s || dirty || next) s = await save(next || inputs);
      const r = await a.execute("scenario.run", s.id, {
        expected_version: s.version,
      });
      receive(r.scenario);
      const params = new URLSearchParams(location.hash.split("?")[1] || "");
      if (params.has("new")) {
        params.delete("new");
        history.replaceState(
          null,
          "",
          "#simulation" + (params.size ? "?" + params : ""),
        );
      }
      setExpanded(true);
      return r.scenario;
    }, "run");
  }
  const selectSource = (type, id, fresh = false) => {
    const next = () => {
      freshSource.current = fresh;
      setSourceType(type);
      setSourceId(id);
      setLoadRevision((n) => n + 1);
      if (type === "manual")
        sessionStorage.setItem("simulation-owner-" + a.boot.user.id, id);
      history.replaceState(
        null,
        "",
        "#simulation" +
          (type === "manual"
            ? ""
            : "?" +
              new URLSearchParams({
                [type === "orders" ? "order_id" : "demand_id"]: id,
              })),
      );
      setFocusedVehicle(null);
      setFocusedStation(null);
      setFleet({ count: null, loading: false, error: "" });
    };
    if (dirty)
      a.confirm(
        fresh ? "重置运输条件" : "切换业务主体",
        "未保存的条件将被放弃。",
        next,
      );
    else next();
  };
  const reset = () =>
    selectSource(
      "manual",
      source?.owner_id || a.boot.organizations[0]?.id,
      true,
    );
  async function applyChatProposal(reply) {
    if (reply.expected_version !== scene.version) {
      setError("方案已更新，请重新提出调整");
      return null;
    }
    return await run({ ...reply.base_inputs, ...reply.patch });
  }
  const eligibleFor = (virtual) =>
    a.boot.vehicles.filter((v) => {
      const d = a.boot.drivers.find((d) => d.id === v.driver_id),
        i = planInputs,
        conflict = a.boot.tasks.some(
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
        ),
        compatible = virtual.nodes
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
        d?.status === "可用" &&
        d.owner_id === source.owner_id &&
        v.capacity_kwh >= i.capacity &&
        v.payload_kg >= i.payload * 1000 &&
        v.soc >= i.initial_soc &&
        !conflict &&
        compatible &&
        (i.resource_mode !== "actual" ||
          !i.goal ||
          scene.resource_versions?.some(
            (x) =>
              x.id === v.id &&
              x.version === v.version &&
              x.driver_version === d.version,
          ))
      );
    });
  const openDispatch = () => {
    const used = new Set();
    setMappings(
      plan.vehicles.map((v) => {
        const actual = eligibleFor(v).find((x) => !used.has(x.id));
        if (actual) used.add(actual.id);
        return { sim_vehicle_id: v.id, vehicle_id: actual?.id };
      }),
    );
    setDispatchError("");
    setBindingMode("create");
    setBindingId(null);
  };
  async function adopt() {
    await action(async () => {
      if (!scene.confirmed || scene.selected !== selected) {
        const r = await a.execute("scenario.confirm", scene.id, {
          candidate_id: selected,
          expected_version: scene.version,
        });
        receive(r.scenario);
      }
      openDispatch();
    }, "confirm");
  }
  async function generate() {
    setBusy("dispatch");
    setDispatchError("");
    try {
      const binding = (bindingMode === "orders" ? orders : demands).find(
          (x) => x.id === bindingId,
        ),
        r = await a.execute("scenario.dispatch", scene.id, {
          expected_version: scene.version,
          mappings,
          ...(sourceType === "manual"
            ? bindingMode === "create"
              ? { create_execution: true }
              : {
                  execution_source: {
                    resource: bindingMode,
                    id: bindingId,
                    expected_version: binding?.version,
                  },
                }
            : {}),
        });
      receive(r.scenario);
      setMappings(null);
    } catch (e) {
      setDispatchError(e.message);
    } finally {
      setBusy("");
    }
  }
  function showEvidence() {
    a.panel(
      "测算条件与数据依据",
      <div className="stack">
        <Pill>条件测算 · 推演</Pill>
        {assumptions.map((x) => (
          <div key={x.key}>
            <strong>{x.label}</strong>
            <p>
              {x.kind === "platform"
                ? "平台资料"
                : x.kind === "manual"
                  ? "用户调整"
                  : "参考 / 推演"}{" "}
              · {x.detail}
            </p>
          </div>
        ))}
        <p>
          道路来自高德通用驾车服务，货车禁限行和矿内道路需核实。社会车流为推演，成本不是实际结算。
        </p>
        {result?.limitations.map((x) => (
          <p key={x}>{x}</p>
        ))}
        {planningSources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> · {s.publisher}<br/>{s.facts}</p>)}
        <p>区域补能点的工位、功率和电价按规划参数测算。实际任务使用已登记运营场站，排程完成后仍需核验设备与运力。</p>
      </div>,
    );
  }
  const field = (key, label, min, max) => (
    <label className="scene-field">
      <span>{label}</span>
      <InputNumber
        aria-label={label}
        min={min}
        max={max}
        value={inputs[key]}
        disabled={locked || !!busy}
        onChange={(v) => change(key, v)}
      />
    </label>
  );
  const dateField = (key, label) => (
    <label className="scene-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="datetime-local"
        value={local(inputs[key])}
        disabled={locked || !!busy}
        onChange={(e) =>
          change(
            key,
            e.target.value ? new Date(e.target.value).toISOString() : "",
          )
        }
      />
    </label>
  );
  if (!inputs)
    return (
      <div className="scenario-workbench goal-workbench">
        <Heading title="交能推演" />
        {error ? (
          <Alert
            type="error"
            message={error}
            action={
              <>
                <Button onClick={() => setLoadRevision((n) => n + 1)}>
                  重试
                </Button>
                {sourceType !== "manual" && (
                  <Button
                    onClick={() =>
                      selectSource("manual", a.boot.organizations[0]?.id, true)
                    }
                  >
                    手动填写
                  </Button>
                )}
              </>
            }
          />
        ) : busy ? (
          <div className="goal-loading">正在载入运输条件…</div>
        ) : (
          <Empty description="暂无可用业务主体">
            <Button
              onClick={() =>
                selectSource("manual", a.boot.organizations[0]?.id)
              }
            >
              直接试算
            </Button>
          </Empty>
        )}
      </div>
    );
  const pickPoint = (key) => {
      setPicking(key);
      setSettings(false);
    },
    settingsClose = () => setSettings(false);
  return (
    <div className="scenario-workbench goal-workbench">
      <Heading title="交能推演" />
      {inputs?.planning_reference && (
        <Alert
          type="info"
          title={`已带入规划 V${inputs.planning_reference.sequence} 条件，请核对运输位置、单日运量与车辆后开始推演`}
          action={<Button onClick={() => a.go("deployment")}>返回规划</Button>}
        />
      )}
      {sourceType === "orders" &&
        new URLSearchParams(location.hash.split("?")[1] || "").get(
          "safety_review",
        ) === "1" && (
          <SafetyReplanContext
            orderId={sourceId}
            available={source?.available_kg}
          />
        )}
      <section className="goal-input-card" aria-label="运输条件">
        {expanded ? (
          <>
            <div className="goal-cargo-grid">
              {field(
                "quantity",
                "运输总量（吨）",
                0.1,
                sourceType === "manual" ? 100000 : source.available_kg / 1000,
              )}
              <label className="scene-field">
                <span>货物类型</span>
                <Select
                  aria-label="货物类型"
                  value={inputs.cargo || undefined}
                  placeholder="请选择货物类型"
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  options={[
                    ...new Set([inputs.cargo, ...cargoTypes].filter(Boolean)),
                  ].map((cargo) => ({ value: cargo, label: cargo }))}
                  disabled={locked || !!busy}
                  onChange={(value) => change("cargo", value || "")}
                />
              </label>
              <PointInput
                label="起运地"
                value={inputs.origin}
                disabled={locked || !!busy}
                onChange={(v) => change("origin", v)}
                onPick={() => pickPoint("origin")}
              />
              <PointInput
                label="目的地"
                value={inputs.destination}
                disabled={locked || !!busy}
                onChange={(v) => change("destination", v)}
                onPick={() => pickPoint("destination")}
              />
            </div>
            <div className="goal-objective">
              <span>运输目标</span>
              <Segmented
                aria-label="运输目标"
                value={inputs.goal}
                options={goals}
                disabled={locked || !!busy}
                onChange={(v) => {
                  setInputs((i) => ({
                    ...i,
                    goal: v,
                    ...(v !== 'existing' && (!i.deadline || +new Date(i.deadline)<=+new Date(i.start_at))
                      ? { deadline: source.finish_at || new Date(+new Date(i.start_at)+12*3600000).toISOString() }
                      : {}),
                  }));
                  setPlaying(false);
                }}
              />
            </div>
            <div className="goal-condition-row">
              <div className="goal-time-range" aria-label="运输时间区间">
                {dateField('start_at',inputs.goal==='existing'?'开始时间':'区间开始时间')}
                {inputs.goal!=='existing'&&<><span>至</span>{dateField('deadline','截止完成时间')}</>}
              </div>
              <label className="scene-field">
                <span>运力范围</span>
                <Select
                  aria-label="运力范围"
                  value={inputs.resource_mode}
                  disabled={locked || !!busy}
                  options={[
                    { value: "actual", label: "现有可用运力" },
                    { value: "reference", label: "参考车型试算" },
                  ]}
                  onChange={(v) => {
                    setInputs((i) => ({
                      ...i,
                      resource_mode: v,
                      ...(v === "actual" && fleetDefaults ? fleetDefaults : {}),
                    }));
                  }}
                />
              </label>
              {inputs.goal === "existing"
                ? field(
                    "vehicle_count",
                    "参与车辆数",
                    1,
                    Math.min(60, inputs.vehicle_limit),
                  )
                : field("vehicle_limit", "车辆数上限", 1, 60)}
              <span className="goal-fleet-note">
                {fleet.loading ? (
                  "正在核对运力…"
                ) : fleet.error ? (
                  "运力待核对"
                ) : fleet.count === null ? (
                  "选择起终点后核对运力"
                ) : (
                  <>
                    符合当前条件 <b>{fleet.count}</b> 辆
                    {inputs.resource_mode === "reference" &&
                      " · 参考方案待匹配实际车辆"}
                  </>
                )}
              </span>
              <div className="goal-condition-actions"><Button
                icon={SlidersHorizontal}
                disabled={!!busy}
                onClick={() => setSettings(true)}
              >
                测算条件
              </Button>
              <Button icon={RotateCcw} disabled={!!busy} onClick={reset}>
                重置
              </Button>
              <Button
                className="goal-run"
                type="primary"
                icon={Play}
                loading={busy === "run"}
                disabled={locked || !!busy || !a.can("simulation.run")}
                onClick={() => run()}
              >
                生成运输方案
              </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="goal-compact">
            <strong>
              {inputs.origin.name}
              <ArrowRight size={15} />
              {inputs.destination.name}
            </strong>
            <span>
              {format(inputs.quantity)} 吨 · {inputs.cargo}
            </span>
            <span>{goals.find((g) => g.value === inputs.goal)?.label}</span>
            <span>
              {inputs.goal === "existing"
                ? `当前 ${inputs.vehicle_count} 辆`
                : "最晚 " + time(inputs.deadline)}
            </span>
            <Button
              size="small"
              onClick={() => setExpanded(true)}
              disabled={locked}
            >
              调整条件
            </Button>
            <Button
              size="small"
              type="primary"
              loading={busy === "run"}
              onClick={() => run()}
              disabled={locked || !!busy || !a.can("simulation.run")}
            >
              重新测算
            </Button>
          </div>
        )}
        <div className="goal-assumption-line">
          {sourceType !== "manual" && (
            <span className="goal-order-ref" aria-label="带入来源">
              {source.code}
            </span>
          )}

          <button onClick={showEvidence}>
            <Info size={13} />
            参考条件 {
              assumptions.filter((x) => x.kind !== "platform").length
            }{" "}
            项
          </button>
          <span>
            {inputs.resource_mode === "actual" ? "平台运力资料" : "参考车型"} ·
            装卸参数与社会流量需核实
          </span>
          {!expanded && (
            <button onClick={() => setExpanded(true)} disabled={locked}>
              查看运输条件
            </button>
          )}
        </div>
      </section>
      <div className="goal-quick-corridors" aria-label="庆阳及周边快捷线路"><span>常用线路</span>{qingyangPresets.map(p=><button key={p.id} disabled={locked||!!busy||sourceType!=='manual'} onClick={()=>applyPreset(p)}>{p.label}</button>)}</div>
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
        <Alert
          type="warning"
          showIcon
          message="条件已修改，当前结果仅供查看，重新测算后可采用。"
        />
      )}
      {busy === "run" && (
        <div className="goal-computing" role="status">
          <span className="scene-spinner" />
          <div>
            <strong>正在生成运输方案</strong>
            <span>核对道路、运力与装卸补能条件，并调用 AI 分析</span>
          </div>
        </div>
      )}
      {inputs && (
        <section
          className={
            "scene-map-stage goal-map floating-layout " +
            (result && plansOpen && !picking ? "plans-visible" : "")
          }
          aria-label="运输路线与回放"
        >
          <ScenarioMap
            inputs={picking || dirty ? inputs : planInputs}
            plan={picking || dirty ? null : plan}
            routes={picking || dirty ? undefined : result?.routes}
            stations={routeStations}
            clock={clock}
            picking={picking}
            onPick={(p) => {
              change(picking, p);
              setPicking(null);
              setExpanded(true);
            }}
            onVehicle={(id) => {
              setFocusedVehicle(id);
              setFocusedStation(null);
            }}
            onStation={(id) => {
              setFocusedStation(id);
              setFocusedVehicle(null);
            }}
            focusedStationId={focusedStation}
            leftOpen={!picking}
            rightOpen={!!result && plansOpen && !picking}
            rightPanelWidth={430}
          />
          {!picking&&<ScenarioRoutePlanner inputs={inputs} stations={routeStations} plan={dirty?null:plan} busy={!!busy} locked={locked} onChange={change} focused={focusedStation} onFocus={id=>{setFocusedStation(id);setFocusedVehicle(null);}}/>}
          {!picking && (
            <FloatingPlans
              result={result}
              plan={plan}
              scene={scene}
              selected={selected}
              setSelected={setSelected}
              open={plansOpen}
              setOpen={setPlansOpen}
              dirty={dirty}
              busy={busy}
              canAdopt={a.can("simulation.confirm")}
              onAdopt={adopt}
              onTasks={() => a.go("tasks")}
              onExplain={() =>
                a.openPageAssistant({
                  agent_entry: {
                    capability: "SIMULATION",
                    owner_id: source.owner_id,
                    ...(scene
                      ? {
                          context_resource: "simulation-scenarios",
                          context_id: scene.id,
                        }
                      : sourceType !== "manual"
                        ? { context_resource: sourceType, context_id: sourceId }
                        : {}),
                    draft: inputs,
                  },
                  return_hash: location.hash,
                })
              }
              onEvidence={showEvidence}
            />
          )}
          {picking && (
            <div className="goal-pick-banner">
              请在地图选择{picking === "origin" ? "起运地" : "目的地"}
              <Button size="small" onClick={() => setPicking(null)}>
                取消选点
              </Button>
            </div>
          )}
          {plan && (
            <div className="scene-playback">
              <div className="scene-playback-row">
                <Button
                  aria-label={playing ? "暂停推演" : "播放推演"}
                  icon={playing ? Pause : Play}
                  type="primary"
                  size="small"
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
                <strong>{clockText(clock)}</strong>
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
                value={Math.round(((clock - start) / (end - start)) * 1000)}
                tooltip={{
                  formatter: (v) =>
                    clockText(start + ((end - start) * v) / 1000),
                }}
                onChange={(v) => {
                  setClock(start + ((end - start) * v) / 1000);
                  setPlaying(false);
                }}
              />
              <div className="scene-playback-range">
                <span>{clockText(start)}</span>
                <span>{clockText(end)}</span>
              </div>
            </div>
          )}
          <div className="scene-model-label">
            <span>推演运输过程</span>
            <button onClick={showEvidence}>
              数据依据 <Info size={12} />
            </button>
          </div>
        </section>
      )}
      {plan && (
        <section className="scene-results">
          <div className="scene-results-title">
            <strong>{plan.name} · 执行明细</strong>
            <span>
              {plan.vehicles.length}辆推演车 ·{" "}
              {plan.vehicles.reduce((s, v) => s + v.trips, 0)}车次
            </span>
          </div>
          <Table className="goal-vehicle-assignments" aria-label="车辆具体安排" rowKey="id" size="small" scroll={{x:1000}} pagination={{defaultPageSize:10,pageSizeOptions:[10,20,50],showSizeChanger:true,hideOnSinglePage:true}} dataSource={plan.vehicles} columns={[
            col('车辆安排','id',(id)=>'车辆'+id.slice(-2)),
            col('承运量','quantity_kg',v=>format(v/1000)+' 吨'),
            col('计划趟次','trips',v=>v+' 趟'),
            col('开始作业','start_at',time),
            col('首趟发车','nodes',nodes=>time(nodes.find(n=>n.kind==='drive')?.start_at)),
            col('完成时间','finish_at',time),
            col('补能次数','nodes',nodes=>nodes.filter(n=>n.kind==='charge').length+' 次'),
            {title:'操作',key:'action',render:(_,v)=><Button type="text" size="small" onClick={()=>{setTab('timeline');setFocusedVehicle(v.id);setClock(+new Date(v.start_at));}}>查看排程</Button>},
          ]}/>
          <ScenarioDetails
            {...{
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
              stationNames: Object.fromEntries(stationCatalog.map(s=>[s.id,s.name])),
            }}
          />
          <div className="goal-execution-links"><span>{locked?`已生成 ${scene.generated_task_ids.length} 个待派发任务`:'核对方案后生成待派发任务，派发后由司机接收执行。'}</span><Button onClick={()=>a.go('tasks')}>运输任务</Button><Button onClick={()=>a.go('charging')}>补能调度</Button></div>
        </section>
      )}
      <Drawer
        title="测算条件"
        open={settings}
        width={540}
        onClose={() => setSettings(false)}
        footer={
          <div className="goal-drawer-footer">
            <Button onClick={showEvidence}>查看参考依据</Button>
            <Button type="primary" onClick={() => setSettings(false)}>
              完成设置
            </Button>
          </div>
        }
      >
        {sourceType === "manual" && a.boot.organizations.length > 1 && (
          <label className="scene-field goal-owner-setting">
            <span>业务主体</span>
            <Select
              aria-label="试算业务主体"
              value={sourceId}
              disabled={!!busy || locked}
              options={a.boot.organizations.map((o) => ({
                value: o.id,
                label: o.name,
              }))}
              onChange={(id) => {
                setSettings(false);
                selectSource("manual", id);
              }}
            />
          </label>
        )}
        <ScenarioSettings
          {...{ inputs, change, busy, scene, source, showEvidence,stationCatalog }}
        />
      </Drawer>
      <Drawer
        title={focused ? focused.id + " · 推演车辆" : "场站推演状态"}
        open={!!focused || !!focusedStats || !!focusedStation}
        width={380}
        onClose={() => {
          setFocusedVehicle(null);
          setFocusedStation(null);
        }}
      >
        {focusedStation&&!focusedStats&&(()=>{const s=stationCatalog.find(x=>x.id===focusedStation);return s&&<div className="goal-resource-state"><strong>{s.name}</strong><p>{s.mode} · {s.slots}工位 · {s.power_kw}kW</p><p>{s.city||s.address}</p><p>{s.planning_only?'按规划工位和分时电价参与排程。':'已登记运营场站'}</p><Button disabled={locked||!!busy} onClick={()=>{change('station_ids',inputs.station_ids.includes(s.id)?inputs.station_ids.filter(id=>id!==s.id):[...inputs.station_ids,s.id].slice(0,8));setFocusedStation(null);}}>{inputs.station_ids.includes(s.id)?'移出补能候选':'加入补能候选'}</Button></div>;})()}
        {focused && (
          <div className="goal-resource-state">
            <Pill>{focusedState.label}</Pill>
            <p>
              SOC <b>{format(focusedState.soc)}%</b>
            </p>
            <p>已行驶 {format(focusedState.distance_km)} km</p>
            <p>
              运量 {format(focused.quantity_kg / 1000)} 吨 · {focused.trips}趟
            </p>
            <p>预计完成 {time(focused.finish_at)}</p>
          </div>
        )}
        {focusedStats &&
          (() => {
            const s = stationAt(focusedStats, clock);
            return (
              <div className="goal-resource-state">
                <strong>{focusedStats.name}</strong>
                <p>
                  工位 {focusedStats.slots} · 占用 {s.occupied} · 排队{" "}
                  {s.waiting}
                </p>
                <p>
                  本次车辆 {s.own} · 其他平台 {s.platform} · 推演社会{" "}
                  {s.external}
                </p>
                <p>平均等待 {focusedStats.avg_wait_minutes} 分钟</p>
              </div>
            );
          })()}
      </Drawer>
      <Drawer
        title="核对并生成派单任务"
        open={!!mappings}
        width={820}
        destroyOnHidden
        onClose={() => setMappings(null)}
        footer={
          <div className="goal-drawer-footer">
            <span>生成后在运输任务页手动派发</span>
            <Button
              disabled={busy === "dispatch"}
              onClick={() => setMappings(null)}
            >
              取消
            </Button>
            <Button
              type="primary"
              loading={busy === "dispatch"}
              disabled={
                mappings?.some((m) => !m.vehicle_id) ||
                plan?.vehicles.some(v=>v.nodes.some(n=>n.kind==='charge'&&planningStations.some(s=>s.id===n.station_id))) ||
                (sourceType === "manual" &&
                  bindingMode !== "create" &&
                  !bindingId)
              }
              onClick={generate}
            >
              {sourceType === "manual" && bindingMode === "create"
                ? "确认新建需求、订单并生成任务"
                : "确认生成待派发任务"}
            </Button>
          </div>
        }
      >
        {mappings && (
          <>
            {dispatchError && <Alert type="error" message={dispatchError} />}
            {plan.vehicles.some(v=>v.nodes.some(n=>n.kind==='charge'&&planningStations.some(s=>s.id===n.station_id)))&&<Alert className="goal-dispatch-station-notice" showIcon type="warning" message="本方案补能点需先落实运营场站及工位，再重新推演生成任务。" action={<Button onClick={()=>a.go('station-files')}>场站档案</Button>}/>}
            <div className="scene-dispatch-summary">
              <Pill>{plan.name}</Pill>
              <strong>
                {format(scene.inputs.quantity)}吨 · {plan.vehicles.length}辆车
              </strong>
              <p>
                {scene.inputs.origin.name} → {scene.inputs.destination.name}
              </p>
            </div>
            {sourceType === "manual" ? (
              <div className="goal-execution-source">
                <label className="scene-field">
                  <span>执行来源</span>
                  <Select
                    aria-label="执行来源类型"
                    value={bindingMode}
                    onChange={(v) => {
                      setBindingMode(v);
                      setBindingId(null);
                    }}
                    options={[
                      { value: "create", label: "新建运输需求及订单" },
                      { value: "demands", label: "关联已有运输需求" },
                      { value: "orders", label: "关联已有运输订单" },
                    ]}
                  />
                </label>
                {bindingMode !== "create" ? (
                  <label className="scene-field">
                    <span>选择匹配来源</span>
                    <Select
                      aria-label="执行来源"
                      value={bindingId}
                      showSearch
                      optionFilterProp="label"
                      onChange={setBindingId}
                      options={(bindingMode === "orders" ? orders : demands)
                        .filter((s) => s.owner_id === source.owner_id)
                        .map((s) => ({
                          value: s.id,
                          label: s.code + " · " + s.name,
                        }))}
                    />
                  </label>
                ) : (
                  <p>
                    将按已核对的货物、运量、起终点及时间创建1笔需求和1笔订单。
                  </p>
                )}
              </div>
            ) : (
              <p className="goal-binding-ref">
                执行来源：{source.code} · {source.name}
              </p>
            )}
            <Table
              rowKey="sim_vehicle_id"
              pagination={false}
              size="small"
              scroll={{ x: 650 }}
              dataSource={mappings}
              columns={[
                col("推演车辆", "sim_vehicle_id"),
                {
                  title: "实际车辆 / 绑定司机",
                  key: "vehicle",
                  render: (_, row) => (
                    <Select
                      aria-label={row.sim_vehicle_id + "实际车辆"}
                      style={{ width: "100%", minWidth: 205 }}
                      value={row.vehicle_id}
                      placeholder="选择符合条件的车辆"
                      onChange={(v) =>
                        setMappings((ms) =>
                          ms.map((m) =>
                            m.sim_vehicle_id === row.sim_vehicle_id
                              ? { ...m, vehicle_id: v }
                              : m,
                          ),
                        )
                      }
                      options={eligibleFor(
                        plan.vehicles.find((v) => v.id === row.sim_vehicle_id),
                      ).map((v) => ({
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
            {mappings.some((m) => !m.vehicle_id) && (
              <Alert
                className="goal-mapping-alert"
                type="warning"
                showIcon
                message="部分推演车辆尚无匹配的实际车辆或司机，请补充运力或调整方案后再生成。"
                action={<Button onClick={()=>a.go('resources')}>运力档案</Button>}
              />
            )}
          </>
        )}
      </Drawer>
      <AgentContextSync
        context={{
          capability: "SIMULATION",
          owner_id: source?.owner_id,
          ...(scene
            ? { context_resource: "simulation-scenarios", context_id: scene.id }
            : sourceType !== "manual"
              ? { context_resource: sourceType, context_id: sourceId }
              : {}),
          draft: inputs || {},
        }}
      />
    </div>
  );
}
