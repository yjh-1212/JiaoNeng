import React, { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui";
import {
  Select,
  Tabs,
  Table,
  Alert,
  Empty,
  Drawer,
  Descriptions,
  Tag,
} from "antd";
import {
  Plus,
  RefreshCw,
  SlidersHorizontal,
  MapPinned,
  Truck,
  Users,
  BatteryCharging,
  ArrowRight,
  Info,
} from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Card, Pill, format, time, DataTable } from "./ui";
import { PlanningEditor, PlanningEvidence } from "./planning-panels";
import PlanningMap from "./planning-map";
import { EnergyAI } from "./energy-panels";
import "./planning-workbench.css";

export default function PlanningWorkspace({ deployment = false }) {
  const a = useApp(),
    storage = "planner-project-" + a.user.id,
    [projects, setProjects] = useState([]),
    [projectId, setId] = useState(() => sessionStorage.getItem(storage)),
    [data, setData] = useState(null),
    [options, setOptions] = useState(null),
    [solutionId, setSolutionId] = useState(null),
    [candidateId, setCandidateId] = useState(null),
    [tab, setTab] = useState(deployment ? "result" : "sites"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [editor, setEditor] = useState(false),
    [editing, setEditing] = useState(false),
    [evidence, setEvidence] = useState(false),
    [history, setHistory] = useState(false),
    [lineId, setLineId] = useState(null),
    [compared, setCompared] = useState([]),
    [reload, setReload] = useState(0),
    key = useRef(null);
  const project = data?.project,
    solutions = data?.solutions || [],
    solution = solutions.find((s) => s.id === solutionId),
    site =
      solution?.sites.find((s) => s.id === candidateId) || solution?.sites[0],
    fleet = solution?.fleet,
    stock = solution?.inventory,
    snapshot = solution?.business_snapshot || project?.business_snapshot,
    lines = snapshot?.corridors || [],
    line =
      lines.find((l) => l.order_id === lineId) || lines.find((l) => l.order_id),
    write = a.can("planning.write"),
    stale = solution && solution.project_version !== project?.version,
    selectedSites = solution?.sites || options?.candidates || [];
  useEffect(() => {
    setTab(deployment ? "result" : "sites");
  }, [deployment]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    request("/api/planner/projects")
      .then(async (r) => {
        if (!live) return;
        setProjects(r.items);
        const id = r.items.some((p) => p.id === projectId)
          ? projectId
          : r.items[0]?.id || null;
        if (id !== projectId) {
          setId(id || null);
          return;
        }
        if (!id) {
          setData(null);
          const opts = await request("/api/planner/options");
          if (live) setOptions(opts);
          return;
        }
        const [d, opts] = await Promise.all([
          request("/api/planner/projects/" + id),
          request(
            "/api/planner/options?owner_id=" +
              r.items.find((p) => p.id === id).owner_id,
          ),
        ]);
        if (!live) return;
        setData(d);
        setOptions(opts);
        setSolutionId((prior) =>
          d.solutions.some((s) => s.id === prior)
            ? prior
            : d.solutions.find(
                (s) =>
                  s.project_version === d.project.version &&
                  s.status !== "已归档",
              )?.id ||
              d.project.reference_id ||
              d.solutions[0]?.id ||
              null,
        );
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [projectId, a.revision, reload]);
  useEffect(() => {
    if (projectId) sessionStorage.setItem(storage, projectId);
  }, [projectId]);
  useEffect(() => {
    setCandidateId(
      solution?.selected_id ||
        solution?.recommended_id ||
        solution?.sites[0]?.id ||
        null,
    );
    setCompared(solution ? [solution.id] : []);
  }, [solutionId, solution?.id]);
  const refresh = () => setReload((n) => n + 1);
  async function action(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      key.current = null;
      refresh();
    } catch (e) {
      setError(e.message);
      if (e.code !== "NETWORK") key.current = null;
    } finally {
      setBusy(false);
    }
  }
  const calculate = () =>
    action(async () => {
      key.current ||= crypto.randomUUID();
      const r = await a.execute(
        "planner.calculate",
        project.id,
        { expected_version: project.version },
        key.current,
      );
      setSolutionId(r.id);
      setTab(deployment ? "result" : "sites");
    });
  function adopt(s = solution, p = site) {
    a.confirm(
      "采用为参考方案",
      `${p.name}；${p.unknown.length ? "仍需核实" + p.unknown.join("、") + "。" : ""}保留为当前规划参考，不自动生成派单或启用资源。`,
      () =>
        action(async () => {
          await a.execute("planner.adopt", s.id, {
            project_id: project.id,
            expected_version: project.version,
            solution_version: s.version,
            candidate_id: p.id,
          });
        }),
    );
  }
  function simulation() {
    sessionStorage.setItem("simulation-owner-" + a.user.id, project.owner_id);
    a.go("simulation", {
      planning_handoff: {
        project_id: project.id,
        solution_id: solution.id,
        owner_id: project.owner_id,
        conditions: solution.conditions,
        corridor: line || null,
        vehicle_count: fleet.vehicles,
        site_id: site.station_id,
      },
    });
  }
  async function newProject() {
    setError("");
    try {
      setOptions(await request("/api/planner/options"));
      setEditing(false);
      setEditor(true);
    } catch (e) {
      setError(e.message);
    }
  }
  const adjust = () => {
    setEditing(true);
    setEditor(true);
  };
  const toolbar = (
    <div className="planning-toolbar">
      <div className="planning-project-select">
        <span>项目</span>
        <Select
          showSearch
          optionFilterProp="label"
          aria-label="规划项目"
          value={projectId || undefined}
          placeholder="选择规划项目"
          onChange={(id) => {
            key.current = null;
            setId(id);
            setSolutionId(null);
            setData(null);
          }}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Button
          icon={Plus}
          aria-label="新建规划项目"
          disabled={!write || busy}
          onClick={newProject}
        />
      </div>
      {project && (
        <>
          <span className="planning-period">
            基准期{" "}
            <b>
              {project.start_date} 至 {project.finish_date}
            </b>
          </span>
          <Select
            aria-label="规划方案版本"
            value={solutionId || undefined}
            placeholder="尚未测算"
            onChange={(id) => {
              setSolutionId(id);
              key.current = null;
            }}
            options={solutions.map((s) => ({
              value: s.id,
              label: `V${s.sequence}${s.id === project.reference_id ? " · 当前参考" : ""}${s.project_version !== project.version ? " · 旧条件" : ""}${s.status === "已归档" ? " · 已归档" : ""}`,
            }))}
          />
        </>
      )}
      <div className="planning-toolbar-actions">
        {project && (
          <>
            <Button disabled={!write || busy} onClick={adjust}>
              引用业务数据
            </Button>
            <Button
              icon={SlidersHorizontal}
              disabled={!write || busy}
              onClick={adjust}
            >
              调整条件
            </Button>
            <Button
              type="primary"
              icon={RefreshCw}
              loading={busy}
              disabled={!write || loading}
              onClick={calculate}
            >
              重新测算
            </Button>
          </>
        )}
      </div>
    </div>
  );
  const siteColumns = [
    {
      title: "候选布局",
      dataIndex: "name",
      render: (v, r) => (
        <button className="planning-link" onClick={() => setCandidateId(r.id)}>
          {v}
        </button>
      ),
    },
    {
      title: "布局方式",
      dataIndex: "station_id",
      render: (v) => (v ? "既有站扩容" : "新建"),
    },
    {
      title: "充电工位",
      render: (_, r) => `${r.existing} → ${r.total}（新增${r.added}）`,
    },
    { title: "覆盖率", render: () => "待分析" },
    {
      title: "绕行 / 情景等待",
      render: (_, r) =>
        `${r.detour_km == null ? "未测算" : format(r.detour_km) + " km"} / ${r.wait_minutes == null ? "不稳定" : format(r.wait_minutes) + " 分钟"}`,
    },
    {
      title: "需求 / 供电（kW）",
      render: (_, r) =>
        `${format(r.required_power_kw)} / ${format(r.supply_kw)}`,
    },
    { title: "状态", dataIndex: "status", render: (v) => <Pill>{v}</Pill> },
    {
      title: "操作",
      fixed: "right",
      render: (_, r) => (
        <Button
          type="link"
          disabled={
            !write ||
            busy ||
            stale ||
            !r.feasible ||
            solution?.status === "已归档"
          }
          onClick={() => adopt(solution, r)}
        >
          采用为参考
        </Button>
      ),
    },
  ];
  const table = (columns, rows, extra = {}) => (
    <Table
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={rows}
      pagination={false}
      scroll={{ x: "max-content" }}
      {...extra}
    />
  );
  function SiteView() {
    return (
      <>
        <div className="planning-map-workbench">
          <PlanningMap
            sites={selectedSites}
            selected={site?.id}
            onSelect={setCandidateId}
            orderId={line?.order_id}
            stationId={site?.station_id}
          />
          <section className="planning-candidates planning-floating">
            <div className="planning-panel-head">
              <b>候选布局</b>
              <span>{selectedSites.length} 个</span>
            </div>
            {selectedSites.map((p) => (
              <button
                key={p.id}
                className={
                  "planning-candidate" + (p.id === site?.id ? " selected" : "")
                }
                onClick={() => setCandidateId(p.id)}
              >
                <strong>
                  <MapPinned size={16} />
                  {p.name}
                </strong>
                <div>
                  <Tag>{p.station_id ? "扩容" : "新建"}</Tag>
                  {p.id === solution?.recommended_id && (
                    <Tag color="red">优先参考</Tag>
                  )}
                </div>
                {p.status && <Pill>{p.status}</Pill>}
                {p.total != null && (
                  <p>
                    新增充电位 <b>{p.added}</b> 个 · 情景等待{" "}
                    {format(p.wait_minutes)} 分钟
                  </p>
                )}
              </button>
            ))}
          </section>
          <section className="planning-recommendation planning-floating">
            <div className="planning-panel-head">
              <b>布局建议</b>
              <Pill>{site?.status || "待测算"}</Pill>
            </div>
            {site ? (
              <>
                <h3>{site.name}</h3>
                <div className="planning-recommend-values">
                  <div>
                    <span>充电工位</span>
                    <b>
                      {site.existing} → {site.total}
                      <small> 个</small>
                    </b>
                  </div>
                  <div>
                    <span>新增工位</span>
                    <b className="planning-accent">
                      {site.added}
                      <small> 个</small>
                    </b>
                  </div>
                </div>
                <dl className="planning-kv">
                  <dt>装机功率</dt>
                  <dd>{format(site.installed_power_kw)} kW</dd>
                  <dt>规划总负荷</dt>
                  <dd>{format(site.required_power_kw)} kW</dd>
                  <dt>供电上限</dt>
                  <dd>{format(site.supply_kw)} kW</dd>
                  <dt>道路绕行</dt>
                  <dd>
                    {site.detour_km == null
                      ? "未测算"
                      : format(site.detour_km) + " km"}
                  </dd>
                  <dt>情景排队</dt>
                  <dd>{format(site.wait_minutes)} 分钟</dd>
                </dl>
                {site.issues.length > 0 && (
                  <Alert type="error" title={site.issues.join("；")} />
                )}
                {site.unknown.length > 0 && (
                  <Alert
                    type="warning"
                    title={"待核实：" + site.unknown.join("、")}
                  />
                )}
                <div className="planning-recommend-actions">
                  <Button icon={Info} onClick={() => setEvidence(true)}>
                    查看依据
                  </Button>
                  <Button type="primary" onClick={() => a.go("deployment")}>
                    进入运力规划
                  </Button>
                </div>
              </>
            ) : (
              <Empty description="保存条件后开始测算" />
            )}
          </section>
        </div>
        {solution && (
          <Card title="布局方案对照">{table(siteColumns, solution.sites)}</Card>
        )}
      </>
    );
  }
  function FleetView() {
    if (!solution) return <Empty description="保存规划条件后，点击重新测算" />;
    const resourceRows = [
      {
        id: "vehicles",
        name: "电动重卡",
        unit: "辆",
        total: fleet.vehicles,
        available: fleet.available,
        gap: fleet.vehicle_gap,
        note: `执行 ${format(fleet.operating, 0)} 辆＋备用 ${format(fleet.reserve, 0)} 辆`,
        icon: Truck,
      },
      {
        id: "drivers",
        name: "司机",
        unit: "人",
        total: fleet.drivers_required,
        available: fleet.drivers_available,
        gap: fleet.driver_gap,
        note: "A2资格、状态、窗口与任务占用筛选",
        icon: Users,
      },
      {
        id: "battery",
        name: "随车电池",
        unit: "组",
        total: fleet.vehicles,
        available: fleet.available,
        gap: fleet.vehicle_gap,
        note: "随车辆配置，不重复计算车辆投资",
        icon: BatteryCharging,
      },
      {
        id: "charger",
        name: "充电工位",
        unit: "个",
        total: site?.total,
        available: site?.existing,
        gap: site?.added,
        note: site?.name,
        icon: BatteryCharging,
      },
      {
        id: "spares",
        name: "换电备用电池",
        unit: "",
        total: 0,
        available: 0,
        gap: 0,
        note: "纯充电方案，不配置",
        icon: BatteryCharging,
      },
    ];
    const phases = [solution.phase_one, fleet].map((f, i, arr) => {
      const prev = i ? arr[0] : { vehicles: 0 },
        total = f.vehicles,
        existing =
          total == null ? null : Math.min(total, stock.available_vehicles),
        previousExisting =
          i && arr[0].vehicles != null
            ? Math.min(arr[0].vehicles, stock.available_vehicles)
            : 0,
        added =
          total == null ? null : Math.max(0, total - stock.available_vehicles),
        previousAdded =
          i && arr[0].vehicles != null
            ? Math.max(0, arr[0].vehicles - stock.available_vehicles)
            : 0,
        chargers = Math.max(site?.existing || 0, f.chargers),
        priorChargers = i
          ? Math.max(site?.existing || 0, arr[0].chargers)
          : site?.existing || 0,
        driversGap =
          total == null ? null : Math.max(0, total - stock.available_drivers);
      return {
        id: String(i),
        name: i ? "二期" : "一期",
        quantity: f.quantity,
        vehicles: total,
        increment:
          total == null || prev.vehicles == null ? null : total - prev.vehicles,
        existing: existing === null ? null : existing - previousExisting,
        added: added === null ? null : added - previousAdded,
        chargers,
        chargeIncrement: chargers - priorChargers,
        driversGap,
        condition: !f.transport_feasible
          ? "运输条件不满足"
          : added || driversGap || chargers > (site?.existing || 0)
            ? "补齐资源并完成现场核验"
            : "核实班次、供电及通行条件",
      };
    });
    return (
      <>
        <div className="planning-metrics">
          {[
            ["建议车辆", fleet.vehicles, "辆"],
            ["现有适配", fleet.available, "辆"],
            ["新增车辆缺口", fleet.vehicle_gap, "辆"],
            [
              "充电工位",
              `${site?.existing ?? "—"} → ${site?.total ?? "—"}`,
              "个",
            ],
          ].map(([label, value, unit]) => (
            <div key={label}>
              <span>{label}</span>
              <strong
                className={label.includes("缺口") ? "planning-accent" : ""}
              >
                {typeof value === "string" ? value : format(value, 0)}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
          <Pill>
            {fleet.vehicle_gap || fleet.driver_gap || site?.added
              ? "有资源缺口"
              : "待现场核实"}
          </Pill>
        </div>
        <div className="planning-fleet-grid">
          <Card
            title="资源配置"
            extra={
              <span className="planning-muted">
                日运量 {format(solution.conditions.daily_quantity)} 吨 ·{" "}
                {solution.conditions.hours} 小时
              </span>
            }
          >
            {table(
              [
                {
                  title: "资源 / 适配条件",
                  dataIndex: "name",
                  render: (v, r) => (
                    <div className="planning-resource-name">
                      <r.icon size={20} />
                      <span>
                        <b>{v}</b>
                        <small>
                          {r.id === "vehicles"
                            ? `${solution.conditions.battery_kwh} kWh · ${solution.conditions.payload_tonnes} 吨`
                            : r.id === "charger"
                              ? solution.conditions.device_power + " kW"
                              : ""}
                        </small>
                      </span>
                    </div>
                  ),
                },
                {
                  title: "建议总量",
                  dataIndex: "total",
                  render: (v, r) => format(v, 0) + " " + r.unit,
                },
                {
                  title: "现有可用",
                  dataIndex: "available",
                  render: (v, r) => format(v, 0) + " " + r.unit,
                },
                {
                  title: "新增缺口",
                  dataIndex: "gap",
                  render: (v, r) => (
                    <b className={v ? "planning-accent" : ""}>
                      {format(v, 0)} {r.unit}
                    </b>
                  ),
                },
                { title: "配置依据", dataIndex: "note" },
                {
                  title: "操作",
                  render: () => (
                    <Button type="link" onClick={() => setEvidence(true)}>
                      查看依据
                    </Button>
                  ),
                },
              ],
              resourceRows,
            )}
            <div className="planning-table-foot">
              档案车辆 {stock.vehicles.length} 辆 · 适配可用{" "}
              {stock.available_vehicles} 辆 · 占用或不适配{" "}
              {stock.vehicles.length - stock.available_vehicles} 辆{" "}
              <Button type="link" onClick={() => setEvidence(true)}>
                查看资源明细
              </Button>
            </div>
          </Card>
          <Card title="约束校验">
            <div className="planning-checks">
              {[
                [
                  "运输能力",
                  fleet.transport_feasible ? "情景满足" : "条件不满足",
                  fleet.reasons.join("；") ||
                    `每车 ${fleet.cycles} 趟 / 作业窗`,
                ],
                [
                  "供电容量",
                  site?.supply_kw == null
                    ? "待核实"
                    : site.required_power_kw > site.supply_kw
                      ? "条件不满足"
                      : "情景满足",
                  `${format(site?.required_power_kw)} ≤ ${format(site?.supply_kw)} kW`,
                ],
                [
                  "建设条件",
                  site?.unknown.length ? "待核实" : "已填核验条件",
                  site?.unknown.join("、") || "仍需实际工程验收",
                ],
                [
                  "资源到位",
                  fleet.vehicle_gap || fleet.driver_gap || site?.added
                    ? "待补齐"
                    : "待确认",
                  `车辆 ${format(fleet.vehicle_gap, 0)} · 司机 ${format(fleet.driver_gap, 0)} · 工位 ${site?.added ?? "—"}`,
                ],
              ].map(([label, state, note]) => (
                <div key={label}>
                  <b>{label}</b>
                  <Pill>{state}</Pill>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            <div className="planning-budget">
              <h3>预算口径</h3>
              <p>
                设备与建设报价 <Tag>待补齐</Tag>
              </p>
              <p>
                车辆采购 / 租赁 <Tag>待补齐</Tag>
              </p>
              <p>
                完整投资回报 <span>暂不计算</span>
              </p>
            </div>
            <div className="planning-side-actions">
              <Button onClick={() => setEvidence(true)}>查看测算依据</Button>
              <Button
                type="link"
                disabled={stale || !fleet.transport_feasible || !site?.feasible}
                onClick={simulation}
              >
                带入交能推演 <ArrowRight size={14} />
              </Button>
            </div>
          </Card>
        </div>
        <Card
          title="分期安排"
          extra={
            <Button disabled={!write || busy} onClick={adjust}>
              调整阶段
            </Button>
          }
        >
          {table(
            [
              {
                title: "阶段",
                dataIndex: "name",
                render: (v) => <Tag color="blue">{v}</Tag>,
              },
              {
                title: "目标日运量",
                dataIndex: "quantity",
                render: (v) => format(v) + " 吨",
              },
              {
                title: "车辆累计 / 本期投入",
                render: (_, r) =>
                  `${format(r.vehicles, 0)} 辆 / ${format(r.increment, 0)} 辆`,
              },
              {
                title: "本期车辆来源",
                render: (_, r) =>
                  `现有 ${format(r.existing, 0)} 辆＋新增 ${format(r.added, 0)} 辆`,
              },
              {
                title: "工位累计 / 本期新增",
                render: (_, r) => `${r.chargers} 个 / ${r.chargeIncrement} 个`,
              },
              {
                title: "累计司机缺口",
                dataIndex: "driversGap",
                render: (v) => format(v, 0) + " 人",
              },
              { title: "启用条件", dataIndex: "condition" },
            ],
            phases,
          )}
        </Card>
      </>
    );
  }
  const historyTable = (
    <Table
      size="small"
      rowKey="id"
      dataSource={solutions}
      pagination={{
        defaultPageSize: 10,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
      }}
      scroll={{ x: "max-content" }}
      columns={[
        { title: "版本", dataIndex: "sequence", render: (v) => "V" + v },
        { title: "生成时间", dataIndex: "created_at", render: time },
        {
          title: "日运量（吨）",
          render: (_, s) => format(s.conditions.daily_quantity),
        },
        { title: "条件版本", dataIndex: "project_version" },
        {
          title: "状态",
          render: (_, s) => (
            <Pill>
              {s.project_version !== project?.version ? "条件已过期" : s.status}
            </Pill>
          ),
        },
        {
          title: "操作",
          render: (_, s) => (
            <div className="row">
              <Button
                type="link"
                onClick={() => {
                  setSolutionId(s.id);
                  setHistory(false);
                  setTab(deployment ? "result" : "sites");
                }}
              >
                查看
              </Button>
              <Button
                type="link"
                disabled={
                  !write ||
                  busy ||
                  project.reference_id === s.id ||
                  s.status === "已归档"
                }
                onClick={() =>
                  a.confirm(
                    "归档方案",
                    "保留测算数据与来源，归档后不能采用。",
                    () =>
                      action(() =>
                        a.execute("planner.archive", s.id, {
                          project_id: project.id,
                          expected_version: project.version,
                          solution_version: s.version,
                        }),
                      ),
                  )
                }
              >
                归档
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
  const compare = (
    <Card
      title="方案比较"
      extra={
        <Select
          mode="multiple"
          aria-label="对比方案"
          value={compared}
          onChange={setCompared}
          options={solutions.map((s) => ({
            value: s.id,
            label: "V" + s.sequence,
          }))}
          style={{ minWidth: 220 }}
        />
      }
    >
      {table(
        [
          { title: "方案", dataIndex: "sequence", render: (v) => "V" + v },
          {
            title: "日运量（吨）",
            render: (_, s) => format(s.conditions.daily_quantity),
          },
          {
            title: "建议车辆 / 缺口",
            render: (_, s) =>
              `${format(s.fleet.vehicles, 0)} / ${format(s.fleet.vehicle_gap, 0)}`,
          },
          {
            title: "司机缺口",
            render: (_, s) => format(s.fleet.driver_gap, 0),
          },
          {
            title: "参考布局",
            render: (_, s) =>
              s.sites.find((p) => p.id === (s.selected_id || s.recommended_id))
                ?.name || "无可行候选",
          },
          {
            title: "数据口径",
            render: (_, s) => (
              <Pill>
                {s.project_version === project?.version
                  ? "当前条件"
                  : "历史条件"}
              </Pill>
            ),
          },
          {
            title: "操作",
            render: (_, s) => (
              <Button
                type="link"
                onClick={() => {
                  setSolutionId(s.id);
                  setEvidence(true);
                }}
              >
                查看依据
              </Button>
            ),
          },
        ],
        solutions.filter((s) => compared.includes(s.id)),
      )}
    </Card>
  );
  return (
    <div className="planning-workspace">
      <Heading title={deployment ? "运力规划" : "场站规划"} />
      {error && (
        <Alert
          type="error"
          title={error}
          action={<Button onClick={refresh}>刷新重试</Button>}
        />
      )}
      {toolbar}
      {loading && !data ? (
        <div className="planning-loading">正在加载规划项目…</div>
      ) : !project ? (
        <Card>
          <Empty
            description="创建规划项目，选择业务范围和测算条件"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              disabled={!write || !options}
              onClick={newProject}
            >
              新建规划项目
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="planning-context">
            <span>
              日运量 <b>{format(project.conditions.daily_quantity)}</b> 吨 ·
              有效载重 {project.conditions.payload_tonnes} 吨 · 作业窗{" "}
              {project.conditions.start_hour}:00–
              {project.conditions.start_hour + project.conditions.hours}:00
            </span>
            <span>
              条件 V{project.version} ·{" "}
              {project.business_snapshot
                ? "引用业务＋手工调整"
                : "手工测算条件"}
            </span>
            {deployment && (
              <Button type="link" onClick={() => a.go("planning")}>
                关联场站方案：{site?.name || "待测算"}
              </Button>
            )}
          </div>
          {stale && (
            <Alert type="warning" title="当前为旧条件方案，请重新测算后采用" />
          )}
          <div className="planning-tabs">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={
                deployment
                  ? [
                      { key: "result", label: "测算结果" },
                      { key: "compare", label: "方案比较" },
                      { key: "history", label: "历史方案" },
                    ]
                  : [
                      { key: "demand", label: "需求分析" },
                      { key: "sites", label: "选址比选" },
                      { key: "capacity", label: "容量配置" },
                      { key: "compare", label: "规划成果" },
                    ]
              }
            />
            <div className="row">
              <Button onClick={() => setHistory(true)}>历史方案</Button>
              {solution && (
                <Button
                  disabled={
                    !write ||
                    busy ||
                    stale ||
                    !site?.feasible ||
                    solution.status === "已归档"
                  }
                  type={deployment ? "primary" : "default"}
                  onClick={() => adopt()}
                >
                  采用为参考方案
                </Button>
              )}
            </div>
          </div>
          {tab === "sites" ? (
            SiteView()
          ) : tab === "result" || tab === "capacity" ? (
            FleetView()
          ) : tab === "compare" ? (
            compare
          ) : tab === "history" ? (
            <Card>{historyTable}</Card>
          ) : (
            <Card
              title="运输需求分析"
              extra={
                <Button disabled={!write} onClick={adjust}>
                  引用业务数据
                </Button>
              }
            >
              {snapshot ? (
                <>
                  <div className="planning-table-foot">
                    计划运量 {format(snapshot.quantity_tonnes)} 吨 · 日均{" "}
                    {format(snapshot.daily_quantity)} 吨 · 核验交付{" "}
                    {format(snapshot.verified_tonnes)} 吨（单列）
                  </div>
                  {table(
                    [
                      { title: "运输走廊", dataIndex: "corridor" },
                      {
                        title: "区间运量（吨）",
                        dataIndex: "quantity",
                        render: (v) => format(v),
                      },
                      {
                        title: "日均运量（吨）",
                        dataIndex: "daily_quantity",
                        render: (v) => format(v),
                      },
                      {
                        title: "核验交付（吨）",
                        dataIndex: "verified_tonnes",
                        render: (v) => format(v),
                      },
                      {
                        title: "道路路线",
                        render: (_, r) => (
                          <Button
                            type="link"
                            disabled={!r.order_id}
                            onClick={() => {
                              setLineId(r.order_id);
                              setTab("sites");
                            }}
                          >
                            地图查看
                          </Button>
                        ),
                      },
                    ],
                    lines.map((l, i) => ({ ...l, id: String(i) })),
                  )}
                  <div className="planning-table-foot">
                    {snapshot.excluded.length} 条缺少有效运输时窗未计入{" "}
                    <Button type="link" onClick={() => setEvidence(true)}>
                      查看来源
                    </Button>
                  </div>
                </>
              ) : (
                <Empty description="尚未引用业务资料，可继续按手工条件测算" />
              )}
            </Card>
          )}
          <div className="planning-status">
            <span>条件测算 · 测算资料</span>
            {project.reference_id && (
              <span>
                已采用参考：V
                {solutions.find((s) => s.id === project.reference_id)?.sequence}
                {solutions.find((s) => s.id === project.reference_id)
                  ?.project_version !== project.version
                  ? "（条件已变化）"
                  : ""}
              </span>
            )}
            {solution && (
              <Button type="link" onClick={() => setEvidence(true)}>
                查看测算依据
              </Button>
            )}
          </div>
        </>
      )}
      {editor && options && (
        <PlanningEditor
          key={editing ? project.id : "new"}
          project={editing ? project : null}
          options={options}
          onClose={() => setEditor(false)}
          onSaved={(p) => {
            setEditor(false);
            setId(p.id);
            refresh();
          }}
        />
      )}
      {evidence && (
        <PlanningEvidence
          solution={solution}
          project={project}
          onClose={() => setEvidence(false)}
        />
      )}
      <Drawer
        open={history}
        onClose={() => setHistory(false)}
        width={900}
        title="历史规划方案"
      >
        <Tabs
          items={[
            { key: "current", label: "本项目方案", children: historyTable },
            {
              key: "legacy",
              label: "既有规划成果",
              children: (
                <DataTable
                  resource={deployment ? "deployment" : "planning"}
                  onView={false}
                  columns={[
                    { title: "成果编号", dataIndex: "code" },
                    { title: "名称", dataIndex: "name" },
                    {
                      title: "生成时间",
                      dataIndex: "created_at",
                      render: time,
                    },
                    {
                      title: "状态",
                      dataIndex: "status",
                      render: (v) => <Pill>{v}</Pill>,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Drawer>
      <EnergyAI />
    </div>
  );
}
