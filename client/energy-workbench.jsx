import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Select,
  Table,
  Tabs,
  Segmented,
  Alert,
  Empty,
  Descriptions,
  Drawer,
  Spin,
  Tag,
} from "antd";
import { Search, RotateCcw, Plus, Info, RefreshCw } from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Card, DataTable, format, time, money, col, Pill } from "./ui";
import {
  EnergyForm,
  ChargingPanel,
  EnergySourcePanel,
  EnergyAI,
  field,
  localTime,
  iso,
} from "./energy-panels";
import "./energy-workbench.css";

const qs = (q) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(q).filter(([, v]) => v !== "" && v != null),
    ),
  ).toString();
const options = (rows = [], label = (r) => r.name || r.code) =>
  rows.map((r) => ({ value: r.id, label: label(r) }));
const defaultStation = (boot) =>
  [...(boot.stations || [])].sort(
    (a, b) =>
      (boot.charging || []).filter((p) => p.station_id === b.id).length -
        (boot.charging || []).filter((p) => p.station_id === a.id).length ||
      a.code.localeCompare(b.code),
  )[0]?.id || "";
function useRead(path, q) {
  const a = useApp(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    setError("");
    request(path + (qs(q) ? "?" + qs(q) : ""))
      .then((r) => {
        if (n === seq.current) setData(r);
      })
      .catch((e) => {
        if (n === seq.current) setError(e.message);
      })
      .finally(() => {
        if (n === seq.current) setLoading(false);
      });
    return () => seq.current++;
  }, [path, JSON.stringify(q), tick, a.revision]);
  return { data, error, loading, reload: () => setTick((n) => n + 1) };
}
function useOptions() {
  const a = useApp();
  return useRead("/api/energy-workspace/options", {}).data || a.boot;
}
const defaultQuery = () => ({
  q: "",
  station: "",
  date: "",
  mode: "",
  status: "",
  stage: "all",
  page: 1,
  pageSize: 10,
  task: "",
  order: "",
});
function Filters({
  draft,
  setDraft,
  stations,
  submit,
  reset,
  kind = "charging",
  devices = [],
}) {
  const change = (key, value) =>
    setDraft((s) => ({ ...s, [key]: value || "" }));
  return (
    <form
      className="energy-filters"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {kind !== "analysis" && (
        <label className="energy-filter-keyword">
          <span>关键词</span>
          <Input
            aria-label="能源关键词"
            placeholder={
              kind === "charging"
                ? "车牌 / 任务号 / 订单号"
                : "车牌 / 计划号 / 任务号"
            }
            prefix={<Search size={15} />}
            value={draft.q}
            onChange={(e) => change("q", e.target.value)}
            allowClear
          />
        </label>
      )}
      <label>
        <span>场站</span>
        <Select
          aria-label="能源场站"
          value={draft.station || undefined}
          placeholder="全部场站"
          allowClear={kind === "charging"}
          options={options(stations)}
          onChange={(v) => {
            change("station", v);
            change("device", "");
          }}
        />
      </label>
      <label>
        <span>{kind === "station" ? "作业日期" : "日期"}</span>
        <Input
          aria-label="能源日期"
          type="date"
          value={draft.date || ""}
          onChange={(e) => change("date", e.target.value)}
        />
      </label>
      {kind === "charging" && (
        <label>
          <span>方式</span>
          <Select
            aria-label="补能方式"
            value={draft.mode || undefined}
            placeholder="全部方式"
            allowClear
            options={["充电", "换电"].map((v) => ({ value: v, label: v }))}
            onChange={(v) => change("mode", v)}
          />
        </label>
      )}
      {kind === "charging" && (
        <label>
          <span>状态</span>
          <Select
            aria-label="补能计划状态"
            value={draft.status || undefined}
            placeholder="全部状态"
            allowClear
            options={["草稿", "待确认", "已确认", "待调整", "已取消"].map(
              (v) => ({ value: v, label: v }),
            )}
            onChange={(v) => change("status", v)}
          />
        </label>
      )}
      {kind === "analysis" && (
        <label>
          <span>计量对象</span>
          <Select
            aria-label="能源计量对象"
            value={draft.device || ""}
            options={[
              { value: "", label: "场站独立总表" },
              ...options(devices),
            ]}
            onChange={(v) => change("device", v)}
          />
        </label>
      )}
      <div className="energy-query-actions">
        <Button type="primary" htmlType="submit">
          查询
        </Button>
        <Button icon={<RotateCcw size={15} />} onClick={reset}>
          重置
        </Button>
      </div>
    </form>
  );
}
const pager = (data, query, setQuery) => ({
  current: query.page,
  pageSize: query.pageSize,
  total: data?.total || 0,
  pageSizeOptions: [10, 20, 50, 100],
  showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
  onChange: (page, pageSize) => setQuery((q) => ({ ...q, page, pageSize })),
});
function TransportLinks({ row }) {
  const a = useApp();
  return (
    <div className="energy-cell-stack">
      {row.task_id ? (
        <button
          className="inline-link"
          onClick={() => a.showDetail("tasks", row.task_id)}
        >
          {row.task_code || row.task_id}
        </button>
      ) : (
        <span className="muted">临时安排</span>
      )}
      {row.order_id && (
        <button
          className="inline-link secondary"
          onClick={() => a.showDetail("orders", row.order_id)}
        >
          {row.order_code}
        </button>
      )}
    </div>
  );
}

