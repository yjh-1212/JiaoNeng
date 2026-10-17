import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Select,
  Table,
  Tabs,
  Alert,
  Empty,
  Pagination,
  Tag,
  Segmented,
  Drawer,
  Slider,
  Spin,
} from "antd";
import { RefreshCw, Plus } from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Pill, format, time } from "./ui";
import { EnergyAI, EnergyForm, localTime, iso } from "./energy-panels";
import {
  useSafety,
  safetyParams,
  incidentForm,
  IncidentDrawer,
} from "./safety-panels";
import SafetyMap from "./safety-map";
import { TaskPanel } from "./task-drawers";
import "./safety-workbench.css";

const initialQuery = () => {
  const p = new URLSearchParams(location.hash.split("?")[1] || "");
  return {
    q: "",
    owner: p.get('owner') || '',
    date: "",
    type: "",
    assignee: "",
    stage: "open",
    task: p.get("task") || "",
    order: p.get("order") || "",
    plan: p.get("plan") || "",
    station: p.get("station") || "",
    id: p.get("incident") || "",
    page: 1,
    pageSize: 10,
  };
};
const pager = (data, onChange) => (
  <Pagination
    current={data?.page || 1}
    pageSize={data?.pageSize || 10}
    total={data?.total || 0}
    showSizeChanger
    pageSizeOptions={[10, 20, 50, 100]}
    showTotal={(n) => "共 " + n + " 条"}
    onChange={onChange}
  />
);
const filter = (name, control) => (
  <label className="safety-filter">
    <span>{name}</span>
    {control}
  </label>
);
function ErrorLine({ error, retry }) {
  return error ? (
    <Alert
      type="error"
      showIcon
      title={error}
      action={<Button onClick={retry}>重试</Button>}
    />
  ) : null;
}

