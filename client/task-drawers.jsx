import React, { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui";
import {
  Drawer,
  Table,
  Tabs,
  Alert,
  Input,
  Select,
  Empty,
  Descriptions,
  Spin,
} from "antd";
import { RefreshCw } from "lucide-react";
import { useApp } from "./context";
import { request } from "./api";
import { col, format, time } from "./ui";
import { TaskProgress, TaskState } from "./task-workbench";

const tonnes = (v) => format((v || 0) / 1000, 3);
const local = (v) => {
  const d = new Date(v);
  return Number.isFinite(+d)
    ? new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
};
const eventNames = {
  "trip.create": "新建车次",
  "trip.load": "装货反馈",
  "trip.depart": "发车反馈",
  "trip.deliver": "交付反馈",
  "task.accept": "司机接单",
  "task.start": "开始执行",
  "task.reject": "司机拒单",
  "task.verify": "核验通过",
  "task.return": "退回补充",
  "task.schedule": "调整时间",
  "task.reassign": "改派运力",
  "task.cancel": "取消任务",
  "task.terminate": "核验终止余量",
  "task.submit": "提交完工",
  "dispatch.batch": "统一派发",
};
const notice = (e) => ({ message: e.message, code: e.code });
const tripCols = [
  col("车次", "code", undefined, { width: 145 }),
  col(
    "装货 / 交付 / 核验（吨）",
    "loaded_kg",
    (_, r) =>
      [r.loaded_kg, r.delivered_kg, r.verified_kg].map(tonnes).join(" / "),
    { width: 190 },
  ),
  col("状态", "status", undefined, { width: 90 }),
  col("装货凭证", "loading_evidence", (v) => v || "—", { width: 150 }),
  col("交付凭证", "delivery_evidence", (v) => v || "—", { width: 150 }),
];

export function TaskPanel({ id, mode, onClose, onMode }) {
  const a = useApp(),
    [row, setRow] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(null),
    [reason, setReason] = useState(""),
    [evidence, setEvidence] = useState(""),
    [start, setStart] = useState(""),
    [finish, setFinish] = useState(""),
    [vehicle, setVehicle] = useState(""),
    [dirty, setDirty] = useState(false),
    seq = useRef(0);
  async function load(initial = false) {
    const token = ++seq.current;
    setLoading(true);
    try {
      const r = await request("/api/task-workspace/" + encodeURIComponent(id));
      if (token !== seq.current) return;
      setRow(r);
      setError(null);
      if (initial) {
        setStart(local(r.start_at));
        setFinish(local(r.finish_at));
        setVehicle(r.vehicle_id);
        setDirty(false);
      }
    } catch (e) {
      if (token === seq.current) setError(notice(e));
    } finally {
      if (token === seq.current) setLoading(false);
    }
  }
  useEffect(() => {
    setRow(null);
    setError(null);
    setReason("");
    setEvidence("");
    load(true);
    return () => {
      seq.current++;
    };
  }, [id]);
  const close = () => {
    if (busy) return;
    if (dirty) a.confirm("关闭任务面板", "未提交的填写内容将被放弃。", onClose);
    else onClose();
  };
  const change = (setter) => (e) => {
    setter(e.target.value);
    setDirty(true);
  };
  const available = a.boot.vehicles.filter(
      (v) =>
        v.owner_id === row?.owner_id &&
        v.status === "可用" &&
        a.boot.drivers.some(
          (d) =>
            d.id === v.driver_id &&
            d.owner_id === v.owner_id &&
            d.status === "可用",
        ),
    ),
    chosen = available.find((v) => v.id === vehicle),
    driver = a.boot.drivers.find((d) => d.id === chosen?.driver_id),
    unstarted = row && ["待派发", "待接收", "已接收"].includes(row.status),
    canEdit = a.can("task.verify"),
    canReassign = row && ["待接收", "已接收"].includes(row.status),
    canVerify = row?.status === "待核验" && canEdit;
  async function perform(type, body = {}) {
    setBusy(type);
    setError(null);
    try {
      await a.execute(type, id, { ...body, expected_version: row.version });
      setDirty(false);
      onClose();
      return true;
    } catch (e) {
      setError(notice(e));
      return false;
    } finally {
      setBusy("");
    }
  }
  function command(type) {
    if (!reason.trim()) {
      setError({ message: "请填写处置原因与责任说明" });
      return;
    }
    a.confirm(
      type === "task.cancel" ? "取消未执行任务" : "核验并终止余量",
      type === "task.cancel"
        ? "确认取消后释放该任务安排，保留历史记录。"
        : "确认核验已报告车次并释放未履约余量，保留责任与依据。",
      () =>
        perform(type, {
          reason: reason.trim(),
          ...(type === "task.terminate"
            ? {
                evidence: evidence.trim(),
                verified_quantity: row.reported_kg / 1000,
              }
            : {}),
        }),
    );
  }
  function replan() {
    if (!reason.trim()) {
      setError({ message: "请填写重新推演原因" });
      return;
    }
    a.confirm(
      "取消并重新推演",
      "将取消这条未执行任务并释放其安排，再按订单剩余量新建推演。保留原任务记录，不自动生成或派发替代任务。",
      async () => {
        setBusy("replan");
        setError(null);
        try {
          await a.execute("task.cancel", id, {
            reason: reason.trim(),
            expected_version: row.version,
          });
          setDirty(false);
          onClose();
          a.go("simulation", { order_id: row.order_id, fresh: true });
        } catch (e) {
          setError(notice(e));
        } finally {
          setBusy("");
        }
      },
    );
  }
  const titles = {
    detail: "运输任务详情",
    verify: "核验完工",
    edit: "调整任务安排",
    cancel: "取消未执行任务",
    terminate: "核验并终止余量",
    alerts: "任务异常处理",
    notify: "重试任务通知",
    source: "数据依据",
  };
  const footer = (
    <div className="task-drawer-footer">
      <Button onClick={close} disabled={!!busy}>
        关闭
      </Button>
      {row && mode === "verify" && canVerify && (
        <>
          <Button
            disabled={!!busy}
            onClick={() => {
              if (!reason.trim()) {
                setError({ message: "请填写需要司机补充的内容" });
                return;
              }
              perform("task.return", { reason: reason.trim() });
            }}
            loading={busy === "task.return"}
          >
            退回补充
          </Button>
          <Button
            type="primary"
            disabled={!!busy || !evidence.trim()}
            loading={busy === "task.verify"}
            onClick={() =>
              a.confirm(
                "核验完工通过",
                `核验交付 ${tonnes(row.reported_kg)} 吨，按逐车次交付记录确认。`,
                () =>
                  perform("task.verify", {
                    evidence: evidence.trim(),
                    verified_quantity: row.reported_kg / 1000,
                  }),
              )
            }
          >
            核验通过
          </Button>
        </>
      )}
      {row && mode === "edit" && unstarted && canEdit && (
        <Button
          type="primary"
          disabled={!!busy || !reason.trim()}
          loading={busy === "task.schedule"}
          onClick={() => {
            if (!start || !finish || new Date(finish) <= new Date(start)) {
              setError({ message: "请填写有效的计划起止时间" });
              return;
            }
            perform("task.schedule", {
              start_at: new Date(start).toISOString(),
              finish_at: new Date(finish).toISOString(),
              reason: reason.trim(),
            });
          }}
        >
          保存时间调整
        </Button>
      )}
      {row && mode === "cancel" && unstarted && canEdit && (
        <Button
          danger
          type="primary"
          disabled={!!busy || !reason.trim()}
          loading={!!busy}
          onClick={() => command("task.cancel")}
        >
          确认取消任务
        </Button>
      )}
      {row &&
        mode === "terminate" &&
        canEdit &&
        ["执行中", "待核验", "退回补充"].includes(row.status) && (
          <Button
            danger
            type="primary"
            disabled={!!busy || !reason.trim() || !evidence.trim()}
            loading={!!busy}
            onClick={() => command("task.terminate")}
          >
            确认核验并终止余量
          </Button>
        )}
      {row &&
        mode === "notify" &&
        canEdit &&
        row.notification === "投递失败" && (
          <Button
            type="primary"
            disabled={!!busy}
            loading={!!busy}
            onClick={() => perform("task.notify")}
          >
            确认重试通知
          </Button>
        )}
    </div>
  );
  const taskHeader = row && (
    <div className="task-drawer-summary">
      <div>
        <strong>{row.code}</strong>
        <TaskState row={row} />
      </div>
      <p>
        {row.origin} → {row.destination}
      </p>
      <span>
        {row.cargo} · {row.vehicle_code} · {row.driver_name}
      </span>
      <TaskProgress row={row} />
    </div>
  );
  return (
    <Drawer
      title={titles[mode] || titles.detail}
      open
      onClose={close}
      width={mode === "edit" ? 660 : 820}
      footer={footer}
      maskClosable={!busy}
      keyboard={!busy}
    >
      {error && (
        <Alert
          className="task-inline-error"
          type="error"
          showIcon
          message={error.message}
          action={
            <Button
              size="small"
              icon={RefreshCw}
              disabled={!!busy}
              onClick={() => load(false)}
            >
              {error.code === "VERSION_CONFLICT" ? "读取最新任务" : "重新读取"}
            </Button>
          }
        />
      )}
      {loading ? (
        <Spin />
      ) : row ? (
        <>
          {taskHeader}
          {mode === "verify" ? (
            <>
              <section className="task-drawer-section">
                <h3>逐车次核对</h3>
                <TripTable trips={row.trips} />
                <div className="task-evidence">
                  <span>完工凭证</span>
                  <p>{row.completion_evidence || "未提供"}</p>
                  {row.remaining_reason && (
                    <>
                      <span>未履约说明</span>
                      <p>{row.remaining_reason}</p>
                    </>
                  )}
                </div>
              </section>
              <label className="task-form-field">
                <span>核验依据 *</span>
                <Input.TextArea
                  aria-label="任务核验依据"
                  value={evidence}
                  disabled={!!busy || !canVerify}
                  onChange={change(setEvidence)}
                  rows={3}
                  placeholder="填写核对凭证及核验说明"
                />
              </label>
              <label className="task-form-field">
                <span>退回补充说明</span>
                <Input.TextArea
                  aria-label="任务退回说明"
                  value={reason}
                  disabled={!!busy || !canVerify}
                  onChange={change(setReason)}
                  rows={3}
                  placeholder="有差异时填写需要补充的车次、数量或凭证"
                />
              </label>
              {!canVerify && (
                <Alert
                  type="info"
                  message="当前任务已不在待核验状态，请核对最新记录。"
                />
              )}
            </>
          ) : mode === "edit" ? (
            <>
              {!unstarted && (
                <Alert
                  type="warning"
                  message="任务已有执行事实，不能直接覆盖时间和运力。"
                />
              )}
              <div className="task-form-grid">
                <label className="task-form-field">
                  <span>计划开始</span>
                  <input
                    type="datetime-local"
                    aria-label="任务计划开始"
                    value={start}
                    disabled={!!busy || !unstarted || !canEdit}
                    onChange={change(setStart)}
                  />
                </label>
                <label className="task-form-field">
                  <span>计划结束</span>
                  <input
                    type="datetime-local"
                    aria-label="任务计划结束"
                    value={finish}
                    disabled={!!busy || !unstarted || !canEdit}
                    onChange={change(setFinish)}
                  />
                </label>
              </div>
              <label className="task-form-field">
                <span>调整原因 / 责任说明 *</span>
                <Input.TextArea
                  aria-label="任务调整原因"
                  value={reason}
                  onChange={change(setReason)}
                  rows={3}
                  disabled={!!busy || !canEdit}
                />
              </label>
              <div className="task-form-note">
                时间调整后需重新测算，确认有效安排后才能派发或开始。
              </div>
              {canReassign && canEdit && (
                <section className="task-drawer-section">
                  <h3>变更车辆与司机</h3>
                  <Select
                    aria-label="改派车辆"
                    value={vehicle}
                    onChange={(v) => {
                      setVehicle(v);
                      setDirty(true);
                    }}
                    options={available.map((v) => ({
                      value: v.id,
                      label:
                        v.code +
                        " · " +
                        (a.boot.drivers.find((d) => d.id === v.driver_id)
                          ?.name || "司机待核实"),
                    }))}
                    disabled={!!busy}
                  />
                  <p className="task-form-note">
                    绑定司机：{driver?.name || "请选择绑定有效司机的车辆"}
                  </p>
                  <Button
                    disabled={!!busy || !chosen || !reason.trim()}
                    loading={busy === "task.reassign"}
                    onClick={() =>
                      perform("task.reassign", {
                        vehicle_id: vehicle,
                        driver_id: chosen.driver_id,
                        reason: reason.trim(),
                      })
                    }
                  >
                    核对并确认改派
                  </Button>
                </section>
              )}
              {unstarted && canEdit && a.can("simulation.run") && (
                <section className="task-drawer-section">
                  <h3>重新推演</h3>
                  <p className="task-form-note">
                    取消原未执行任务后，按订单剩余量重新测算；新的任务仍由你最终确认生成。
                  </p>
                  <Button
                    disabled={
                      !!busy ||
                      !reason.trim() ||
                      row.reported_kg > 0 ||
                      row.trips.length > 0
                    }
                    onClick={replan}
                    loading={busy === "replan"}
                  >
                    取消并重新推演
                  </Button>
                </section>
              )}
            </>
          ) : mode === "cancel" || mode === "terminate" ? (
            <>
              <TripTable trips={row.trips} />
              {mode === "terminate" && (
                <label className="task-form-field">
                  <span>已报告量核验依据 *</span>
                  <Input.TextArea
                    aria-label="任务终止核验依据"
                    rows={3}
                    value={evidence}
                    onChange={change(setEvidence)}
                    disabled={!!busy}
                  />
                </label>
              )}
              <label className="task-form-field">
                <span>
                  {mode === "cancel" ? "取消原因" : "未履约余量责任与处置"} *
                </span>
                <Input.TextArea
                  aria-label="任务处置原因"
                  rows={3}
                  value={reason}
                  onChange={change(setReason)}
                  disabled={!!busy}
                />
              </label>
            </>
          ) : mode === "alerts" ? (
            <TaskAlerts row={row} close={onClose} />
          ) : mode === "notify" ? (
            <p>当前通知状态：{row.notification}。重试通知不会重复派发任务。</p>
          ) : mode === "source" ? (
            <div className="task-evidence">
              <span>数据属性</span>
              <p>{row.source_label || "测算资料"}</p>
              <span>数据时间</span>
              <p>{time(row.source_time || row.created_at)}</p>
              <span>来源</span>
              <p>{row.source}</p>
              <span>适用范围</span>
              <p>
                平台开发业务样例及人工登记记录；推演与补能计划为参考，实际执行以司机反馈、场站作业和管理员核验为准。
              </p>
            </div>
          ) : (
            <Tabs
              items={[
                {
                  key: "overview",
                  label: "任务概况",
                  children: (
                    <>
                      <Descriptions
                        column={2}
                        size="small"
                        items={[
                          {
                            key: "order",
                            label: "来源订单",
                            children: row.order_code,
                          },
                          {
                            key: "owner",
                            label: "业务主体",
                            children: a.boot.organizations.find(
                              (o) => o.id === row.owner_id,
                            )?.name,
                          },
                          {
                            key: "start",
                            label: "计划开始",
                            children: time(row.start_at),
                          },
                          {
                            key: "finish",
                            label: "计划结束",
                            children: time(row.finish_at),
                          },
                          {
                            key: "notification",
                            label: "司机通知",
                            children: row.notification,
                          },
                          {
                            key: "feedback",
                            label: "最近反馈",
                            children: time(
                              row.last_event_at || row.source_time,
                            ),
                          },
                          {
                            key: "reason",
                            label: "拒单原因",
                            children: row.rejection_reason || "—",
                          },
                          {
                            key: "returned",
                            label: "退回说明",
                            children: row.return_reason || "—",
                          },
                          {
                            key: "complete",
                            label: "完工凭证",
                            children: row.completion_evidence || "—",
                          },
                          {
                            key: "remaining",
                            label: "未履约说明",
                            children:
                              row.remaining_reason || row.cancel_reason || "—",
                          },
                        ]}
                      />
                      <div className="task-detail-actions">
                        {canVerify && (
                          <Button
                            type="primary"
                            onClick={() => onMode("verify")}
                          >
                            核验完工
                          </Button>
                        )}
                        {unstarted && canEdit && (
                          <Button onClick={() => onMode("edit")}>
                            调整安排
                          </Button>
                        )}
                        <Button onClick={() => onMode("alerts")}>
                          查看异常
                        </Button>
                        <Button onClick={() => onMode("source")}>
                          数据依据
                        </Button>
                      </div>
                    </>
                  ),
                },
                {
                  key: "trips",
                  label: "车次执行",
                  children: <TripTable trips={row.trips} />,
                },
                {
                  key: "charging",
                  label: "补能安排",
                  children: (
                    <TaskCharging
                      row={row}
                      onOpen={() => {
                        onClose();
                        a.go("charging", { task_id: row.id });
                      }}
                    />
                  ),
                },
                {
                  key: "history",
                  label: "操作记录",
                  children: <TaskHistory row={row} />,
                },
              ]}
            />
          )}
        </>
      ) : null}
    </Drawer>
  );
}
function TripTable({ trips }) {
  return (
    <Table
      rowKey="id"
      size="small"
      dataSource={trips}
      columns={tripCols}
      scroll={{ x: 735 }}
      pagination={{
        defaultPageSize: 10,
        pageSizeOptions: [10, 20, 50, 100],
        showSizeChanger: true,
      }}
      locale={{ emptyText: "暂无车次执行记录" }}
    />
  );
}
function TaskCharging({ row, onOpen }) {
  const a = useApp(),
    records = row.charging.length
      ? row.charging
      : (row.plan?.charging_events || []).map((r, i) => ({
          ...r,
          id: "planned-" + i,
          status: "方案参考",
          station_name: a.boot.stations.find(
            (s) => s.id === (r.station_id || row.station_id),
          )?.name,
        }));
  return (
    <>
      {row.charging.length > 0 && (
        <Button onClick={onOpen} style={{ marginBottom: 12 }}>
          查看本任务补能安排
        </Button>
      )}
      <Table
        rowKey="id"
        size="small"
        dataSource={records}
        scroll={{ x: 600 }}
        pagination={{ defaultPageSize: 10 }}
        columns={[
          col("场站", "station_name"),
          col("预计到站", "arrival_at", time),
          col("计划电量（kWh）", "quantity_kwh", (v) => format(v)),
          col("状态", "status"),
        ]}
      />
      <p className="task-form-note">
        补能安排为平台内部计划，实际作业以场站记录为准。
      </p>
    </>
  );
}
function TaskHistory({ row }) {
  const rows = [
    {
      id: "created",
      at: row.created_at,
      title: "任务生成",
      note: row.order_code,
      kind: "任务记录",
    },
    ...row.events.map((r, i) => ({
      id: "event-" + i,
      at: r.occurred_at,
      title: eventNames[r.kind] || r.kind,
      note: r.late_reason || r.evidence || "",
      kind: "执行反馈",
    })),
    ...row.audit.map((r, i) => ({
      id: "audit-" + i,
      at: r.created_at,
      title: eventNames[r.action] || r.action,
      note:
        r.reason ||
        r.evidence ||
        `版本 ${r.before_version ?? "—"} → ${r.after_version ?? "—"}`,
      kind: "业务操作",
    })),
    ...(row.submission_history || []).map((r, i) => ({
      id: "submit-" + i,
      at: r.at,
      title: "提交完工",
      note: r.evidence || r.remaining_reason,
      kind: "司机提交",
    })),
    ...(row.verification_history || []).map((r, i) => ({
      id: "verify-" + i,
      at: r.at,
      title: r.action,
      note: r.reason || r.evidence,
      kind: "核验记录",
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows.length ? (
    <div className="task-history">
      {rows.map((r) => (
        <div key={r.id}>
          <span>
            {time(r.at)} · {r.kind}
          </span>
          <strong>{r.title}</strong>
          <p>{r.note || "—"}</p>
        </div>
      ))}
    </div>
  ) : (
    <Empty description="暂无操作记录" />
  );
}
function TaskAlerts({ row, close }) {
  const a = useApp();
  return (
    <>
      <div className="task-detail-actions">
        <Button
          onClick={() => {
            close();
            a.go("alerts", { task_id: row.id });
          }}
        >
          查看本任务异常
        </Button>
        {a.can("alert.write") && (
          <Button
            onClick={() => {
              close();
              a.reportAlert(row);
            }}
          >
            登记任务异常
          </Button>
        )}
      </div>
      {row.alerts.length ? (
        row.alerts.map((r) => (
          <section className="task-alert-item" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <span>{r.status}</span>
            </div>
            <p>{r.report || r.reason || r.trigger || "等待核实"}</p>
            <small>{time(r.created_at)}</small>
            <Button
              type="link"
              onClick={() => {
                close();
                a.showDetail("alerts", r.id);
              }}
            >
              查看并处理
            </Button>
          </section>
        ))
      ) : (
        <Empty description="暂无关联任务异常" />
      )}
    </>
  );
}

export function DispatchPanel({ ids, onClose, onDone }) {
  const a = useApp(),
    [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [check, setCheck] = useState(null),
    [unknown, setUnknown] = useState(false),
    alive = useRef(true),
    key = useRef(null);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => {
      alive.current = false;
    };
  }, [ids.join(",")]);
  async function reload() {
    setLoading(true);
    setError("");
    setCheck(null);
    try {
      const rs = await Promise.all(
        ids.map((id) =>
          request("/api/task-workspace/" + encodeURIComponent(id)),
        ),
      );
      if (alive.current) setRows(rs);
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  const payload = () => ({
    items: rows.map((t) => ({
      id: t.id,
      expected_version: t.version,
      vehicle_id: t.vehicle_id,
      driver_id: t.driver_id,
    })),
  });
  async function validate() {
    setBusy("validate");
    setError("");
    setCheck(null);
    try {
      const r = await request("/api/task-dispatch-preview", {
        method: "POST",
        body: payload(),
      });
      setCheck(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function dispatch() {
    setBusy("dispatch");
    setError("");
    // Keep the same key after a network interruption so retry cannot duplicate a successful dispatch.
    key.current ||= crypto.randomUUID();
    try {
      await a.execute("dispatch.batch", null, payload(), key.current);
      onDone();
    } catch (e) {
      setError(e.message);
      setUnknown(!e.status);
      setCheck(null);
      if (e.status) key.current = null;
    } finally {
      setBusy("");
    }
  }
  async function resolveUnknown() {
    setBusy("resolve");
    try {
      const r = await request("/api/commands/" + key.current);
      if (r.status === "COMPLETED") {
        await a.refresh();
        a.resolvePending?.(key.current);
        onDone();
      } else {
        setUnknown(false);
        setError("服务端未找到派发结果，请重新校验后重试。");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <Drawer
      title="派单核对"
      open
      width={1000}
      onClose={() => !busy && onClose()}
      maskClosable={!busy}
      keyboard={!busy}
      footer={
        <div className="task-drawer-footer">
          <Button disabled={!!busy} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!!busy || loading || !rows.length || unknown}
            loading={busy === "validate"}
            onClick={validate}
          >
            整批校验
          </Button>
          <Button
            type="primary"
            disabled={!!busy || !check?.validated || unknown}
            loading={busy === "dispatch"}
            onClick={() =>
              a.confirm(
                "确认统一派发",
                `本次 ${rows.length} 条任务。提交时再次整批核对资源、时间及版本，任一冲突全批不生效。`,
                dispatch,
              )
            }
          >
            确认派发
          </Button>
        </div>
      }
    >
      <div className="task-dispatch-heading">
        <strong>
          {rows.length} 条任务 ·{" "}
          {tonnes(rows.reduce((s, t) => s + t.quantity_kg, 0))} 吨
        </strong>
        <Button
          size="small"
          icon={RefreshCw}
          disabled={!!busy || unknown}
          onClick={reload}
        >
          重新读取
        </Button>
      </div>
      {error && (
        <Alert type="error" message={error} className="task-inline-error" />
      )}
      {unknown && (
        <Alert
          type="warning"
          message="派发结果待核查，请先查询原请求结果。"
          action={
            <Button onClick={resolveUnknown} disabled={!!busy}>
              核查派发结果
            </Button>
          }
        />
      )}
      {check?.validated && (
        <Alert
          type="success"
          message="整批校验通过，可以确认派发。"
          className="task-inline-error"
        />
      )}
      {check?.issues.map((issue, i) => (
        <Alert
          key={i}
          type="error"
          className="task-inline-error"
          message={issue.task_codes.join("、") + "：" + issue.message}
        />
      ))}
      <Table
        loading={loading}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        size="small"
        scroll={{ x: 850 }}
        columns={[
          col(
            "任务 / 线路",
            "code",
            (_, r) => (
              <div className="task-two-lines">
                <strong>{r.code}</strong>
                <small>
                  {r.origin} → {r.destination}
                </small>
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
                <small>{r.driver_name}</small>
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
            { width: 150 },
          ),
          col("运量（吨）", "quantity_kg", tonnes, { width: 95 }),
          col(
            "补能安排",
            "plan",
            (_, r) =>
              (r.plan?.charging_events || []).length
                ? `${r.plan.charging_events.length} 次 · ${[...new Set(r.plan.charging_events.map((e) => a.boot.stations.find((s) => s.id === (e.station_id || r.station_id))?.name || "场站待核实"))].join("、")}`
                : "无需补能",
            { width: 160 },
          ),
          col(
            "核对",
            "status",
            (_, r) => (
              <span
                className={
                  r.status !== "待派发" || r.requires_resimulation
                    ? "task-attention"
                    : ""
                }
              >
                {r.status !== "待派发"
                  ? "状态已变化"
                  : r.requires_resimulation
                    ? "需重新测算"
                    : check?.issues.some((i) => i.task_ids.includes(r.id))
                      ? "存在冲突"
                      : check?.validated
                        ? "通过"
                        : "待校验"}
              </span>
            ),
            { width: 100 },
          ),
        ]}
      />
    </Drawer>
  );
}