export function ChargingWorkspace() {
  const a = useApp(),
    lookup = useOptions(),
    params = new URLSearchParams(location.hash.split("?")[1] || "");
  const [query, setQuery] = useState(() => ({
      ...defaultQuery(),
      ...(a.transportQueries.charging || {}),
      owner: a.intentDraft?.owner_id || params.get('owner') || '',
      stage: a.intentDraft?.stage || params.get('stage') || 'all',
      task: a.intentDraft?.task_id || params.get("task") || "",
      order: a.intentDraft?.order_id || params.get("order") || "",
      station: a.intentDraft?.station_id || params.get("station") || "",
      date: a.intentDraft?.date || params.get("date") || "",
    })),
    [draft, setDraft] = useState(query),
    [view, setView] = useState("list"),
    [selected, setSelected] = useState([]),
    [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "plan",
    );
    if (p) setDetail(p);
  }, [location.hash]);
  const { data, error, loading, reload } = useRead(
    "/api/energy-workspace/charging",
    query,
  );
  useEffect(() => setSelected([]), [JSON.stringify(query)]);
  useEffect(() => {
    if (data)
      setSelected((keys) =>
        keys.filter((id) =>
          data.items.some(
            (r) =>
              r.id === id &&
              !r.visit &&
              !r.sessions.length &&
              r.stage !== "ended",
          ),
        ),
      );
  }, [data]);
  const apply = (q) => {
    setQuery(q);
    setSelected([]);
    a.setTransportQueries((v) => ({ ...v, charging: q }));
    reload();
  };
  useEffect(() => {
    const p = new URLSearchParams(location.hash.split("?")[1] || "");
    const task = a.intentDraft?.task_id || p.get("task"),
      order = a.intentDraft?.order_id || p.get("order"),
      station = a.intentDraft?.station_id || p.get("station"),
      date = a.intentDraft?.date || p.get("date");
    if (task || order || station || date) {
      const q = {
        ...defaultQuery(),
        task: task || "",
        order: order || "",
        station: station || "",
        date: date || "",
      };
      setDraft(q);
      apply(q);
    }
  }, [a.intentDraft]);
  function edit(row = null) {
    setDetail(null);
    const taskOptions = (lookup.tasks || []).filter(
      (t) => !["已取消", "余量已终止", "已完成"].includes(t.status),
    );
    setForm({
      title: row ? "调整补能安排" : "新增补能安排",
      row,
      resource: "charging",
      summary: row
        ? `${row.code} · ${row.vehicle_code} · ${row.task_code || "临时安排"}`
        : null,
      initial: row
        ? {
            task_id: row.task_id || undefined,
            vehicle_id: row.vehicle_id,
            station_id: row.station_id,
            arrival_at: localTime(row.arrival_at),
            finish_at: row.finish_at ? localTime(row.finish_at) : "",
            quantity_kwh: row.quantity_kwh,
          }
        : { arrival_at: localTime(Date.now() + 3600000), quantity_kwh: 120 },
      onChange: (changed, all, f) => {
        if ("task_id" in changed) {
          const t = taskOptions.find((t) => t.id === changed.task_id);
          f.setFieldValue("vehicle_id", t?.vehicle_id);
          f.setFieldValue("station_id", undefined);
        }
        if ("vehicle_id" in changed) f.setFieldValue("station_id", undefined);
      },
      fields: (v) => {
        const task = taskOptions.find((t) => t.id === v.task_id),
          vehicle = (lookup.vehicles || []).find((x) => x.id === v.vehicle_id);
        return [
          ...(!row
            ? [
                field("task_id", "关联运输任务", "select", {
                  required: false,
                  options: options(taskOptions, (r) => r.code),
                }),
                field("vehicle_id", "关联车辆", "select", {
                  options: options(
                    (lookup.vehicles || []).filter(
                      (r) =>
                        (!task || r.id === task.vehicle_id) &&
                        !["停用", "检修"].includes(r.status),
                    ),
                    (r) => r.code,
                  ),
                }),
              ]
            : []),
          field("station_id", "补能场站", "select", {
            options: options(
              (lookup.stations || []).filter(
                (s) =>
                  s.status === "运营中" &&
                  (!vehicle ||
                    (s.owner_id === vehicle.owner_id &&
                      s.compatibility === vehicle.compatibility)),
              ),
            ),
          }),
          field("arrival_at", "预计到站", "datetime"),
          field("finish_at", "预计服务结束", "datetime", { required: false }),
          field("quantity_kwh", "预计补能量（kWh）", "number", {
            min: 1,
            max: 1000,
          }),
          ...(row ? [field("reason", "调整原因", "textarea")] : []),
        ];
      },
      submit: (v, version, key) =>
        a.execute(
          row ? "charging.review" : "charging.create",
          row?.id,
          {
            ...v,
            arrival_at: iso(v.arrival_at),
            finish_at: iso(v.finish_at),
            expected_version: version,
          },
          key,
        ),
    });
  }
  const arrive = (row) => {
    setDetail(null);
    setForm(arriveForm(a, row));
  };
  function confirm(row) {
    setForm({
      title: "确认补能安排",
      row,
      resource: "charging",
      summary: `${row.vehicle_code} · ${row.station_name} · ${time(row.arrival_at)}`,
      confirm: "确认此内部补能安排？请核对运输时限及现场资源。",
      initial: {},
      fields: [field("evidence", "确认依据", "textarea")],
      submit: (v, version, key) =>
        a.execute(
          "charging.confirm",
          row.id,
          { ...v, expected_version: version },
          key,
        ),
    });
  }
  function cancel(row) {
    setForm({
      title: "取消补能安排",
      row,
      resource: "charging",
      confirm: "取消尚未执行的安排？原记录将保留。",
      fields: [field("reason", "取消原因", "textarea")],
      submit: (v, version, key) =>
        a.execute(
          "charging.cancel",
          row.id,
          { ...v, expected_version: version },
          key,
        ),
    });
  }
  async function optimize() {
    setBusy(true);
    setActionError("");
    try {
      const r = await a.execute("charging.optimize-scoped", null, {
        ...query,
        plan_ids: selected.length ? selected : undefined,
      });
      a.showDetail("charging-optimizations", r.id);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const columns = [
    col(
      "车辆 / 司机",
      "vehicle_code",
      (v, r) => (
        <div className="energy-cell-stack">
          <strong>{v}</strong>
          <small>{r.driver_name || "待核实"}</small>
        </div>
      ),
      { width: 150 },
    ),
    col("来源任务 / 订单", "task_id", (_, r) => <TransportLinks row={r} />, {
      width: 180,
    }),
    col(
      "补能安排",
      "station_name",
      (v, r) => (
        <div className="energy-cell-stack">
          <button className="inline-link" onClick={() => setDetail(r.id)}>
            {v}
          </button>
          <small>{r.code}</small>
        </div>
      ),
      { width: 190 },
    ),
    col(
      "到站 / 服务时段",
      "arrival_at",
      (v, r) => (
        <div className="energy-cell-stack">
          <span>预计 {time(v)}</span>
          <small>
            {time(r.start_at)} — {time(r.finish_at)}
            {r.time_reference ? "（参考）" : ""}
          </small>
        </div>
      ),
      { width: 210 },
    ),
    col(
      "补能需求",
      "quantity_kwh",
      (v, r) => (
        <div className="energy-cell-stack">
          <span>
            {r.station_mode === "换电"
              ? `换电 · ${format(r.capacity_kwh)} kWh规格`
              : `充电 ${format(v)} kWh`}
          </span>
          <small>
            {r.wait_minutes == null
              ? "等待待测算"
              : `预计等待 ${format(r.wait_minutes)} 分钟`}
          </small>
        </div>
      ),
      { width: 180 },
    ),
    col(
      "运输约束",
      "task_finish_at",
      (v) => (v ? <span>{time(v)} 前完成任务</span> : "无关联任务"),
      { width: 170 },
    ),
    col(
      "状态 / 风险",
      "status",
      (_, r) => (
        <div className="energy-cell-stack">
          <Pill>
            {r.stage === "ended" && r.status !== "已取消"
              ? "作业已结束"
              : r.status}
          </Pill>
          {r.risks.map((s) => (
            <small className="energy-warning" key={s}>
              {s}
            </small>
          ))}
          <small>{r.execution_status}</small>
        </div>
      ),
      { width: 175 },
    ),
    col(
      "操作",
      "id",
      (_, r) => (
        <div className="energy-row-actions">
          <Button type="link" size="small" onClick={() => setDetail(r.id)}>
            查看
          </Button>
          {a.can("charging.write") &&
            !r.visit &&
            !r.sessions.length &&
            r.status !== "已取消" && (
              <>
                {["草稿", "待确认"].includes(r.status) && !r.risks.length && (
                  <Button type="link" size="small" onClick={() => confirm(r)}>
                    确认
                  </Button>
                )}
                <Button type="link" size="small" onClick={() => edit(r)}>
                  调整
                </Button>
                <Button type="link" size="small" onClick={() => cancel(r)}>
                  取消
                </Button>
              </>
            )}
          {a.can("session.write") &&
            r.status === "已确认" &&
            !r.visit &&
            !r.sessions.length && (
              <Button type="link" size="small" onClick={() => arrive(r)}>
                到站
              </Button>
            )}
        </div>
      ),
      { width: 220, fixed: "right" },
    ),
  ];
  return (
    <div className="energy-workspace">
      <Heading title="补能调度" />
      {query.owner&&<div style={{marginBottom:12}}><Tag closable onClose={()=>{const next={...query,owner:'',page:1};setDraft(next);apply(next);const p=new URLSearchParams(location.hash.split('?')[1]||'');p.delete('owner');history.replaceState(null,'','#charging?'+p);}}>主体：{a.boot.organizations.find(o=>o.id===query.owner)?.name||query.owner}</Tag></div>}
      <Filters
        draft={draft}
        setDraft={setDraft}
        stations={lookup.stations}
        submit={() => apply({ ...draft, stage: "all", page: 1 })}
        reset={() => {
          const q = defaultQuery();
          setDraft(q);
          apply(q);
        }}
      />
      {(query.task || query.order) && (
        <Alert
          type="info"
          title={`正在查看${query.task ? "指定运输任务" : "指定订单"}的补能安排`}
          action={
            <Button
              size="small"
              onClick={() => {
                const q = defaultQuery();
                setDraft(q);
                apply(q);
                history.replaceState(null, "", "#charging");
              }}
            >
              查看全部
            </Button>
          }
        />
      )}
      {(error || actionError) && (
        <Alert type="error" title={error || actionError} />
      )}
      <Card>
        <div className="energy-tabs-bar">
          <Tabs
            activeKey={query.stage}
            onChange={(stage) => {
              setDraft((d) => ({ ...d, status: "" }));
              apply({ ...query, status: "", stage, page: 1 });
            }}
            items={[
              ["all", "全部"],
              ["pending", "待确认"],
              ["arranged", "已安排"],
              ["risk", "需调整"],
              ["ended", "已结束"],
            ].map(([key, label]) => ({
              key,
              label: `${label} ${data?.counts?.[key] ?? 0}`,
            }))}
          />
          <Segmented
            aria-label="补能查看方式"
            value={view}
            options={[
              { label: "列表", value: "list" },
              { label: "排程", value: "schedule" },
            ]}
            onChange={(v) => {
              setView(v);
              setSelected([]);
            }}
          />
        </div>
        <div className="energy-toolbar">
          <span className="muted">
            {selected.length
              ? `已选 ${selected.length} 条`
              : `关联任务 ${data?.linked_count || 0} 条 · 临时安排 ${data?.temporary_count || 0} 条`}
          </span>
          <div className="energy-inline-actions">
            <Button
              loading={busy}
              disabled={
                !a.can("forecast.run") ||
                busy ||
                !data?.total ||
                query.stage === "ended"
              }
              onClick={optimize}
            >
              优化补能
            </Button>
            {a.can("charging.write") && (
              <Button
                type="primary"
                icon={<Plus size={16} />}
                onClick={() => edit()}
              >
                新增安排
              </Button>
            )}
          </div>
        </div>
        {view === "list" ? (
          <Table
            className="energy-plan-table"
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data?.items || []}
            scroll={{ x: 1500 }}
            pagination={pager(data, query, setQuery)}
            rowSelection={
              a.can("charging.write")
                ? {
                    selectedRowKeys: selected,
                    onChange: setSelected,
                    getCheckboxProps: (r) => ({
                      disabled:
                        !!r.visit || !!r.sessions.length || r.stage === "ended",
                    }),
                  }
                : undefined
            }
          />
        ) : (
          <PlanSchedule rows={data?.items || []} onOpen={setDetail} />
        )}
        {view === "schedule" && (
          <Table
            className="energy-schedule-pagination"
            columns={[]}
            dataSource={[]}
            pagination={pager(data, query, setQuery)}
            locale={{ emptyText: null }}
          />
        )}
      </Card>
      <EnergyAI />
      {detail && (
        <ChargingPanel
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={edit}
          onArrive={arrive}
        />
      )}{" "}
      {form && (
        <EnergyForm
          config={form}
          onClose={() => setForm(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}
function PlanSchedule({ rows, onOpen }) {
  if (!rows.length) return <Empty description="当前页没有补能安排" />;
  const start = Math.min(
      ...rows.map((r) => +new Date(r.start_at || r.arrival_at)),
    ),
    end = Math.max(
      ...rows.map(
        (r) =>
          +new Date(
            r.finish_at ||
              new Date(+new Date(r.arrival_at) + 3600000).toISOString(),
          ),
      ),
    ),
    range = Math.max(3600000, end - start);
  return (
    <div className="energy-schedule">
      <div className="energy-schedule-axis">
        <span>当前页计划服务时段 · {time(new Date(start))}</span>
        <span>{time(new Date(end))}</span>
      </div>
      {rows.map((r) => (
        <div className="energy-schedule-row" key={r.id}>
          <span>
            {r.vehicle_code}
            <small>{r.station_name}</small>
          </span>
          <div>
            <button
              style={{
                left: ((+new Date(r.start_at) - start) / range) * 100 + "%",
                width:
                  Math.max(
                    5,
                    ((+new Date(
                      r.finish_at ||
                        new Date(
                          +new Date(r.arrival_at) + 3600000,
                        ).toISOString(),
                    ) -
                      +new Date(r.start_at)) /
                      range) *
                      100,
                  ) + "%",
              }}
              onClick={() => onOpen(r.id)}
            >
              {r.code}
              {r.time_reference ? " · 参考" : ""}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function arriveForm(a, row) {
  return {
    title: "登记到站",
    row,
    resource: "charging",
    summary: `${row.vehicle_code} · ${row.station_name} · ${row.task_code || "临时安排"}`,
    initial: { arrived_at: localTime() },
    fields: [
      field("arrived_at", "实际到站时间", "datetime"),
      field("evidence", "到站依据", "textarea"),
    ],
    submit: (v, version, key) =>
      a.execute(
        "station.arrive",
        null,
        {
          ...v,
          arrived_at: iso(v.arrived_at),
          plan_id: row.id,
          expected_version: version,
        },
        key,
      ),
  };
}

export function StationWorkspace() {
  const a = useApp(),
    lookup = useOptions(),
    [query, setQuery] = useState({
      q: "",
      station:
        new URLSearchParams(location.hash.split("?")[1] || "").get("station") ||
        defaultStation(a.boot),
      date: "",
      stage: "all",
      page: 1,
      pageSize: 10,
    }),
    [draft, setDraft] = useState(query),
    [tab, setTab] = useState("live"),
    [form, setForm] = useState(null),
    [detail, setDetail] = useState(null),
    [actual, setActual] = useState(null);
  const { data, error, loading, reload } = useRead(
    tab === "live"
      ? "/api/energy-workspace/station"
      : "/api/energy-workspace/sessions",
    query,
  );
  const devices =
    data?.devices ||
    (lookup.devices || []).filter((d) => d.station_id === query.station);
  const reset = () => {
    const q = {
      q: "",
      station: defaultStation(a.boot),
      date: "",
      stage: "all",
      page: 1,
      pageSize: 10,
    };
    setDraft(q);
    setQuery(q);
    reload();
  };
  function temporary() {
    setForm({
      title: "临时到站",
      initial: { station_id: query.station, arrived_at: localTime() },
      fields: [
        field("station_id", "到站场站", "select", {
          options: options(lookup.stations),
        }),
        field("vehicle_id", "到站车辆", "select", {
          options: options(lookup.vehicles, (r) => r.code),
        }),
        field("arrived_at", "实际到站时间", "datetime"),
        field("evidence", "临时到站原因", "textarea"),
      ],
      submit: (v, _, key) =>
        a.execute(
          "station.arrive",
          null,
          { ...v, arrived_at: iso(v.arrived_at) },
          key,
        ),
    });
  }
  function manual() {
    setForm({
      title: "补录实际作业",
      initial: {
        station_id: query.station,
        start_at: localTime(Date.now() - 3600000),
        finish_at: localTime(),
        included: "电费及服务费",
      },
      onChange: (changed, all, f) => {
        if ("station_id" in changed) {
          f.setFieldValue("device_id", undefined);
          f.setFieldValue("plan_id", undefined);
        }
        if ("vehicle_id" in changed) {
          f.setFieldValue("task_id", undefined);
          f.setFieldValue("plan_id", undefined);
        }
      },
      fields: (v) => {
        const station = (lookup.stations || []).find(
            (s) => s.id === v.station_id,
          ),
          swap = station?.mode === "换电";
        return [
          field("station_id", "关联场站", "select", {
            options: options(lookup.stations),
          }),
          field("vehicle_id", "关联车辆", "select", {
            options: options(
              (lookup.vehicles || []).filter(
                (x) => !station || x.owner_id === station.owner_id,
              ),
              (r) => r.code,
            ),
          }),
          field("task_id", "关联任务", "select", {
            required: false,
            options: options(
              (lookup.tasks || []).filter((t) => t.vehicle_id === v.vehicle_id),
              (r) => r.code,
            ),
          }),
          field("plan_id", "关联补能计划", "select", {
            required: false,
            options: options(
              (a.boot.charging || []).filter(
                (p) =>
                  p.station_id === v.station_id &&
                  p.vehicle_id === v.vehicle_id,
              ),
              (r) => r.code,
            ),
          }),
          field("device_id", "作业工位", "select", {
            options: options(
              (lookup.devices || []).filter(
                (d) => d.station_id === v.station_id,
              ),
            ),
          }),
          field("start_at", "实际开始", "datetime"),
          field("finish_at", "实际结束", "datetime"),
          field("quantity_kwh", "计量电量（kWh）", "number", {
            min: 0.1,
            max: 10000,
          }),
          field("amount", "来源金额（元）", "number"),
          field("included", "已包含费用项"),
          ...(swap
            ? [
                field("incoming_battery", "换入电池", "select", {
                  options: options(
                    (lookup.assets || []).filter(
                      (b) =>
                        b.kind === "电池" &&
                        b.available &&
                        b.station_id === v.station_id,
                    ),
                  ),
                }),
                field("outgoing_battery", "换出电池", "select", {
                  options: options(
                    (lookup.assets || []).filter(
                      (b) => b.kind === "电池" && b.vehicle_id === v.vehicle_id,
                    ),
                  ),
                }),
              ]
            : []),
          field("evidence", "计量或换电凭证", "textarea"),
        ];
      },
      submit: (v, _, key) =>
        a.execute(
          "session.create",
          null,
          { ...v, start_at: iso(v.start_at), finish_at: iso(v.finish_at) },
          key,
        ),
    });
  }
  function reportDevice(d) {
    setForm({
      title: "报告场站设备异常",
      summary: d.name,
      fields: [
        field("reason", "异常情况", "textarea"),
        field("evidence", "现场依据", "textarea"),
      ],
      submit: (v, _, key) =>
        a.execute("station.alert", null, { ...v, device_id: d.id }, key),
    });
  }
  function start(row) {
    setForm({
      title: "安排工位并开始作业",
      row,
      resource: "station-visits",
      refreshDevice: true,
      summary: `${row.vehicle_code} · ${row.plan_code || "临时到站"}`,
      initial: {
        start_at: localTime(),
        release_at: localTime(Date.now() + 40 * 60000),
      },
      fields: [
        field("device_id", "作业工位", "select", {
          options: options(
            devices.filter(
              (d) =>
                d.station_id === row.station_id &&
                d.connection === "在线" &&
                d.status === "空闲" &&
                !d.managed_visit_id,
            ),
            (d) => d.name,
          ),
        }),
        field("start_at", "实际开始时间", "datetime"),
        field("release_at", "预计释放时间", "datetime"),
      ],
      submit: (v, version, key, dependencies) =>
        a.execute(
          "station.start",
          row.id,
          {
            ...v,
            start_at: iso(v.start_at),
            release_at: iso(v.release_at),
            device_version:
              dependencies[v.device_id] ??
              devices.find((d) => d.id === v.device_id)?.version,
            expected_version: version,
          },
          key,
        ),
    });
  }
  function finish(row) {
    const station = (lookup.stations || []).find(
        (s) => s.id === row.station_id,
      ),
      swap = station?.mode === "换电";
    setForm({
      title: "登记作业结束",
      row,
      resource: "station-visits",
      summary: `${row.vehicle_code} · ${row.device_id}`,
      initial: { finish_at: localTime(), included: "电费及服务费" },
      fields: [
        field("finish_at", "实际结束时间", "datetime"),
        field("quantity_kwh", "实际计量电量（kWh）", "number", {
          min: 0.1,
          max: 10000,
        }),
        field("amount", "来源金额（元）", "number", { min: 0 }),
        field("included", "已包含费用项"),
        ...(swap
          ? [
              field("incoming_battery", "换入电池", "select", {
                options: options(
                  (lookup.assets || []).filter(
                    (b) =>
                      b.kind === "电池" &&
                      b.available &&
                      b.station_id === row.station_id,
                  ),
                ),
              }),
              field("outgoing_battery", "换出电池", "select", {
                options: options(
                  (lookup.assets || []).filter(
                    (b) => b.kind === "电池" && b.vehicle_id === row.vehicle_id,
                  ),
                ),
              }),
            ]
          : []),
        field("evidence", "计量或换电凭证", "textarea"),
      ],
      submit: (v, version, key) =>
        a.execute(
          "station.finish",
          row.id,
          { ...v, finish_at: iso(v.finish_at), expected_version: version },
          key,
        ),
    });
  }
  function verify(session) {
    setForm({
      title: "核验补能作业",
      row: session,
      resource: "sessions",
      summary: `${session.code} · ${format(session.quantity_kwh)} kWh · ${money(session.amount_cents)}`,
      confirm: "确认计量、金额及凭证一致？此操作不会完成运输任务。",
      fields: [field("evidence", "核验依据", "textarea")],
      submit: (v, version, key) =>
        a.execute(
          "session.verify",
          session.id,
          { ...v, expected_version: version },
          key,
        ),
    });
  }
  function cancelVisit(row) {
    setForm({
      title: "取消待服务到站",
      row,
      resource: "station-visits",
      fields: [field("reason", "取消原因", "textarea")],
      confirm: "取消本次未开工作业？补能计划和历史到站记录仍保留。",
      submit: (v, version, key) =>
        a.execute(
          "station.cancel",
          row.id,
          { ...v, expected_version: version },
          key,
        ),
    });
  }
  const liveCols = [
    col(
      "车辆 / 司机",
      "vehicle_code",
      (v, r) => (
        <div className="energy-cell-stack">
          <strong>{v}</strong>
          <small>{r.driver_name}</small>
        </div>
      ),
      { width: 145 },
    ),
    col(
      "关联计划 / 任务",
      "plan_id",
      (_, r) => (
        <div className="energy-cell-stack">
          {r.plan_id ? (
            <button
              className="inline-link"
              onClick={() => setDetail(r.plan_id)}
            >
              {r.plan_code}
            </button>
          ) : (
            <small>临时到站</small>
          )}
          <TransportLinks row={r} />
        </div>
      ),
      { width: 190 },
    ),
    col(
      "到站 / 开始",
      "arrived_at",
      (_, r) => (
        <div className="energy-cell-stack">
          <span>
            {r.kind === "plan" ? "预计 " : "到站 "}
            {time(r.arrived_at || r.arrival_at)}
          </span>
          <small>
            {r.start_at && r.kind !== "plan"
              ? "开始 " + time(r.start_at)
              : "尚未开工"}
          </small>
        </div>
      ),
      { width: 180 },
    ),
    col(
      "工位 / 方式",
      "device_id",
      (v, r) => (
        <div className="energy-cell-stack">
          <span>
            {(lookup.devices || []).find((d) => d.id === v)?.name || "尚未分配"}
          </span>
          <small>
            {r.station_mode ||
              (lookup.stations || []).find((s) => s.id === r.station_id)?.mode}
          </small>
        </div>
      ),
      { width: 130 },
    ),
    col(
      "计划 / 实际",
      "quantity_kwh",
      (_, r) => (
        <div className="energy-cell-stack">
          <span>
            计划 {r.quantity_kwh ? format(r.quantity_kwh) + " kWh" : "待核实"}
          </span>
          <small>
            {r.actual_kwh != null
              ? "实际 " + format(r.actual_kwh) + " kWh"
              : r.execution_status === "补能中"
                ? "计量结果待结束登记"
                : r.task_finish_at
                  ? time(r.task_finish_at) + " 前完成运输"
                  : "—"}
          </small>
        </div>
      ),
      { width: 175 },
    ),
    col("状态", "execution_status", (v) => <Pill>{v}</Pill>, { width: 110 }),
    col(
      "操作",
      "id",
      (_, r) => (
        <div className="energy-row-actions">
          {r.kind === "plan" ? (
            <>
              {a.can("session.write") && (
                <Button type="link" onClick={() => setForm(arriveForm(a, r))}>
                  登记到站
                </Button>
              )}
              <Button type="link" onClick={() => setDetail(r.id)}>
                查看安排
              </Button>
            </>
          ) : (
            <>
              {a.can("session.write") && r.status === "待服务" && (
                <>
                  <Button type="link" onClick={() => start(r)}>
                    安排工位
                  </Button>
                  <Button type="link" onClick={() => cancelVisit(r)}>
                    取消到站
                  </Button>
                </>
              )}
              {a.can("session.write") && r.status === "补能中" && (
                <Button type="link" onClick={() => finish(r)}>
                  登记结束
                </Button>
              )}
              {r.session_id && (
                <>
                  {a.can("session.verify") && r.status === "待核验" && (
                    <Button
                      type="link"
                      onClick={() => {
                        const s = r.sessions?.find(
                          (s) => s.id === r.session_id,
                        );
                        if (s) verify(s);
                        else
                          request("/api/resources/sessions/" + r.session_id)
                            .then(verify)
                            .catch((e) => a.message.error(e.message));
                      }}
                    >
                      核验
                    </Button>
                  )}
                  <Button
                    type="link"
                    onClick={() => a.showDetail("sessions", r.session_id)}
                  >
                    作业凭证
                  </Button>
                </>
              )}
              {!r.session_id && (
                <Button type="link" onClick={() => setActual(r)}>
                  查看
                </Button>
              )}
            </>
          )}
        </div>
      ),
      { width: 190, fixed: "right" },
    ),
  ];
  const historyCols = [
    col("作业 / 车辆", "code", (v, r) => (
      <div className="energy-cell-stack">
        <strong>{v}</strong>
        <small>{r.vehicle_code}</small>
      </div>
    )),
    col("计划 / 任务", "plan_code", (_, r) => (
      <div className="energy-cell-stack">
        <span>{r.plan_code || "历史独立作业"}</span>
        <span>{r.task_code || "—"}</span>
      </div>
    )),
    col("场站", "station_name"),
    col("实际时段", "start_at", (v, r) => `${time(v)} — ${time(r.finish_at)}`),
    col("电量 / 金额", "quantity_kwh", (v, r) => (
      <div className="energy-cell-stack">
        <span>{format(v)} kWh</span>
        <small>{money(r.amount_cents)}</small>
      </div>
    )),
    col("状态", "status", (v) => <Pill>{v}</Pill>),
    col("操作", "id", (_, r) => (
      <div className="energy-row-actions">
        {a.can("session.verify") && r.status === "待核验" && (
          <Button type="link" onClick={() => verify(r)}>
            核验
          </Button>
        )}
        <Button type="link" onClick={() => a.showDetail("sessions", r.id)}>
          查看凭证
        </Button>
      </div>
    )),
  ];
  return (
    <div className="energy-workspace">
      <Heading title="场站作业" />
      <Filters
        kind="station"
        draft={draft}
        setDraft={setDraft}
        stations={lookup.stations}
        submit={() => {
          setQuery({ ...draft, page: 1 });
          reload();
        }}
        reset={reset}
      />
      {error && <Alert type="error" title={error} />}
      <Card>
        <div className="energy-tabs-bar">
          <Tabs
            activeKey={tab}
            onChange={(v) => {
              setTab(v);
              setQuery((q) => ({ ...q, stage: "all", page: 1 }));
            }}
            items={[
              { key: "live", label: "现场作业" },
              { key: "history", label: "作业记录" },
            ]}
          />
          <div className="energy-inline-actions">
            {a.can("session.write") && (
              <>
                <Button onClick={temporary}>临时到站</Button>
                <Button type="primary" onClick={manual}>
                  补录实际作业
                </Button>
              </>
            )}
          </div>
        </div>
        {tab === "live" && (
          <div className="energy-station-summary">
            {["待到站", "待服务", "补能中", "待核验"].map((s) => (
              <button
                key={s}
                onClick={() => setQuery((q) => ({ ...q, stage: s, page: 1 }))}
              >
                {s}
                <strong>{data?.counts?.[s] || 0}</strong>
              </button>
            ))}
            <small>测算／人工业务状态</small>
          </div>
        )}
        <div className={tab === "live" ? "energy-station-layout" : ""}>
          <div className="energy-station-main">
            {tab === "live" && (
              <div className="energy-live-tabs">
                <Tabs
                  activeKey={query.stage}
                  onChange={(stage) =>
                    setQuery((q) => ({ ...q, stage, page: 1 }))
                  }
                  items={[
                    "all",
                    "待到站",
                    "待服务",
                    "补能中",
                    "待核验",
                    "已完成",
                    "已取消",
                  ].map((s) => ({
                    key: s,
                    label: `${s === "all" ? "全部" : s} ${data?.counts?.[s] || 0}`,
                  }))}
                />
              </div>
            )}
            <Table
              rowKey="id"
              size="middle"
              loading={loading}
              dataSource={data?.items || []}
              columns={tab === "live" ? liveCols : historyCols}
              scroll={{ x: tab === "live" ? 1120 : 1000 }}
              pagination={pager(data, query, setQuery)}
            />
          </div>
          {tab === "live" && (
            <aside className="energy-device-list">
              <h3>工位状态</h3>
              {devices.map((d) => (
                <div key={d.id} className="energy-device">
                  <div>
                    <strong>{d.name}</strong>
                    <Pill>
                      {d.connection === "在线" ? d.status : d.connection}
                    </Pill>
                  </div>
                  <small>
                    {d.active_visit
                      ? (lookup.vehicles || []).find(
                          (v) => v.id === d.active_visit.vehicle_id,
                        )?.code
                      : d.connection === "在线"
                        ? `额定功率 ${format(d.power_kw)} kW`
                        : "数据待核查"}
                  </small>
                  {d.status === "占用" && (
                    <small>预计释放 {time(d.release_at)}</small>
                  )}
                  <small>
                    {d.operational_source || d.source_label || "测算资料"}
                  </small>
                  {a.can("alert.write") &&
                    (d.connection !== "在线" || d.status === "检修") && (
                      <Button size="small" onClick={() => reportDevice(d)}>
                        报告异常
                      </Button>
                    )}
                </div>
              ))}
              {!devices.length && <Empty description="暂无工位资料" />}
            </aside>
          )}
        </div>
      </Card>
      {form && (
        <EnergyForm
          config={form}
          onClose={() => setForm(null)}
          onDone={reload}
        />
      )}{" "}
      {detail && (
        <ChargingPanel
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            a.go("charging");
          }}
          onArrive={(r) => {
            setDetail(null);
            setForm(arriveForm(a, r));
          }}
        />
      )}
      <EnergyAI />
      {actual && (
        <Drawer
          open
          title="到站作业详情"
          width={580}
          onClose={() => setActual(null)}
        >
          <Descriptions
            column={1}
            items={[
              ["到站编号", actual.code],
              ["车辆", actual.vehicle_code],
              ["状态", actual.status],
              ["到站", time(actual.arrived_at)],
              ["开始", time(actual.start_at)],
              ["依据", actual.evidence],
            ].map(([label, children], key) => ({
              key,
              label,
              children: children || "—",
            }))}
          />
        </Drawer>
      )}
    </div>
  );
}

export function EnergyWorkspace() {
  const a = useApp(),
    lookup = useOptions(),
    [query, setQuery] = useState(null),
    [draft, setDraft] = useState({
      station: defaultStation(a.boot),
      date: "",
      device: "",
    }),
    [tab, setTab] = useState("analysis"),
    [actionError, setActionError] = useState(""),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState(false);
  useEffect(() => {
    if (!query && lookup.sample_dates) {
      const q = {
        station: draft.station,
        date: lookup.sample_dates[0] || new Date().toLocaleDateString("en-CA"),
        device: "",
      };
      setDraft(q);
      setQuery(q);
    }
  }, [lookup.sample_dates]);
  const { data, error, loading, reload } = useRead(
      query
        ? "/api/energy-workspace/analysis"
        : "/api/energy-workspace/options",
      query || {},
    ),
    analysis = query ? data : null;
  async function compare() {
    setBusy(true);
    setActionError("");
    try {
      const r = await a.execute("energy.compare", null, {
        station_id: query.station,
        date: query.date,
      });
      a.showDetail("energy-plans", r.id);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function shift() {
    setBusy(true);
    setActionError("");
    try {
      const r = await a.execute("charging.optimize-scoped", null, {
        station: query.station,
        date: query.date,
      });
      a.showDetail("charging-optimizations", r.id);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const plans = analysis?.affected?.length
    ? analysis.affected
    : analysis?.plans || [];
  return (
    <div className="energy-workspace">
      <Heading title="用能管理" />
      <Filters
        kind="analysis"
        draft={draft}
        setDraft={setDraft}
        stations={lookup.stations}
        devices={(lookup.devices || []).filter(
          (d) => d.station_id === draft.station,
        )}
        submit={() => {
          setQuery({ ...draft });
          reload();
        }}
        reset={() => {
          const q = {
            station: defaultStation(a.boot),
            date: lookup.sample_dates?.[0] || "",
            device: "",
          };
          setDraft(q);
          setQuery(q);
          reload();
        }}
      />
      {(error || actionError) && (
        <Alert type="error" title={error || actionError} />
      )}
      <Card>
        <div className="energy-tabs-bar">
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "analysis", label: "用能分析" },
              { key: "plans", label: "优化计划" },
            ]}
          />
          <div className="energy-inline-actions">
            <Button
              aria-label="用能数据口径"
              icon={<Info size={16} />}
              onClick={() => setSource(true)}
            />
            <Button
              loading={busy}
              disabled={!a.can("energy.write") || !query || busy}
              onClick={compare}
            >
              生成优化建议
            </Button>
          </div>
        </div>
        {tab === "analysis" ? (
          <Spin spinning={loading}>
            <div className="energy-metrics">
              {[
                [
                  "区间用电",
                  analysis?.energy_kwh == null
                    ? "—"
                    : format(analysis.energy_kwh) + " kWh",
                ],
                [
                  "已知作业费用",
                  analysis?.known_cost_cents == null
                    ? "—"
                    : money(analysis.known_cost_cents),
                ],
                [
                  "样例峰值",
                  analysis?.peak_kw == null
                    ? "—"
                    : format(analysis.peak_kw) + " kW",
                ],
                [
                  "供电上限",
                  analysis?.limit_kw == null
                    ? "—"
                    : format(analysis.limit_kw) + " kW",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="energy-analysis-layout">
              <section className="energy-chart-section">
                <div className="energy-section-head">
                  <h3>分时负荷</h3>
                  <small>
                    测算 · 样本 {analysis?.sample_count || 0}/24小时
                  </small>
                </div>
                <EnergyLoadChart data={analysis} />
              </section>
              <aside className="energy-risk">
                <h3>供电风险</h3>
                {analysis?.risks?.length ? (
                  <>
                    <Alert
                      type="warning"
                      title={`预计 ${analysis.risks.map((r) => String(r.hour).padStart(2, "0") + ":00").join("、")} 存在超限`}
                      description={`最大超限 ${format(Math.max(...analysis.risks.map((r) => r.excess_kw)))} kW`}
                    />
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 1,
                          label: "关联补能计划",
                          children: analysis.affected.length + " 条",
                        },
                        {
                          key: 2,
                          label: "关联订单",
                          children:
                            new Set(
                              analysis.affected
                                .map((p) => p.order_id)
                                .filter(Boolean),
                            ).size + " 个",
                        },
                        {
                          key: 3,
                          label: "有调整余量",
                          children:
                            analysis.affected.filter((p) => p.adjustable)
                              .length + " 辆（待复核）",
                        },
                      ]}
                    />
                  </>
                ) : (
                  <Empty
                    description={
                      analysis?.plans?.length
                        ? "当前参考预测无超限"
                        : "所选日期无有效补能需求"
                    }
                  />
                )}
                <div className="energy-risk-actions">
                  <Button
                    onClick={() =>
                      a.go("charging", {
                        station_id: query?.station,
                        date: query?.date,
                      })
                    }
                  >
                    查看相关安排
                  </Button>
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={
                      !a.can("forecast.run") || !analysis?.plans?.length || busy
                    }
                    onClick={shift}
                  >
                    比较错峰方案
                  </Button>
                </div>
                <small>运输时限与电量约束需再次核验</small>
              </aside>
            </div>
            <section className="energy-affected">
              <h3>
                {analysis?.affected?.length
                  ? "受影响的补能安排"
                  : "关联补能安排"}
              </h3>
              <Table
                rowKey="id"
                size="small"
                scroll={{ x: 1000 }}
                dataSource={plans}
                pagination={{
                  defaultPageSize: 10,
                  pageSizeOptions: [10, 20, 50, 100],
                  showSizeChanger: true,
                  showTotal: (t) => `共 ${t} 条`,
                }}
                columns={[
                  col("车辆", "vehicle_code"),
                  col("补能计划 / 运输任务", "code", (_, r) => (
                    <div className="energy-cell-stack">
                      <button
                        className="inline-link"
                        onClick={() =>
                          a.go("charging", {
                            task_id: r.task_id,
                            station_id: query.station,
                            date: query.date,
                          })
                        }
                      >
                        {r.code}
                      </button>
                      <TransportLinks row={r} />
                    </div>
                  )),
                  col("来源订单", "order_code"),
                  col("服务时段 / 电量", "quantity_kwh", (v, r) => (
                    <div className="energy-cell-stack">
                      <span>
                        {time(r.estimated_start_at)} —{" "}
                        {time(r.estimated_finish_at)}
                      </span>
                      <small>{format(v)} kWh</small>
                    </div>
                  )),
                  col("运输约束", "task_finish_at", (v) => time(v)),
                  col("调整空间", "adjustable", (v) =>
                    v ? "可比较延后30分钟" : "需核对运输窗口",
                  ),
                  col("操作", "task_id", (v, r) => (
                    <Button
                      type="link"
                      onClick={() =>
                        v
                          ? a.showDetail("tasks", v)
                          : a.go("charging", {
                              station_id: query.station,
                              date: query.date,
                            })
                      }
                    >
                      {v ? "查看任务" : "查看安排"}
                    </Button>
                  )),
                ]}
              />
            </section>
          </Spin>
        ) : (
          <EnergyPlanList query={query} />
        )}
      </Card>
      <EnergyAI />
      {source && (
        <EnergySourcePanel
          analysis={analysis}
          onClose={() => setSource(false)}
        />
      )}
    </div>
  );
}
function EnergyPlanList({ query }) {
  const a = useApp(),
    [page, setPage] = useState(1),
    { data, error, loading } = useRead("/api/energy-workspace/plans", {
      ...query,
      page,
      pageSize: 10,
    });
  useEffect(() => setPage(1), [JSON.stringify(query)]);
  return (
    <div className="energy-plans">
      {error && <Alert type="error" title={error} />}
      <Table
        rowKey="id"
        loading={loading}
        dataSource={data?.items || []}
        scroll={{ x: 800 }}
        pagination={{
          current: page,
          pageSize: 10,
          total: data?.total || 0,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
        columns={[
          col("计划编号", "code"),
          col("策略名称", "name"),
          col("日期", "date", (v) => v || "历史记录"),
          col("状态", "status"),
          col("生成时间", "created_at", time),
          col("操作", "id", (id) => (
            <Button
              type="link"
              onClick={() => a.showDetail("energy-plans", id)}
            >
              查看方案
            </Button>
          )),
        ]}
      />
    </div>
  );
}
function EnergyLoadChart({ data }) {
  const [table, setTable] = useState(false),
    series = data?.series || [],
    max =
      Math.max(
        100,
        data?.limit_kw || 0,
        ...series.flatMap((r) => [r.actual_kw || 0, r.predicted_kw || 0]),
      ) * 1.12;
  const x = (h) => 55 + (h / 23) * 810,
    y = (v) => 260 - (v / max) * 220;
  const path = (key) =>
    series
      .map((r, i) =>
        r[key] == null
          ? ""
          : `${i === 0 || series[i - 1][key] == null ? "M" : "L"}${x(r.hour)},${y(r[key])}`,
      )
      .join(" ");
  return (
    <>
      <div className="energy-chart-legend">
        <span className="actual">━ 实际样例</span>
        <span className="prediction">┄ 计划预测</span>
        <span>┄ 供电上限</span>
        <Button size="small" onClick={() => setTable((v) => !v)}>
          {table ? "查看曲线" : "查看数据表"}
        </Button>
      </div>
      {table ? (
        <Table
          rowKey="hour"
          size="small"
          pagination={false}
          dataSource={series}
          columns={[
            col("小时", "hour", (v) => `${v}:00`),
            col("实际样例（kW）", "actual_kw", (v) =>
              v == null ? "缺测" : format(v),
            ),
            col("预测（kW）", "predicted_kw", (v) =>
              v == null ? "未计算" : format(v),
            ),
          ]}
        />
      ) : (
        <svg
          className="energy-load-chart"
          viewBox="0 0 900 305"
          role="img"
          aria-label="所选日期负荷，实际与预测分别展示，缺测保留断点"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line
                x1="55"
                x2="865"
                y1={y((max * i) / 4)}
                y2={y((max * i) / 4)}
                stroke="var(--border)"
              />
              <text x="45" y={y((max * i) / 4) + 4} textAnchor="end">
                {Math.round((max * i) / 4)}
              </text>
            </g>
          ))}
          {[0, 4, 8, 12, 16, 20, 23].map((h) => (
            <text key={h} x={x(h)} y="288" textAnchor="middle">
              {String(h).padStart(2, "0")}:00
            </text>
          ))}
          {data?.risks?.map((r) => (
            <rect
              key={r.hour}
              x={x(r.hour)}
              y="35"
              width={810 / 24}
              height="225"
              fill="#fef3c7"
              opacity=".65"
            />
          ))}
          {data?.limit_kw != null && (
            <>
              <line
                x1="55"
                x2="865"
                y1={y(data.limit_kw)}
                y2={y(data.limit_kw)}
                stroke="#94a3b8"
                strokeDasharray="7 4"
              />
              <text x="860" y={y(data.limit_kw) - 6} textAnchor="end">
                {format(data.limit_kw)} kW上限
              </text>
            </>
          )}
          {series.flatMap((r) =>
            ["actual_kw", "predicted_kw"]
              .filter((key) => r[key] != null)
              .map((key) => (
                <circle
                  key={r.hour + key}
                  cx={x(r.hour)}
                  cy={y(r[key])}
                  r={2.5}
                  fill={key === "actual_kw" ? "#237bff" : "var(--brand)"}
                >
                  <title>
                    {r.hour}:00 · {format(r[key])} kW
                  </title>
                </circle>
              )),
          )}
          <path
            d={path("actual_kw")}
            stroke="#237bff"
            fill="none"
            strokeWidth="2.5"
          />
          <path
            d={path("predicted_kw")}
            stroke="var(--brand)"
            fill="none"
            strokeWidth="2.5"
            strokeDasharray="7 4"
          />
          {!series.some(
            (r) => r.actual_kw != null || r.predicted_kw != null,
          ) && (
            <text x="450" y="150" textAnchor="middle">
              所选日期暂无计量样本或有效计划
            </text>
          )}
        </svg>
      )}
    </>
  );
}

export function StationFiles() {
  const a = useApp(),
    [tab, setTab] = useState("stations");
  return (
    <div className="energy-workspace">
      <Heading title="场站档案" />
      <Card>
        <div className="energy-tabs-bar">
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: "stations", label: "场站资料" },
              { key: "devices", label: "设备工位" },
              { key: "energy-resources", label: "能源资源" },
            ]}
          />
          {a.can("resource.write") && (
            <Button
              type="primary"
              onClick={() =>
                tab === "devices"
                  ? a.openForm(
                      "登记设备工位",
                      [
                        field("station_id", "所属场站", "select", {
                          options: options(a.boot.stations),
                        }),
                        field("code", "工位编码"),
                        field("name", "工位名称"),
                        field("power_kw", "额定功率（kW）", "number", {
                          min: 1,
                        }),
                        field("compatibility", "设备适配"),
                        field("evidence", "资料依据", "textarea"),
                      ],
                      { power_kw: 240 },
                      (v) => a.execute("device.create", null, v),
                    )
                  : a.createPhysical(tab)
              }
            >
              登记
              {tab === "stations"
                ? "场站"
                : tab === "devices"
                  ? "工位"
                  : "能源资源"}
            </Button>
          )}
        </div>
        <DataTable
          key={tab}
          resource={tab}
          columns={
            tab === "stations"
              ? [
                  col("场站编号", "code"),
                  col("场站名称", "name"),
                  col("方式", "mode"),
                  col("有效供电", "power_kw", (v) => format(v) + " kW"),
                  col("状态", "status"),
                ]
              : tab === "devices"
                ? [
                    col("工位", "name"),
                    col(
                      "场站",
                      "station_id",
                      (id) =>
                        a.boot.stations.find((s) => s.id === id)?.name || id,
                    ),
                    col("状态", "status"),
                    col("连接", "connection"),
                    col("额定功率", "power_kw", (v) => format(v) + " kW"),
                  ]
                : [
                    col("资源编号", "code"),
                    col("资源名称", "name"),
                    col("类别", "kind"),
                    col("状态", "status"),
                  ]
          }
        />
      </Card>
    </div>
  );
}