export function IncidentWorkspace() {
  const a = useApp(),
    [query, setQuery] = useState(initialQuery),
    [draft, setDraft] = useState(query),
    [bump, setBump] = useState(0),
    r = useSafety("/api/safety/incidents", query, bump),
    options = useSafety("/api/safety/options"),
    [detail, setDetail] = useState(() => initialQuery().id || null),
    [form, setForm] = useState(null),
    handled = useRef(null);
  useEffect(() => {
    const q = initialQuery();
    setQuery(q);
    setDraft(q);
    setDetail(q.id || null);
  }, [location.hash]);
  useEffect(() => {
    if (
      !a.intentDraft?.create ||
      handled.current === a.intentDraft ||
      !options.data
    )
      return;
    handled.current = a.intentDraft;
    setForm(
      incidentForm(a, options.data, {
        ...a.intentDraft,
        task_ids: a.intentDraft.task_id ? [a.intentDraft.task_id] : [],
        plan_ids: a.intentDraft.plan_id ? [a.intentDraft.plan_id] : [],
      }),
    );
  }, [a.intentDraft, options.data]);
  const choose = (k, v) => setDraft((d) => ({ ...d, [k]: v || "" }));
  const change = (q) => {
    setQuery(q);
    setDraft(q);
  };
  const rows = r.data?.items || [];
  return (
    <div className="safety-workspace">
      <Heading title="异常处置" />
      {query.owner&&<div style={{marginBottom:12}}><Tag closable onClose={()=>{const next={...query,owner:'',page:1};setDraft(next);setQuery(next);const p=new URLSearchParams(location.hash.split('?')[1]||'');p.delete('owner');history.replaceState(null,'','#alerts?'+p);}}>主体：{a.boot.organizations.find(o=>o.id===query.owner)?.name||query.owner}</Tag></div>}
      <form
        className="safety-filters"
        onSubmit={(e) => {
          e.preventDefault();
          change({ ...draft, page: 1 });
        }}
      >
        {filter(
          "关键词",
          <Input
            aria-label="异常关键词"
            placeholder="异常号 / 车牌 / 任务号"
            value={draft.q}
            onChange={(e) => choose("q", e.target.value)}
          />,
        )}
        {filter(
          "类型",
          <Select
            aria-label="异常类型筛选"
            value={draft.type || undefined}
            placeholder="全部类型"
            allowClear
            options={(options.data?.types || []).map((v) => ({
              value: v,
              label: v,
            }))}
            onChange={(v) => choose("type", v)}
          />,
        )}
        {filter(
          "处理人",
          <Select
            aria-label="处理人筛选"
            value={draft.assignee || undefined}
            placeholder="全部处理人"
            allowClear
            options={
              options.data?.assignees.map((u) => ({
                value: u.id,
                label: u.name,
              })) || []
            }
            onChange={(v) => choose("assignee", v)}
          />,
        )}
        {filter(
          "发生日期",
          <Input
            aria-label="异常发生日期"
            type="date"
            value={draft.date}
            onChange={(e) => choose("date", e.target.value)}
          />,
        )}
        <div className="safety-query-actions">
          <Button type="primary" htmlType="submit">
            查询
          </Button>
          <Button
            onClick={() => {
              const q = {
                ...initialQuery(),
                task: "",
                order: "",
                station: "",
                plan: "",
                id: "",
              };
              change(q);
            }}
          >
            重置
          </Button>
        </div>
      </form>
      <ErrorLine
        error={r.error || options.error}
        retry={() => setBump((n) => n + 1)}
      />
      {(query.task ||
        query.order ||
        query.plan ||
        query.station ||
        query.id) && (
        <div className="safety-context">
          <Tag>关联业务筛选</Tag>
          <Button
            type="link"
            onClick={() =>
              change({
                ...query,
                task: "",
                order: "",
                plan: "",
                station: "",
                id: "",
                page: 1,
              })
            }
          >
            查看全部异常
          </Button>
        </div>
      )}
      <section className="safety-list-panel">
        <div className="safety-list-header">
          <Tabs
            activeKey={query.stage}
            onChange={(stage) => change({ ...query, stage, page: 1 })}
            items={[
              ["open", "待处理"],
              ["pending", "待受理"],
              ["working", "处理中"],
              ["verify", "待核验"],
              ["closed", "已关闭"],
              ["all", "全部"],
            ].map(([key, label]) => ({
              key,
              label: label + " " + (r.data?.counts[key] ?? "—"),
            }))}
          />
          <div className="safety-query-actions">
            <Button
              aria-label="刷新异常列表"
              onClick={() => setBump((n) => n + 1)}
              icon={<RefreshCw size={15} />}
            />
            {a.can("alert.write") && (
              <Button
                type="primary"
                disabled={!options.data}
                icon={<Plus size={15} />}
                onClick={() => setForm(incidentForm(a, options.data))}
              >
                登记异常
              </Button>
            )}
          </div>
        </div>
        <Table
          rowKey="id"
          size="middle"
          loading={r.busy}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1120 }}
          onRow={(row) => ({
            className: detail === row.id ? "safety-selected-row" : "",
          })}
          columns={[
            {
              title: "异常 / 发生时间",
              key: "incident",
              width: 210,
              render: (_, row) => (
                <div className="safety-cell">
                  <Button type="link" onClick={() => setDetail(row.id)}>
                    {row.code}
                  </Button>
                  <b>{row.name}</b>
                  <small>
                    {time(row.created_at)} · {row.kind || row.source_label}
                  </small>
                </div>
              ),
            },
            {
              title: "关联对象 / 任务",
              key: "object",
              width: 220,
              render: (_, row) => (
                <div className="safety-cell">
                  <b>
                    {row.vehicle_code ||
                      row.device_name ||
                      row.station_name ||
                      row.object ||
                      "待核实"}
                  </b>
                  {row.tasks.slice(0, 2).map((t) => (
                    <Button
                      key={t.id}
                      type="link"
                      onClick={() => a.showDetail("tasks", t.id)}
                    >
                      {t.code}
                    </Button>
                  ))}
                  {row.tasks.length > 2 && (
                    <small>另有 {row.tasks.length - 2} 个任务</small>
                  )}
                  <small>{row.station_name}</small>
                </div>
              ),
            },
            {
              title: "业务影响",
              key: "impact",
              width: 205,
              render: (_, row) => (
                <div className="safety-cell">
                  <span>{row.impact}</span>
                  {row.planned_kg > 0 && (
                    <small>
                      涉及任务计划 {format(row.planned_kg / 1000)} 吨
                    </small>
                  )}
                  <small>交付影响待核实</small>
                </div>
              ),
            },
            {
              title: "处理人 / 要求反馈",
              key: "assignee",
              width: 175,
              render: (_, row) => (
                <div className="safety-cell">
                  <span>{row.assignee || "待指派"}</span>
                  <small className={row.overdue ? "safety-danger" : ""}>
                    {row.due_at
                      ? time(row.due_at) +
                        (row.overdue ? " · 已超时" : " 前反馈")
                      : "未设反馈时间"}
                  </small>
                </div>
              ),
            },
            {
              title: "等级 / 状态",
              key: "status",
              width: 145,
              render: (_, row) => (
                <div className="safety-cell">
                  <Tag
                    color={
                      ["紧急", "较高", "重要"].includes(row.severity)
                        ? "red"
                        : "default"
                    }
                  >
                    {row.severity}
                  </Tag>
                  <Pill>{row.status_label}</Pill>
                </div>
              ),
            },
            {
              title: "操作",
              key: "action",
              width: 130,
              fixed: "right",
              render: (_, row) => (
                <Button type="link" onClick={() => setDetail(row.id)}>
                  {row.stage === "pending" && a.can("alert.write")
                    ? "受理 / 查看"
                    : "查看 / 处理"}
                </Button>
              ),
            },
          ]}
        />
        <div className="safety-pagination">
          {pager(r.data, (page, pageSize) =>
            change({ ...query, page, pageSize }),
          )}
        </div>
      </section>
      {detail && (
        <IncidentDrawer
          key={detail}
          id={detail}
          onClose={() => setDetail(null)}
        />
      )}
      {form && (
        <EnergyForm
          config={form}
          onClose={() => setForm(null)}
          onDone={() => setBump((n) => n + 1)}
        />
      )}
      <EnergyAI />
    </div>
  );
}

