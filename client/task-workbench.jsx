import React, { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui";
import {
  Input,
  Select,
  Table,
  Tabs,
  Segmented,
  Dropdown,
  Progress,
  Alert,
  Empty,
  Pagination,
} from "antd";
import {
  Search,
  RotateCcw,
  List,
  CalendarDays,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { Heading, Card, format, time, col } from "./ui";
import { TaskPanel, DispatchPanel } from "./task-drawers";
import "./task-workbench.css";

export const taskGroups = [
  ["all", "全部"],
  ["pending", "待派发"],
  ["ready", "待执行"],
  ["running", "执行中"],
  ["verify", "待核验"],
  ["ended", "已结束"],
];
const states = [
  "待派发",
  "待接收",
  "已接收",
  "执行中",
  "退回补充",
  "待核验",
  "已完成",
  "已取消",
  "余量已终止",
];
const defaults = () => ({
  q: "",
  status: "",
  stage: "all",
  from: "",
  to: "",
  owner: "",
  page: 1,
  pageSize: 10,
});
export const taskStateName = (value) =>
  ({ 待接收: "待接单", 已接收: "待出发" })[value] || value;
export function TaskState({ row }) {
  const ended = ["已完成", "已取消", "余量已终止"].includes(row.status);
  return (
    <div className="task-state-cell">
      <span className={"task-status status-" + row.status}>
        {taskStateName(row.status)}
      </span>
      {row.requires_resimulation && !ended && (
        <small className="task-attention">需重新测算</small>
      )}
      {row.rejection_reason && row.status === "待派发" && (
        <small className="task-attention" title={row.rejection_reason}>
          司机拒单
        </small>
      )}
      {row.notification === "投递失败" && !ended && (
        <small className="task-attention">通知失败</small>
      )}
      {row.open_alerts > 0 && (
        <small className="task-attention">待处理异常 {row.open_alerts}</small>
      )}
    </div>
  );
}
export function TaskProgress({ row }) {
  const percent = row.quantity_kg
    ? Math.min(100, Math.round((row.reported_kg / row.quantity_kg) * 100))
    : 0;
  return (
    <div className="task-progress">
      <span>
        上报 <b>{format(row.reported_kg / 1000)}</b> /{" "}
        {format(row.quantity_kg / 1000)} 吨
      </span>
      <Progress
        percent={percent}
        showInfo={false}
        size="small"
        strokeColor="var(--brand)"
      />
      <small>
        已核验 {format(row.verified_kg / 1000)} 吨
        {row.delivered_trips > 0 ? ` · 已交付 ${row.delivered_trips} 趟` : ""}
      </small>
    </div>
  );
}
export default function TaskWorkbench() {
  const a = useApp(),
    [query, setQueryState] = useState(
      () => a.transportQueries.tasks || defaults(),
    ),
    [draft, setDraft] = useState(query),
    [view, setView] = useState("list"),
    [data, setData] = useState({ items: [], total: 0, counts: {} }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState([]),
    [queryRevision, setQueryRevision] = useState(0),
    [batch, setBatch] = useState(null),
    [panel, setPanel] = useState(null),
    seq = useRef(0);
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "task",
    );
    if (id) setPanel({ id, mode: "detail" });
  }, [location.hash]);
  function setQuery(next) {
    setQueryState(next);
    setQueryRevision((n) => n + 1);
    a.setTransportQueries((s) => ({ ...s, tasks: next }));
    setSelected([]);
  }
  async function load() {
    const ticket = ++seq.current;
    setLoading(true);
    setError("");
    try {
      if (query.from && query.to && query.to < query.from)
        throw new Error("计划日期结束不能早于开始");
      const params = { ...query };
      if (query.from)
        params.from = new Date(query.from + "T00:00:00").toISOString();
      if (query.to) {
        const d = new Date(query.to + "T00:00:00");
        d.setDate(d.getDate() + 1);
        params.to = d.toISOString();
      }
      const r = await request(
        "/api/task-workspace?" +
          new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== "" && v != null),
            ),
          ),
      );
      if (ticket !== seq.current) return;
      setData(r);
      setSelected((s) =>
        s.filter((id) =>
          r.items.some((t) => t.id === id && t.status === "待派发"),
        ),
      );
    } catch (e) {
      if (ticket === seq.current) setError(e.message);
    } finally {
      if (ticket === seq.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      seq.current++;
    };
  }, [JSON.stringify(query), queryRevision, a.revision]);
  const open = (row, mode = "detail") => setPanel({ id: row.id, mode });
  const choose = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  function actions(row) {
    const unstarted = ["待派发", "待接收", "已接收"].includes(row.status),
      active = ["执行中", "待核验", "退回补充"].includes(row.status),
      more = [];
    if (unstarted && a.can("task.verify"))
      more.push({ key: "cancel", label: "取消未执行任务", danger: true });
    if (active && a.can("task.verify"))
      more.push({ key: "terminate", label: "核验并终止余量", danger: true });
    if (row.notification === "投递失败" && a.can("task.verify"))
      more.push({ key: "notify", label: "重试通知" });
    const waiting = row.status === "待派发",
      verify = row.status === "待核验";
    return (
      <div className="task-row-actions">
        {waiting && a.can("task.dispatch") ? (
          <Button type="link" size="small" onClick={() => setBatch([row.id])}>
            派发
          </Button>
        ) : verify && a.can("task.verify") ? (
          <Button type="link" size="small" onClick={() => open(row, "verify")}>
            核验完工
          </Button>
        ) : (
          <Button type="link" size="small" onClick={() => open(row)}>
            {active ? "查看执行" : "查看"}
          </Button>
        )}
        {unstarted && a.can("task.verify") ? (
          <Button type="text" size="small" onClick={() => open(row, "edit")}>
            {row.requires_resimulation ? "重新推演" : "调整"}
          </Button>
        ) : active && !verify ? (
          <Button type="text" size="small" onClick={() => open(row, "alerts")}>
            处理异常
          </Button>
        ) : verify ? (
          <Button type="text" size="small" onClick={() => open(row)}>
            查看
          </Button>
        ) : null}
        {waiting && a.can("task.dispatch") && !a.can("task.verify") && (
          <Button type="text" size="small" onClick={() => open(row)}>
            查看
          </Button>
        )}
        {more.length > 0 && (
          <Dropdown
            menu={{ items: more, onClick: ({ key }) => open(row, key) }}
          >
            <Button
              type="text"
              size="small"
              aria-label={"更多操作 " + row.code}
              icon={MoreHorizontal}
            />
          </Dropdown>
        )}
      </div>
    );
  }
  const columns = [
    col(
      "任务 / 订单",
      "code",
      (v, r) => (
        <div className="task-two-lines">
          <button className="task-number" onClick={() => open(r)}>
            {v}
          </button>
          <small>{r.order_code}</small>
        </div>
      ),
      { width: 193 },
    ),
    col(
      "线路 / 货物",
      "origin",
      (_, r) => (
        <div className="task-two-lines">
          <span className="task-route" title={r.origin + " → " + r.destination}>
            {r.origin || "待核实"} → {r.destination || "待核实"}
          </span>
          <small>{r.cargo || "品类待核实"}</small>
        </div>
      ),
      { width: 235 },
    ),
    col(
      "车辆 / 司机",
      "vehicle_code",
      (_, r) => (
        <div className="task-two-lines">
          <span>{r.vehicle_code}</span>
          <small>{r.driver_name || r.driver_code}</small>
        </div>
      ),
      { width: 140 },
    ),
    col(
      "计划时间",
      "start_at",
      (_, r) => (
        <div className="task-two-lines">
          <span>{time(r.start_at)}</span>
          <small>至 {time(r.finish_at)}</small>
        </div>
      ),
      { width: 155 },
    ),
    col("执行进度", "reported_kg", (_, r) => <TaskProgress row={r} />, {
      width: 200,
    }),
    col("状态 / 待办", "status", (_, r) => <TaskState row={r} />, {
      width: 132,
    }),
    col("操作", "actions", (_, r) => actions(r), {
      width: 205,
      fixed: "right",
    }),
  ];
  return (
    <div className="task-workbench">
      <Heading title="运输任务" />
      <Card className="task-search-card">
        <form
          className="task-search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({
              ...draft,
              stage: draft.status ? "all" : query.stage,
              page: 1,
            });
          }}
        >
          <label className="task-query-keyword">
            <span>关键词</span>
            <Input
              aria-label="查询运输任务"
              placeholder="任务号 / 订单号 / 车牌 / 司机"
              value={draft.q}
              prefix={<Search size={14} />}
              allowClear
              onChange={(e) => choose("q", e.target.value)}
            />
          </label>
          <label>
            <span>状态</span>
            <Select
              aria-label="任务状态筛选"
              placeholder="全部状态"
              allowClear
              value={draft.status || undefined}
              options={states.map((v) => ({
                value: v,
                label: taskStateName(v),
              }))}
              onChange={(v) => {
                choose("status", v || "");
                if (v) setDraft((d) => ({ ...d, stage: "all" }));
              }}
            />
          </label>
          <div className="task-query-date">
            <span>计划日期</span>
            <div>
              <input
                type="date"
                aria-label="计划日期开始"
                value={draft.from}
                onChange={(e) => choose("from", e.target.value)}
              />
              <span>—</span>
              <input
                type="date"
                aria-label="计划日期结束"
                value={draft.to}
                onChange={(e) => choose("to", e.target.value)}
              />
            </div>
          </div>
          {a.boot.organizations.length > 1 && (
            <label>
              <span>主体</span>
              <Select
                aria-label="任务主体筛选"
                placeholder="全部主体"
                value={draft.owner || undefined}
                allowClear
                options={a.boot.organizations.map((o) => ({
                  value: o.id,
                  label: o.name,
                }))}
                onChange={(v) => choose("owner", v || "")}
              />
            </label>
          )}
          <div className="task-search-actions">
            <Button htmlType="submit" type="primary" ghost>
              查询
            </Button>
            <Button
              icon={RotateCcw}
              onClick={() => {
                const d = defaults();
                setDraft(d);
                setQuery(d);
              }}
            >
              重置
            </Button>
          </div>
        </form>
      </Card>
      <Card className="task-list-card">
        <div className="task-list-toolbar">
          <Tabs
            activeKey={query.stage}
            items={taskGroups.map(([key, label]) => ({
              key,
              label: (
                <span>
                  {label} <b>{data.counts[key] || 0}</b>
                </span>
              ),
            }))}
            onChange={(stage) => {
              const d = { ...query, stage, status: "", page: 1 };
              setDraft(d);
              setQuery(d);
            }}
          />
          <Segmented
            aria-label="任务查看方式"
            value={view}
            options={[
              {
                value: "list",
                label: (
                  <span>
                    <List size={14} />
                    列表
                  </span>
                ),
              },
              {
                value: "schedule",
                label: (
                  <span>
                    <CalendarDays size={14} />
                    排程
                  </span>
                ),
              },
            ]}
            onChange={(v) => {
              setView(v);
              setSelected([]);
            }}
          />
        </div>
        {view === "list" && (
          <div
            className={
              "task-selection " + (selected.length ? "has-selection" : "")
            }
          >
            <div>
              {selected.length ? (
                <>
                  <span>
                    已选 <b>{selected.length}</b> 项
                  </span>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setSelected([])}
                  >
                    清除选择
                  </Button>
                </>
              ) : (
                <span className="task-total">共 {data.total} 条任务</span>
              )}
            </div>
            {a.can("task.dispatch") && (
              <Button
                icon={Send}
                type="primary"
                disabled={!selected.length || loading}
                onClick={() => setBatch(selected)}
              >
                批量派发{selected.length ? `（${selected.length}）` : ""}
              </Button>
            )}
          </div>
        )}
        {error ? (
          <div className="task-error">
            <Alert
              type="error"
              showIcon
              message={error}
              action={<Button onClick={load}>重试</Button>}
            />
          </div>
        ) : view === "schedule" ? (
          <TaskSchedule
            items={data.items}
            query={query}
            total={data.total}
            loading={loading}
            open={open}
            onPage={(page, pageSize) => {
              setQuery({
                ...query,
                page: pageSize === query.pageSize ? page : 1,
                pageSize,
              });
            }}
          />
        ) : (
          <Table
            rowKey="id"
            className="task-main-table"
            loading={loading}
            dataSource={data.items}
            columns={columns}
            scroll={{ x: 1330 }}
            size="middle"
            rowSelection={
              a.can("task.dispatch")
                ? {
                    selectedRowKeys: selected,
                    onChange: setSelected,
                    getCheckboxProps: (r) => ({
                      disabled: r.status !== "待派发",
                    }),
                  }
                : undefined
            }
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: data.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, pageSize) =>
                setQuery({
                  ...query,
                  page: pageSize === query.pageSize ? page : 1,
                  pageSize,
                }),
            }}
            locale={{
              emptyText: <Empty description="没有符合条件的运输任务" />,
            }}
          />
        )}
      </Card>
      {panel && (
        <TaskPanel
          id={panel.id}
          mode={panel.mode}
          onClose={() => setPanel(null)}
          onMode={(mode) => setPanel((p) => ({ ...p, mode }))}
        />
      )}
      {batch && (
        <DispatchPanel
          ids={batch}
          onClose={() => setBatch(null)}
          onDone={() => {
            setBatch(null);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}

function TaskSchedule({ items, query, total, loading, open, onPage }) {
  const [showEnded, setShowEnded] = useState(false),
    ended = ["已完成", "已取消", "余量已终止"],
    visible = items.filter(
      (t) =>
        showEnded || query.stage === "ended" || ended.indexOf(t.status) < 0,
    ),
    start = visible.length
      ? Math.min(...visible.map((t) => +new Date(t.start_at)))
      : Date.now(),
    finish = Math.max(
      start + 3600000,
      ...visible.map((t) => +new Date(t.finish_at)),
    ),
    duration = finish - start,
    groups = Object.values(
      visible.reduce((m, t) => {
        (m[t.vehicle_id] ||= {
          code: t.vehicle_code,
          driver: t.driver_name,
          tasks: [],
        }).tasks.push(t);
        return m;
      }, {}),
    );
  return (
    <div className="task-schedule">
      <div className="task-schedule-tools">
        <span>
          当前页 {items.length} / {total} 条任务 · 计划占用
        </span>
        <Button size="small" onClick={() => setShowEnded((s) => !s)}>
          {showEnded ? "隐藏已结束" : "显示已结束"}
        </Button>
      </div>
      {loading ? (
        <div className="task-loading">正在读取排程…</div>
      ) : !groups.length ? (
        <Empty description="当前页暂无未结束排程" />
      ) : (
        <div className="task-schedule-scroll">
          <div className="task-schedule-canvas">
            <div className="task-schedule-axis">
              <span>车辆 / 司机</span>
              <div>
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} style={{ left: i * 25 + "%" }}>
                    {time(start + (duration * i) / 4)}
                  </span>
                ))}
              </div>
            </div>
            {groups.map((g) => (
              <div className="task-schedule-row" key={g.code}>
                <div>
                  <strong>{g.code}</strong>
                  <small>{g.driver}</small>
                </div>
                <div className="task-schedule-lanes">
                  {g.tasks.map((t) => {
                    const conflict = g.tasks.some(
                      (o) =>
                        o.id !== t.id &&
                        o.start_at < t.finish_at &&
                        o.finish_at > t.start_at,
                    );
                    return (
                      <div className="task-schedule-lane" key={t.id}>
                        <button
                          title={`${t.code} · ${time(t.start_at)}—${time(t.finish_at)}`}
                          className={
                            "task-time-block " + (conflict ? "conflict" : "")
                          }
                          style={{
                            left:
                              ((+new Date(t.start_at) - start) / duration) *
                                100 +
                              "%",
                            width:
                              Math.max(
                                1,
                                ((+new Date(t.finish_at) -
                                  +new Date(t.start_at)) /
                                  duration) *
                                  100,
                              ) + "%",
                          }}
                          onClick={() => open(t)}
                        >
                          {t.code} · {taskStateName(t.status)}
                          {conflict ? " · 区间重叠" : ""}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Pagination
        className="task-schedule-pager"
        current={query.page}
        pageSize={query.pageSize}
        total={total}
        showSizeChanger
        pageSizeOptions={[10, 20, 50, 100]}
        showTotal={(t) => `共 ${t} 条`}
        onChange={onPage}
      />
    </div>
  );
}
