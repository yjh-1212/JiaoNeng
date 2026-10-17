import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  Drawer,
  Tabs,
  Descriptions,
  Alert,
  Spin,
  Empty,
  Timeline,
  Tag,
} from "antd";
import { useApp } from "./context";
import { request } from "./api";
import { format, time, Pill } from "./ui";
import { EnergyForm, field, iso, localTime } from "./energy-panels";

export const safetyParams = (query) =>
  new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== "" && v != null),
  ).toString();
export function useSafety(path, query, revision = 0) {
  const a = useApp(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    seq = useRef(0);
  useEffect(() => {
    const ticket = ++seq.current;
    setBusy(true);
    setError("");
    request(path + (query ? "?" + safetyParams(query) : ""))
      .then((r) => {
        if (ticket === seq.current) setData(r);
      })
      .catch((e) => {
        if (ticket === seq.current) setError(e.message);
      })
      .finally(() => {
        if (ticket === seq.current) setBusy(false);
      });
    return () => {
      seq.current++;
    };
  }, [path, JSON.stringify(query), a.revision, revision]);
  return { data, error, busy };
}
export function SafetyLink({
  task,
  order,
  plan,
  station,
  label = "查看关联异常",
}) {
  const a = useApp(),
    q = { task, order, plan, station },
    r = useSafety("/api/safety/incidents", { ...q, pageSize: 1 });
  return (
    <Button
      onClick={() =>
        a.go("alerts", {
          task_id: task,
          order_id: order,
          plan_id: plan,
          station_id: station,
        })
      }
    >
      {label}
      {r.data ? "（" + r.data.counts.open + "待处理）" : ""}
    </Button>
  );
}
export function incidentForm(a, options, initial = {}) {
  return {
    title: "登记异常",
    initial: {
      severity: "待核实",
      owner_id:
        a.boot.organizations.length === 1
          ? a.boot.organizations[0].id
          : undefined,
      ...initial,
    },
    onChange: (changed, all, form) => {
      if (changed.owner_id) {
        form.setFieldsValue({
          task_ids: [],
          plan_ids: [],
          vehicle_id: undefined,
          station_id: undefined,
          device_id: undefined,
        });
      }
    },
    fields: (v) => {
      const pick = (resource) =>
        (options?.[resource] || [])
          .filter((r) => !v.owner_id || r.owner_id === v.owner_id)
          .map((r) => ({
            value: r.id,
            label: r.code + (r.name && r.name !== r.code ? " · " + r.name : ""),
          }));
      return [
        field("owner_id", "业务主体", "select", {
          options: a.boot.organizations.map((o) => ({
            value: o.id,
            label: o.name,
          })),
        }),
        field("incident_type", "异常类型", "select", {
          options: (options?.types || []).map((v) => ({ value: v, label: v })),
        }),
        field("severity", "关注等级", "select", {
          options: ["待核实", "一般", "较高", "紧急"].map((v) => ({
            value: v,
            label: v,
          })),
        }),
        field("task_ids", "关联运输任务", "select", {
          required: false,
          multiple: true,
          options: pick("tasks"),
        }),
        field("plan_ids", "关联补能计划", "select", {
          required: false,
          multiple: true,
          options: pick("charging"),
        }),
        field("vehicle_id", "关联车辆", "select", {
          required: false,
          options: pick("vehicles"),
        }),
        field("station_id", "关联场站", "select", {
          required: false,
          options: pick("stations"),
        }),
        field("device_id", "关联设备工位", "select", {
          required: false,
          options: (options?.devices || [])
            .filter(
              (d) =>
                (!v.owner_id || d.owner_id === v.owner_id) &&
                (!v.station_id || d.station_id === v.station_id),
            )
            .map((d) => ({ value: d.id, label: d.name })),
        }),
        field("report", "异常情况", "textarea"),
        field("evidence", "现场凭证或依据", "textarea", { required: false }),
      ];
    },
    submit: async (v, version, key) => {
      const r = await a.execute("incident.report", null, v, key);
      if (r.merged) a.message.info("已合并至未关闭的同类异常，原报告保留");
      return r;
    },
  };
}
export function SafetyReplanContext({ orderId, available }) {
  const a = useApp(),
    params = new URLSearchParams(location.hash.split("?")[1] || ""),
    id = params.get("incident_id"),
    r = useSafety(
      "/api/safety/incidents/" + encodeURIComponent(id || "missing"),
    ),
    [open, setOpen] = useState(false);
  if (!id || !r.data || !r.data.orders.some((o) => o.id === orderId))
    return null;
  const row = r.data;
  return (
    <>
      <Alert
        type="warning"
        showIcon
        title={
          "异常关联试算 · 订单当前可组织余量 " +
          format((available || 0) / 1000) +
          " 吨"
        }
        action={<Button onClick={() => setOpen(true)}>核对受影响任务</Button>}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="异常与运输安排核对"
        width={600}
      >
        <p>
          {row.code} · {row.name}
        </p>
        {row.tasks
          .filter((t) => t.order_id === orderId)
          .map((t) => (
            <section key={t.id} className="safety-note">
              <b>
                {t.code} · {t.status}
              </b>
              <p>
                任务计划 {format(t.quantity_kg / 1000)} 吨，已核验{" "}
                {format(t.verified_kg / 1000)} 吨。
              </p>
              <p>
                开始 {time(t.start_at)}，要求完成 {time(t.finish_at)}。
              </p>
              <Button onClick={() => a.go("tasks", { task_id: t.id })}>
                核对并调整任务
              </Button>
            </section>
          ))}
        <p>
          先核实有效位置、电量、已执行车次及补能事实。当前试算按订单可组织余量计算，已派发任务仍占用原计划运量；需要释放未执行安排时，在运输任务中确认处理。
        </p>
        <Button onClick={() => a.go("alerts", { incident_id: id })}>
          返回异常处置
        </Button>
      </Drawer>
    </>
  );
}
export function IncidentDrawer({ id, onClose }) {
  const a = useApp(),
    [bump, setBump] = useState(0),
    r = useSafety(
      "/api/safety/incidents/" + encodeURIComponent(id),
      null,
      bump,
    ),
    options = useSafety("/api/safety/options", null),
    [form, setForm] = useState(null),
    [tab, setTab] = useState("detail"),
    row = r.data;
  const launch = (type, title) => {
    const assign =
      options.data?.assignees
        .filter((u) => u.scopes.includes(row.owner_id))
        .map((u) => ({ value: u.id, label: u.name })) || [];
    const common = [
      field(
        "note",
        ["incident.close", "incident.return"].includes(type)
          ? "核验依据"
          : "处理措施 / 情况说明",
        "textarea",
      ),
    ];
    const fields =
      type === "incident.link"
        ? [
            field("task_ids", "补充关联任务", "select", {
              multiple: true,
              required: false,
              options: (options.data?.tasks || [])
                .filter((t) => t.owner_id === row.owner_id)
                .map((t) => ({ value: t.id, label: t.code })),
            }),
            field("plan_ids", "补充关联补能计划", "select", {
              multiple: true,
              required: false,
              options: (options.data?.charging || [])
                .filter(
                  (p) =>
                    p.owner_id === row.owner_id &&
                    (!row.station_id || p.station_id === row.station_id),
                )
                .map((p) => ({ value: p.id, label: p.code })),
            }),
            ...common,
          ]
        : ["incident.accept", "incident.transfer"].includes(type)
          ? [
              field("assignee_id", "处理人", "select", { options: assign }),
              field("due_at", "要求反馈时间", "datetime"),
              ...common,
              field("instruction", "司机执行要求", "textarea", {
                required: false,
              }),
            ]
          : type === "incident.resolve"
            ? [
                field("note", "实际处理结果", "textarea"),
                field("recovery", "恢复情况", "select", {
                  options: ["已恢复", "误报已核实"].map((v) => ({
                    value: v,
                    label: v,
                  })),
                }),
                field("proof", "处理结果凭证", "textarea"),
                field("public_summary", "司机可见结果", "textarea", {
                  required: false,
                }),
              ]
            : type === "incident.close"
              ? [
                  ...common,
                  field("responsibility_resolved", "现场及在途责任", "select", {
                    options: [
                      { value: "yes", label: "已核实，相关责任已处理" },
                    ],
                  }),
                ]
              : type === "incident.update"
                ? [
                    ...common,
                    field("instruction", "司机执行要求", "textarea", {
                      required: false,
                    }),
                  ]
                : common;
    setForm({
      title,
      resource: "alerts",
      row,
      fields,
      submitLabel: title,
      initial: {
        assignee_id: row.assignee_id,
        due_at: localTime(row.due_at || Date.now() + 3600000),
        instruction: row.instruction || "",
      },
      submit: (v, version, key) =>
        a.execute(
          type,
          row.id,
          {
            ...v,
            due_at: v.due_at ? iso(v.due_at) : undefined,
            responsibility_resolved: v.responsibility_resolved === "yes",
            expected_version: version,
          },
          key,
        ),
    });
  };
  const handoff = (route, draft) => {
    onClose();
    a.go(route, draft);
  };
  return (
    <>
      <Drawer
        open
        title="异常详情"
        width={650}
        className="safety-incident-drawer"
        onClose={onClose}
        footer={
          row && a.can("alert.write") ? (
            <div className="safety-drawer-actions">
              {["pending", "working", "verify"].includes(row.stage) && (
                <Button onClick={() => launch("incident.transfer", "转交处理")}>
                  转交处理
                </Button>
              )}
              {row.stage === "pending" && (
                <Button
                  type="primary"
                  onClick={() => launch("incident.accept", "受理并指派")}
                >
                  受理并指派
                </Button>
              )}
              {row.stage === "working" && (
                <>
                  <Button onClick={() => launch("incident.update", "补充进展")}>
                    补充进展
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => launch("incident.resolve", "提交核验")}
                  >
                    提交核验
                  </Button>
                </>
              )}
              {row.stage === "verify" && (
                <>
                  <Button onClick={() => launch("incident.return", "退回补充")}>
                    退回补充
                  </Button>
                  <Button
                    type="primary"
                    onClick={() => launch("incident.close", "核验关闭")}
                  >
                    核验关闭
                  </Button>
                </>
              )}
              {row.stage === "closed" && (
                <Button onClick={() => launch("incident.reopen", "重新受理")}>
                  重新受理
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {r.error && (
          <Alert
            type="error"
            title={r.error}
            action={<Button onClick={() => setBump((n) => n + 1)}>重试</Button>}
          />
        )}
        {r.busy && !row ? (
          <Spin />
        ) : (
          row && (
            <>
              <div className="safety-incident-identity">
                <strong>{row.code}</strong>
                <Tag
                  color={
                    ["较高", "紧急", "重要"].includes(row.severity)
                      ? "red"
                      : "gold"
                  }
                >
                  {row.severity}
                </Tag>
                <Pill>{row.status_label}</Pill>
              </div>
              <h3>{row.name}</h3>
              <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                  { key: "detail", label: "处置详情" },
                  { key: "history", label: "处理记录" },
                ]}
              />
              {tab === "history" ? (
                row.history.length ? (
                  <Timeline
                    items={row.history.map((h) => ({
                      key: h.id,
                      children: (
                        <div>
                          <b>
                            {time(h.at)} · {h.label}
                          </b>
                          <p>
                            {h.actor} · {h.note}
                          </p>
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <Empty description="历史事件未记录逐步明细，原始报告与依据保留" />
                )
              ) : (
                <>
                  <Descriptions
                    column={2}
                    size="small"
                    items={[
                      {
                        key: "source",
                        label: "来源",
                        children: row.kind || row.source_label,
                      },
                      {
                        key: "at",
                        label: "发生时间",
                        children: time(row.created_at),
                      },
                      {
                        key: "assignee",
                        label: "处理人",
                        children: row.assignee || "待指派",
                      },
                      {
                        key: "due",
                        label: "要求反馈",
                        children: (
                          <span className={row.overdue ? "safety-danger" : ""}>
                            {time(row.due_at)}
                            {row.overdue ? " · 已超时" : ""}
                          </span>
                        ),
                      },
                      {
                        key: "device",
                        label: "关联对象",
                        children:
                          row.device_name ||
                          row.station_name ||
                          row.vehicle_code ||
                          row.object ||
                          "待核实",
                      },
                    ]}
                  />
                  <section>
                    <h4>异常情况</h4>
                    <p className="safety-note">
                      {row.report || row.reason || row.trigger || "等待核实"}
                    </p>
                    {row.evidence && <small>原始依据：{row.evidence}</small>}
                  </section>
                  <section>
                    <h4>受影响业务</h4>
                    <div className="safety-references">
                      {row.orders.map((o) => (
                        <div key={o.id}>
                          <span>运输订单</span>
                          <Button
                            type="link"
                            onClick={() => a.showDetail("orders", o.id)}
                          >
                            {o.code}
                          </Button>
                        </div>
                      ))}
                      {row.tasks.map((t) => (
                        <div key={t.id}>
                          <span>运输任务</span>
                          <Button
                            type="link"
                            onClick={() => a.showDetail("tasks", t.id)}
                          >
                            {t.code}
                          </Button>
                          <small>{t.status}</small>
                        </div>
                      ))}
                      {row.plans.map((p) => (
                        <div key={p.id}>
                          <span>补能计划</span>
                          <Button
                            type="link"
                            onClick={() =>
                              handoff("charging", {
                                task_id: p.task_id,
                                plan_id: p.id,
                                station_id: p.station_id,
                              })
                            }
                          >
                            {p.code}
                          </Button>
                        </div>
                      ))}
                      {!row.tasks.length && !row.plans.length && (
                        <small>尚未关联运输任务或补能计划</small>
                      )}
                    </div>
                    <div className="safety-impact">
                      <Tag>涉及任务 {row.tasks.length} 个</Tag>
                      {row.planned_kg > 0 && (
                        <Tag color="gold">
                          任务计划 {format(row.planned_kg / 1000)} 吨
                        </Tag>
                      )}
                      <Tag>交付影响待核实</Tag>
                    </div>
                    {row.potential_plans?.length > 0 && (
                      <p className="muted">
                        待核实关联：
                        {row.potential_plans.map((p) => p.code).join("、")}
                      </p>
                    )}
                    {a.can("alert.write") && row.stage !== "closed" && (
                      <Button
                        size="small"
                        disabled={!options.data}
                        onClick={() => launch("incident.link", "核对关联业务")}
                      >
                        核对关联业务
                      </Button>
                    )}
                  </section>
                  <section>
                    <h4>处理安排</h4>
                    <p>{row.measures || "等待受理核实"}</p>
                    <div className="safety-action-links">
                      {row.plans.length > 0 && (
                        <Button
                          onClick={() =>
                            handoff("charging", {
                              task_id: row.tasks[0]?.id,
                              station_id: row.station_id,
                            })
                          }
                        >
                          调整补能
                        </Button>
                      )}
                      {row.tasks.length > 0 && (
                        <Button
                          onClick={() => a.showDetail("tasks", row.tasks[0].id)}
                        >
                          查看任务
                        </Button>
                      )}
                      {row.orders.map((o) => (
                        <Button
                          key={o.id}
                          disabled={!a.can("simulation.run")}
                          onClick={() =>
                            handoff("simulation", {
                              order_id: o.id,
                              fresh: true,
                              incident_id: row.id,
                              task_id: row.tasks.find(
                                (t) => t.order_id === o.id,
                              )?.id,
                              safety_review: true,
                            })
                          }
                        >
                          重新推演{row.orders.length > 1 ? " · " + o.code : ""}
                        </Button>
                      ))}
                      {row.station_id && (
                        <Button
                          onClick={() =>
                            handoff("stations", { station_id: row.station_id })
                          }
                        >
                          查看场站
                        </Button>
                      )}
                    </div>
                  </section>
                  {row.instruction && (
                    <section>
                      <h4>司机执行要求</h4>
                      <p className="safety-note">{row.instruction}</p>
                      <small>
                        要求版本 {row.instruction_revision} · 已确认司机{" "}
                        {
                          (row.expected_driver_ids || []).filter(
                            (id) =>
                              row.driver_receipts?.[id]?.revision ===
                              row.instruction_revision,
                          ).length
                        }{" "}
                        人 · 页面确认记录
                      </small>
                    </section>
                  )}
                  <section>
                    <h4>处置进展</h4>
                    {row.history.length ? (
                      <Timeline
                        items={row.history.slice(-4).map((h) => ({
                          key: h.id,
                          children: (
                            <div>
                              <b>
                                {time(h.at)} · {h.label}
                              </b>
                              <p>
                                {h.actor} · {h.note}
                              </p>
                            </div>
                          ),
                        }))}
                      />
                    ) : (
                      <p className="muted">
                        历史事件无逐步记录；可查看原始依据
                      </p>
                    )}
                  </section>
                  {(row.driver_feedback || []).length > 0 && (
                    <section>
                      <h4>司机反馈</h4>
                      {row.driver_feedback.map((f, i) => (
                        <p key={i}>
                          {time(f.at)} · {f.report}
                        </p>
                      ))}
                    </section>
                  )}
                  {row.result && (
                    <section>
                      <h4>处理结果</h4>
                      <Tag color="green">{row.result.recovery}</Tag>
                      <p>{row.result.summary}</p>
                      <small>凭证：{row.result.evidence}</small>
                    </section>
                  )}
                  {row.verification && (
                    <section>
                      <h4>核验结果</h4>
                      <p>{row.verification.evidence}</p>
                      <small>{time(row.verification.at)}</small>
                    </section>
                  )}
                  <div className="safety-source">
                    <Pill>{row.source_label || "测算资料"}</Pill>
                    <small>版本 {row.version}</small>
                    <Button size="small" onClick={() => setBump((n) => n + 1)}>
                      刷新详情
                    </Button>
                  </div>
                </>
              )}
            </>
          )
        )}
      </Drawer>
      {form && (
        <EnergyForm
          key={form.title}
          config={form}
          onClose={() => setForm(null)}
          onDone={() => setBump((n) => n + 1)}
        />
      )}
    </>
  );
}