export function MonitoringWorkspace() {
  const a = useApp(),
    [query, setQuery] = useState({
      q: "",
      owner: "",
      phase: "",
      risk: "",
      data: "",
      kind: "vehicle",
      stage: "all",
      page: 1,
      pageSize: 10,
    }),
    [draft, setDraft] = useState(query),
    [bump, setBump] = useState(0),
    r = useSafety("/api/safety/monitoring", query, bump),
    options = useSafety("/api/safety/options"),
    [selected, setSelected] = useState(null),
    [taskId, setTaskId] = useState(null),
    [taskPanel, setTaskPanel] = useState(null),
    [incident, setIncident] = useState(null),
    [form, setForm] = useState(null),
    [traceOpen, setTraceOpen] = useState(false),
    [trace, setTrace] = useState(null),
    [traceBusy, setTraceBusy] = useState(false),
    [traceError, setTraceError] = useState(""),
    [range, setRange] = useState({
      from: localTime(Date.now() - 86400000),
      to: localTime(Date.now()),
    }),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [mobileMap, setMobileMap] = useState(false),
    traceSeq = useRef(0),
    filtersRef = useRef(null),
    areaRef = useRef(null);
  useEffect(() => {
    const sync = () =>
      areaRef.current?.style.setProperty(
        "--safety-filter-height",
        filtersRef.current?.offsetHeight + "px",
      );
    const observer = new ResizeObserver(sync);
    if (filtersRef.current) observer.observe(filtersRef.current);
    sync();
    return () => observer.disconnect();
  }, []);
  const row = r.data?.items.find((x) => x.id === selected) || r.data?.items[0],
    tasks = row?.tasks || [],
    task = tasks.find((t) => t.id === taskId) || tasks[0],
    plan = row?.plans.find((p) => p.task_id === task?.id) || row?.plans[0];
  useEffect(() => {
    if (r.data && !r.data.items.some((x) => x.id === selected))
      setSelected(r.data.items[0]?.id || null);
  }, [r.data]);
  useEffect(() => {
    setTaskId(null);
    setTrace(null);
    setCursor(0);
    setPlaying(false);
    traceSeq.current++;
  }, [selected]);
  useEffect(() => {
    if (!playing || !trace?.items.length) return;
    const t = setInterval(
      () =>
        setCursor((c) => {
          if (c >= trace.items.length - 1) {
            setPlaying(false);
            return c;
          }
          return c + 1;
        }),
      650,
    );
    return () => clearInterval(t);
  }, [playing, trace]);
  useEffect(
    () => () => {
      traceSeq.current++;
    },
    [],
  );
  const choose = (k, v) => setDraft((d) => ({ ...d, [k]: v || "" }));
  const change = (q) => {
    setQuery(q);
    setDraft(q);
    setTrace(null);
    setPlaying(false);
  };
  async function loadTrace() {
    const ticket = ++traceSeq.current,
      id = row.id;
    setTraceBusy(true);
    setTraceError("");
    setPlaying(false);
    try {
      const result = await request(
        "/api/safety/trace/" +
          encodeURIComponent(id) +
          "?" +
          safetyParams({ from: iso(range.from), to: iso(range.to) }),
      );
      if (ticket === traceSeq.current) {
        setTrace(result);
        setCursor(0);
      }
    } catch (e) {
      if (ticket === traceSeq.current) setTraceError(e.message);
    } finally {
      if (ticket === traceSeq.current) setTraceBusy(false);
    }
  }
  const openTask = (id) => setTaskPanel({ id, mode: "detail" });
  return (
    <div className="safety-workspace safety-monitor-workspace" ref={areaRef}>
      <Heading title="运行监控" />
      <form
        ref={filtersRef}
        className="safety-filters"
        onSubmit={(e) => {
          e.preventDefault();
          change({ ...draft, page: 1 });
        }}
      >
        {filter(
          "关键词",
          <Input
            aria-label="监控关键词"
            placeholder="车牌 / 任务号 / 订单号"
            value={draft.q}
            onChange={(e) => choose("q", e.target.value)}
          />,
        )}
        {filter(
          "主体",
          <Select
            aria-label="监控主体"
            placeholder="全部主体"
            value={draft.owner || undefined}
            allowClear
            options={a.boot.organizations.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
            onChange={(v) => choose("owner", v)}
          />,
        )}
        {filter(
          "阶段",
          <Select
            aria-label="运输阶段"
            placeholder="全部阶段"
            value={draft.phase || undefined}
            allowClear
            options={["运输中", "补能中", "待反馈", "空闲"].map((v) => ({
              value: v,
              label: v,
            }))}
            onChange={(v) => choose("phase", v)}
          />,
        )}
        {filter(
          "风险",
          <Select
            aria-label="监控风险"
            placeholder="全部风险"
            value={draft.risk || undefined}
            allowClear
            options={["数据", "补能", "计划", "异常", "推演"].map((v) => ({
              value: v,
              label: v,
            }))}
            onChange={(v) => choose("risk", v)}
          />,
        )}
        {filter(
          "数据状态",
          <Select
            aria-label="监控数据状态"
            placeholder="全部状态"
            value={draft.data || undefined}
            allowClear
            options={[
              { value: "fresh", label: "有效采样" },
              { value: "stale", label: "延迟 / 待核实" },
            ]}
            onChange={(v) => choose("data", v)}
          />,
        )}
        <div className="safety-query-actions">
          <Button type="primary" htmlType="submit">
            查询
          </Button>
          <Button
            onClick={() =>
              change({
                q: "",
                owner: "",
                phase: "",
                risk: "",
                data: "",
                kind: query.kind,
                stage: "all",
                page: 1,
                pageSize: 10,
              })
            }
          >
            重置
          </Button>
        </div>
      </form>
      <ErrorLine error={r.error} retry={() => setBump((n) => n + 1)} />
      <div className="safety-monitor-tabs">
        <Tabs
          activeKey={query.stage}
          onChange={(stage) => change({ ...query, stage, page: 1 })}
          items={[
            ["all", "全部"],
            ["attention", "需关注"],
            ["transport", "运输中"],
            ["charging", "补能中"],
            ["waiting", "待反馈"],
          ]
            .filter(
              ([k]) =>
                query.kind === "vehicle" || ["all", "attention"].includes(k),
            )
            .map(([key, label]) => ({
              key,
              label: label + " " + (r.data?.counts[key] ?? "—"),
            }))}
        />
        <span className="safety-update">
          {time(r.data?.at)} · 测算资料
          <Button
            icon={<RefreshCw size={14} />}
            aria-label="刷新运行监控"
            onClick={() => setBump((n) => n + 1)}
          >
            刷新
          </Button>
        </span>
      </div>
      <div className="safety-map-switch">
        <Button onClick={() => setMobileMap((v) => !v)}>
          {mobileMap ? "收起地图" : "展开地图"}
        </Button>
      </div>
      <Spin spinning={r.busy}>
        <div
          className={
            "safety-monitor-grid" + (mobileMap ? " show-mobile-map" : "")
          }
        >
          <section className="safety-object-panel">
            <div className="safety-object-header">
              <b>
                {query.stage === "attention" ? "需关注对象" : "监控对象"}{" "}
                {r.data?.total || 0}
              </b>
              <Segmented
                size="small"
                value={query.kind}
                onChange={(kind) =>
                  change({
                    ...query,
                    kind,
                    phase: "",
                    data: "",
                    stage: "all",
                    page: 1,
                  })
                }
                options={[
                  { value: "vehicle", label: "车辆" },
                  { value: "station", label: "场站" },
                ]}
              />
            </div>
            <div className="safety-object-list">
              {r.data?.items.length ? (
                r.data.items.map((item) => (
                  <button
                    key={item.id}
                    className={
                      "safety-object" + (row?.id === item.id ? " selected" : "")
                    }
                    onClick={() => setSelected(item.id)}
                  >
                    <div>
                      <b>{item.code}</b>
                      <Tag color={item.attention ? "red" : "default"}>
                        {item.attention ? "需关注" : item.phase}
                      </Tag>
                    </div>
                    <small>
                      {item.driver_name || item.name} {item.tasks[0]?.code}
                    </small>
                    <p>{item.risks[0] || "暂无已识别风险"}</p>
                    <small>
                      {item.kind === "vehicle"
                        ? item.source_time
                          ? "采集 " + time(item.source_time)
                          : "采集时间待核实"
                        : item.status}
                    </small>
                  </button>
                ))
              ) : (
                <Empty
                  description={r.error ? "查询失败，点击重试" : "暂无匹配对象"}
                />
              )}
            </div>
            <div className="safety-object-pagination">
              {pager(r.data, (page, pageSize) =>
                change({ ...query, page, pageSize }),
              )}
            </div>
          </section>
          <SafetyMap
            rows={r.data?.items || []}
            selected={row?.id}
            onSelect={setSelected}
            trace={trace}
            cursor={cursor}
            orderId={task?.order_id}
            stationId={plan?.station_id}
          />
          <section className="safety-object-detail">
            {row ? (
              <>
                <div className="safety-selected-heading">
                  <h3>{row.code}</h3>
                  <Tag color={row.attention ? "red" : "blue"}>
                    {row.attention ? "需关注" : row.phase}
                  </Tag>
                </div>
                <p className="muted">
                  {row.driver_name || row.name} · {row.phase}
                </p>
                {tasks.length > 1 && (
                  <Select
                    aria-label="选中关联任务"
                    value={task?.id}
                    onChange={setTaskId}
                    options={tasks.map((t) => ({
                      value: t.id,
                      label: t.code + " · " + t.status,
                    }))}
                  />
                )}
                <section>
                  <h4>
                    当前任务
                    {tasks.length > 1 ? " · " + tasks.length + "个" : ""}
                  </h4>
                  {task ? (
                    <>
                      <dl>
                        <dt>任务号</dt>
                        <dd>
                          <Button type="link" onClick={() => openTask(task.id)}>
                            {task.code}
                          </Button>
                        </dd>
                        <dt>来源订单</dt>
                        <dd>
                          <Button
                            type="link"
                            onClick={() =>
                              a.showDetail("orders", task.order_id)
                            }
                          >
                            {task.order?.code || task.order_id}
                          </Button>
                        </dd>
                        <dt>货物 / 计划</dt>
                        <dd>
                          {task.order?.cargo || "货物待核实"} ·{" "}
                          {format(task.quantity_kg / 1000)} 吨
                        </dd>
                        <dt>已核验 / 余量</dt>
                        <dd>
                          {format(task.verified_kg / 1000)} /{" "}
                          {format(
                            Math.max(0, task.quantity_kg - task.verified_kg) /
                              1000,
                          )}{" "}
                          吨
                        </dd>
                        <dt>运输区间</dt>
                        <dd>
                          {task.order?.origin} → {task.order?.destination}
                        </dd>
                        <dt>要求完成</dt>
                        <dd>{time(task.finish_at)}</dd>
                        <dt>执行状态</dt>
                        <dd>{task.status}</dd>
                      </dl>
                      <div className="safety-action-links">
                        <Button onClick={() => openTask(task.id)}>
                          查看任务
                        </Button>
                        {row.kind === "vehicle" && (
                          <Button
                            onClick={() => {
                              setTraceOpen(true);
                              setTraceError("");
                            }}
                          >
                            轨迹回放
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="muted">暂无已派发的有效运输任务</p>
                  )}
                </section>
                {row.kind === "vehicle" ? (
                  <section>
                    <h4>车辆信息</h4>
                    <dl>
                      <dt>SOC</dt>
                      <dd>
                        {format(row.soc)}% · {time(row.source_time)}
                      </dd>
                      <dt>{row.position_label}</dt>
                      <dd>
                        {Number.isFinite(row.longitude) &&
                        Number.isFinite(row.latitude)
                          ? format(row.longitude, 5) +
                            ", " +
                            format(row.latitude, 5)
                          : "暂无有效坐标"}
                      </dd>
                      <dt>数据状态</dt>
                      <dd>
                        <Tag color={row.fresh ? "blue" : "gold"}>
                          {row.data_status}
                        </Tag>
                      </dd>
                    </dl>
                    <small className="muted">
                      时效参考窗口10分钟 · 测算采样
                    </small>
                    {!task && (
                      <Button onClick={() => setTraceOpen(true)}>
                        轨迹回放
                      </Button>
                    )}
                  </section>
                ) : (
                  <section>
                    <h4>场站工位</h4>
                    {row.devices.map((d) => (
                      <p key={d.id}>
                        {d.name} · {d.status} / {d.connection}
                      </p>
                    ))}
                    <Button
                      onClick={() => a.go("stations", { station_id: row.id })}
                    >
                      查看场站作业
                    </Button>
                  </section>
                )}
                <section>
                  <h4>补能安排 {row.plans.length}</h4>
                  {plan ? (
                    <>
                      <Button
                        type="link"
                        onClick={() =>
                          a.go("charging", {
                            task_id: plan.task_id,
                            station_id: plan.station_id,
                            plan_id: plan.id,
                          })
                        }
                      >
                        {plan.code}
                      </Button>
                      <p>
                        {plan.station_name} · {plan.station_mode}
                      </p>
                      <small>
                        {time(plan.start_at)}—{time(plan.finish_at)} ·{" "}
                        {plan.quantity_kwh} kWh
                      </small>
                      <p>
                        {plan.execution_status} {plan.risks.join("；")}
                      </p>
                      <Button
                        onClick={() =>
                          a.go("charging", {
                            task_id: task?.id,
                            station_id: plan.station_id,
                          })
                        }
                      >
                        查看补能安排
                      </Button>
                    </>
                  ) : (
                    <p className="muted">暂无有效补能安排</p>
                  )}
                </section>
                <section>
                  <h4>关联异常 {row.alerts.length}</h4>
                  {row.alerts.map((al) => (
                    <button
                      className="safety-alert-item"
                      key={al.id}
                      onClick={() => setIncident(al.id)}
                    >
                      <strong>{al.code}</strong>
                      <Pill>{al.status_label}</Pill>
                      <span>
                        {al.name} · {al.assignee || "待指派"}
                      </span>
                    </button>
                  ))}
                  {!row.alerts.length && (
                    <small className="muted">当前没有未关闭异常</small>
                  )}
                  {row.risks.length > 0 && (
                    <div className="safety-risk-notes">
                      {row.risks.map((s) => (
                        <p key={s}>{s}</p>
                      ))}
                    </div>
                  )}
                </section>
                {a.can("alert.write") && (
                  <Button
                    type="primary"
                    disabled={!options.data}
                    onClick={() =>
                      setForm(
                        incidentForm(a, options.data, {
                          owner_id: row.owner_id,
                          vehicle_id:
                            row.kind === "vehicle" ? row.id : undefined,
                          station_id:
                            row.kind === "station" ? row.id : undefined,
                          task_ids: task ? [task.id] : [],
                          plan_ids: plan ? [plan.id] : [],
                          report: row.risks.join("；"),
                        }),
                      )
                    }
                  >
                    登记异常
                  </Button>
                )}
                {trace && (
                  <div className="safety-trace-controls">
                    <Button
                      onClick={() => setPlaying((v) => !v)}
                      disabled={!trace.items.length}
                    >
                      {playing ? "暂停" : "播放采样"}
                    </Button>
                    <span>{time(trace.items[cursor]?.occurred_at)}</span>
                    <Slider
                      ariaLabelForHandle="监控轨迹时间轴"
                      min={0}
                      max={Math.max(0, trace.items.length - 1)}
                      value={cursor}
                      onChange={(v) => {
                        setCursor(v);
                        setPlaying(false);
                      }}
                    />
                    <Button onClick={() => setTrace(null)}>返回当前观察</Button>
                  </div>
                )}
              </>
            ) : (
              <Empty description="请选择监控对象" />
            )}
          </section>
        </div>
      </Spin>
      {traceOpen && (
        <Drawer
          open
          title="历史轨迹"
          width={720}
          onClose={() => setTraceOpen(false)}
        >
          <div className="safety-trace-filter">
            {filter(
              "开始",
              <Input
                aria-label="轨迹开始时间"
                type="datetime-local"
                value={range.from}
                onChange={(e) =>
                  setRange((x) => ({ ...x, from: e.target.value }))
                }
              />,
            )}
            {filter(
              "结束",
              <Input
                aria-label="轨迹结束时间"
                type="datetime-local"
                value={range.to}
                onChange={(e) =>
                  setRange((x) => ({ ...x, to: e.target.value }))
                }
              />,
            )}
            <Button type="primary" loading={traceBusy} onClick={loadTrace}>
              查询轨迹
            </Button>
          </div>
          <ErrorLine error={traceError} retry={loadTrace} />
          {trace && (
            <>
              <div className="safety-action-links">
                <Tag>测算采样 · 间隔超过10分钟断开</Tag>
                <Button
                  disabled={!trace.items.length}
                  onClick={() => {
                    setTraceOpen(false);
                    setCursor(0);
                    setPlaying(true);
                  }}
                >
                  地图回放
                </Button>
              </div>
              {trace.truncated && (
                <Alert
                  type="warning"
                  title="超过2000条采样，请缩小查询时间范围"
                />
              )}
              <Table
                rowKey="id"
                size="small"
                scroll={{ x: 600 }}
                dataSource={trace.items}
                pagination={{
                  defaultPageSize: 10,
                  pageSizeOptions: [10, 20, 50, 100],
                  showSizeChanger: true,
                }}
                columns={[
                  { title: "采集时间", dataIndex: "occurred_at", render: time },
                  {
                    title: "经度",
                    dataIndex: "longitude",
                    render: (v) => format(v, 5),
                  },
                  {
                    title: "纬度",
                    dataIndex: "latitude",
                    render: (v) => format(v, 5),
                  },
                  { title: "SOC", dataIndex: "soc", render: (v) => v + "%" },
                  {
                    title: "速度",
                    dataIndex: "speed_kmh",
                    render: (v) => v + " km/h",
                  },
                ]}
              />
              <h4>实际节点反馈</h4>
              <Table
                rowKey="id"
                size="small"
                dataSource={trace.events}
                pagination={{ defaultPageSize: 10 }}
                columns={[
                  { title: "事件", dataIndex: "kind" },
                  { title: "发生时间", dataIndex: "occurred_at", render: time },
                  { title: "接收时间", dataIndex: "received_at", render: time },
                ]}
              />
            </>
          )}
        </Drawer>
      )}
      {taskPanel && (
        <TaskPanel
          id={taskPanel.id}
          mode={taskPanel.mode}
          onMode={(mode) => setTaskPanel((p) => ({ ...p, mode }))}
          onClose={() => setTaskPanel(null)}
        />
      )}
      {incident && (
        <IncidentDrawer id={incident} onClose={() => setIncident(null)} />
      )}
      {form && <EnergyForm config={form} onClose={() => setForm(null)} />}
      <EnergyAI />
    </div>
  );
}
